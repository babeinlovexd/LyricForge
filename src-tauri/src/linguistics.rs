use crate::dictionary;
use hyphenation::{Standard, Language, Load};
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct RhymeAnalysisResult {
    pub matches: Vec<HighlightMatch>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HighlightMatch {
    pub word: String,
    pub start: usize,
    pub end: usize,
    pub match_type: String, // "moss-green", "light-green", "yellow", "purple"
    pub group_id: usize,
    pub partners: Vec<RhymePartner>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RhymePartner {
    pub start: usize,
    pub match_type: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RhymeWord {
    pub word: String,
    pub lang: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RhymeResultGrouped {
    pub syllables: usize,
    pub words: Vec<RhymeWord>,
}

lazy_static::lazy_static! {
    static ref EN_DICT: Standard = Standard::from_embedded(Language::EnglishUS).unwrap();
    static ref DE_DICT: Standard = Standard::from_embedded(Language::German1996).unwrap();
}

pub fn count_syllables_word(word: &str, lang: &str) -> usize {
    if word.is_empty() { return 0; }
    let language = lang.to_lowercase();
    let lang = language.as_str();
    // 1. Try to get exact syllable count from SQLite
    if let Some(attrs) = dictionary::get_word_attributes(word, lang) {
        if attrs.syllables > 0 {
            return attrs.syllables;
        }
    }

    // 2. Fallback to hyphenation
    let dict = match lang {
        "en" => &*EN_DICT,
        "de" => &*DE_DICT,
        _ => return Regex::new(r"(?i)[aeiouyäöü]+").unwrap().find_iter(word).count().max(1),
    };
    use hyphenation::Hyphenator;
    let hyphenated = dict.hyphenate(word);
    let iter = hyphenated.into_iter();
    let syllables = iter.segments().count();

    // 3. Last resort fallback heuristic
    if syllables == 0 && !word.is_empty() {
        let re = Regex::new(r"(?i)[aeiouyäöü]+").unwrap();
        let matches = re.find_iter(word).count();
        if matches == 0 { 1 } else { matches }
    } else {
        syllables
    }
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct SyllableCount {
    pub min: usize,
    pub max: usize,
    pub estimated: bool,
}

// Strong local clues decide between known pronunciations, never the dictionary order.
fn language_clue(word: &str) -> (usize, usize) {
    match word.to_lowercase().as_str() {
        "ich" | "du" | "der" | "das" | "und" | "ist" | "nicht" | "mein" | "meine" | "deine" | "wir" | "mit" | "für" => (3, 0),
        "the" | "this" | "that" | "these" | "those" | "and" | "is" | "are" | "you" | "your" | "my" | "with" | "for" => (0, 3),
        _ => (0, 0),
    }
}

#[tauri::command]
pub fn calculate_syllables(text: &str, lang: &str) -> Vec<SyllableCount> {
    dictionary::init_db_local();
    let re = Regex::new(r"[\p{L}]+(?:['’][\p{L}]+)*").unwrap();
    let language = lang.to_lowercase();
    text.split('\n').map(|line| {
        let words: Vec<_> = re.find_iter(line).map(|m| m.as_str()).collect();
        let attrs: Vec<_> = words.iter().map(|w| (
            dictionary::get_word_attributes(w, "de"), dictionary::get_word_attributes(w, "en")
        )).collect();
        let clues: Vec<_> = words.iter().zip(&attrs).map(|(word, (de, en))| {
            let clue = language_clue(word);
            if clue != (0, 0) { clue } else {
                match (de, en) { (Some(_), None) => (1,0), (None, Some(_)) => (0,1), _ => (0,0) }
            }
        }).collect();
        let mut result = SyllableCount { min: 0, max: 0, estimated: false };
        for (i, word) in words.iter().enumerate() {
            let (de, en) = &attrs[i];
            let available = |a: &Option<dictionary::WordAttributes>| a.as_ref().map(|a| a.syllables).filter(|n| *n > 0);
            let (de, en) = (available(de), available(en));
            let mut counts = match language.as_str() {
                "de" => de.into_iter().collect::<Vec<_>>(),
                "en" => en.into_iter().collect::<Vec<_>>(),
                _ => match (de, en) {
                    (Some(d), Some(e)) if d != e => {
                        let (mut dv, mut ev) = (0, 0);
                        for (j, (d, e)) in clues.iter().enumerate() {
                            if i != j && i.abs_diff(j) <= 3 { dv += d; ev += e; }
                        }
                        if dv > ev { result.estimated = true; vec![d] }
                        else if ev > dv { result.estimated = true; vec![e] }
                        else { vec![d, e] }
                    },
                    _ => de.into_iter().chain(en).collect(),
                },
            };
            if counts.is_empty() {
                counts.push(count_syllables_word(word, &language));
                result.estimated = true;
            }
            result.min += counts.iter().min().unwrap();
            result.max += counts.iter().max().unwrap();
        }
        result
    }).collect()
}

// Complete nuclei (including diphthongs and length) are delimited by the importer.
// A missing delimiter in legacy data is treated conservatively as one whole key.
fn vowel_match(v1: &str, v2: &str) -> Option<(&'static str, u8)> {
    let a: Vec<_> = v1.split('|').filter(|s| !s.is_empty()).collect();
    let b: Vec<_> = v2.split('|').filter(|s| !s.is_empty()).collect();
    if a.is_empty() || b.is_empty() { return None; }
    if a == b && a.len() > 1 { Some(("purple", 2)) }
    else if a[0] == b[0] { Some(("yellow", 1)) }
    else { None }
}

#[tauri::command]
pub fn analyze_rhymes(text: &str, lang: &str) -> RhymeAnalysisResult {
    dictionary::init_db_local(); // Fallback for tests if needed, but normally init_db is called in setup

    let re = Regex::new(r"[\p{L}]+(?:['’][\p{L}]+)*").unwrap();

    let mut word_matches = Vec::new();
    for mat in re.find_iter(text) {
        word_matches.push(mat);
    }

    // JavaScript and ProseMirror positions use UTF-16 code units.
    let mut current_char_idx = 0;
    let mut byte_to_char = std::collections::HashMap::new();
    for (b_idx, ch) in text.char_indices() {
        byte_to_char.insert(b_idx, current_char_idx);
        current_char_idx += ch.len_utf16();
    }
    // and for end of string
    byte_to_char.insert(text.len(), current_char_idx);

    // Extract line ends for priority highlighting
    let mut line_end_indices = std::collections::HashSet::new();
    let mut line_offset = 0;

    for line in text.split('\n') {
        if let Some(mat) = re.find_iter(line).last() {
            let absolute_start = line_offset + mat.start();
            for (idx, w_match) in word_matches.iter().enumerate() {
                if w_match.start() == absolute_start {
                    line_end_indices.insert(idx);
                    break;
                }
            }
        }
        line_offset += line.len() + 1; // +1 für '\n'
    }

    // Stop words to ignore for standalone matches
    let stop_words = vec!["der", "die", "das", "ein", "eine", "in", "im", "den", "dem", "mich", "und", "oder", "ist", "sind", "ich", "du", "er", "sie", "es", "wir", "ihr"];

    // Map words to lines to check distance (max 4 lines)
    let lines: Vec<&str> = text.split('\n').collect();
    let mut word_to_line = std::collections::HashMap::new();
    let mut current_line = 0;
    let mut current_line_offset = 0;

    for (idx, w_match) in word_matches.iter().enumerate() {
        while current_line < lines.len() {
            let line_len = lines[current_line].len();
            if w_match.start() >= current_line_offset && w_match.start() <= current_line_offset + line_len {
                word_to_line.insert(idx, current_line);
                break;
            }
            current_line_offset += line_len + 1; // +1 for \n
            current_line += 1;
        }
    }

    let mut all_matches: Vec<HighlightMatch> = Vec::new();
    let mut direct: Vec<std::collections::BTreeMap<usize, (u8, String)>> = vec![std::collections::BTreeMap::new(); word_matches.len()];
    let mut parents: Vec<usize> = (0..word_matches.len()).collect();

    // Fetch both DE and EN attributes for multi-language evaluation
    let word_attrs: Vec<(Option<dictionary::WordAttributes>, Option<dictionary::WordAttributes>)> = word_matches
        .iter()
        .map(|m| {
            let w = m.as_str();
            let lang_lower = lang.to_lowercase();
            if lang_lower == "auto" || lang_lower == "alle" || lang_lower.is_empty() {
                (
                    dictionary::get_word_attributes(w, "de"),
                    dictionary::get_word_attributes(w, "en"),
                )
            } else if lang_lower == "de" {
                (dictionary::get_word_attributes(w, "de"), None)
            } else {
                (None, dictionary::get_word_attributes(w, "en"))
            }
        })
        .collect();

    // Track the highest priority match for each word: priority 4 (moss-green) > 3 (light-green) > 2 (purple) > 1 (yellow)
    let mut best_matches: std::collections::HashMap<usize, (u8, HighlightMatch)> = std::collections::HashMap::new();

    if word_matches.len() > 1 {
        // Compare every pair to find rhymes
        for i in 0..word_matches.len() {
            for j in (i+1)..word_matches.len() {

                // Enforce max 4 lines distance
                let line_i = *word_to_line.get(&i).unwrap_or(&0) as i32;
                let line_j = *word_to_line.get(&j).unwrap_or(&0) as i32;
                if (line_j - line_i).abs() > 4 {
                    continue; // Skip if too far apart
                }

                let w1 = word_matches[i].as_str();
                let w2 = word_matches[j].as_str();

                // Identische Wörter ausschließen (Wortwiederholungen sind keine Reime)
                if w1.eq_ignore_ascii_case(w2) {
                    continue;
                }

                let is_stop_word = stop_words.contains(&w1.to_lowercase().as_str()) || stop_words.contains(&w2.to_lowercase().as_str());
                let start1 = *byte_to_char.get(&word_matches[i].start()).unwrap_or(&0);
                let end1 = *byte_to_char.get(&word_matches[i].end()).unwrap_or(&0);
                let start2 = *byte_to_char.get(&word_matches[j].start()).unwrap_or(&0);
                let end2 = *byte_to_char.get(&word_matches[j].end()).unwrap_or(&0);

                let (de1, en1) = &word_attrs[i];
                let (de2, en2) = &word_attrs[j];

                // Build candidate pairs (e.g. DE vs DE, EN vs EN)
                let mut candidates = Vec::new();
                if let (Some(a1), Some(a2)) = (de1, de2) { candidates.push((a1, a2)); }
                if let (Some(a1), Some(a2)) = (en1, en2) { candidates.push((a1, a2)); }

                for (attr1, attr2) in candidates {
                    let r1 = &attr1.rhyme_part;
                    let r2 = &attr2.rhyme_part;

                    if !r1.is_empty() && !r2.is_empty() {
                        let is_pure = r1 == r2;
                        let v1 = &attr1.vowels_clean;
                        let v2 = &attr2.vowels_clean;

                        let is_end_rhyme_i = line_end_indices.contains(&i);
                        let is_end_rhyme_j = line_end_indices.contains(&j);
                        let is_end_rhyme = is_end_rhyme_i && is_end_rhyme_j;

                        let mut match_type_found = None;
                        let mut priority = 0;

                        // Priority:
                        // 4: Pure end rhyme (moss-green)
                        // 3: Pure internal rhyme (light-green)
                        // 2: Multi-syllable vocal harmony / Vokalklang (purple)
                        // 1: Assonance (yellow)
                        if is_pure && (!is_stop_word || is_end_rhyme) {
                            if is_end_rhyme {
                                match_type_found = Some("moss-green".to_string());
                                priority = 4;
                            } else {
                                match_type_found = Some("light-green".to_string());
                                priority = 3;
                            }
                        } else if !is_pure && !is_stop_word {
                            if let Some((kind, strength)) = vowel_match(v1, v2) {
                                match_type_found = Some(kind.to_string());
                                priority = strength;
                            }
                        }

                        if let Some(mt) = match_type_found {
                            // Only exact rhymes form stable groups. Hover follows direct edges.
                            if is_pure {
                                let root_i = root(&parents, i);
                                let root_j = root(&parents, j);
                                parents[root_j] = root_i;
                            }
                            for (from, to) in [(i, j), (j, i)] {
                                if direct[from].get(&to).map(|(p, _)| *p).unwrap_or(0) < priority {
                                    direct[from].insert(to, (priority, mt.clone()));
                                }
                            }

                            let match1 = HighlightMatch {
                                word: w1.to_string(),
                                start: start1,
                                end: end1,
                                match_type: mt.clone(),
                                group_id: i,
                                partners: Vec::new(),
                            };
                            let match2 = HighlightMatch {
                                word: w2.to_string(),
                                start: start2,
                                end: end2,
                                match_type: mt.clone(),
                                group_id: j,
                                partners: Vec::new(),
                            };

                            let current_best_1 = best_matches.get(&start1).map(|(p, _)| *p).unwrap_or(0);
                            if priority > current_best_1 {
                                best_matches.insert(start1, (priority, match1));
                            }

                            let current_best_2 = best_matches.get(&start2).map(|(p, _)| *p).unwrap_or(0);
                            if priority > current_best_2 {
                                best_matches.insert(start2, (priority, match2));
                            }
                        }
                    }
                }
            }
        }
    }

    for (_, (_, mut m)) in best_matches {
        m.partners = direct[m.group_id].iter().map(|(other, (_, kind))| RhymePartner {
            start: byte_to_char[&word_matches[*other].start()], match_type: kind.clone(),
        }).collect();
        m.group_id = root(&parents, m.group_id) + 1;
        all_matches.push(m);
    }

    // Ensure matches are sorted by start index
    all_matches.sort_by_key(|m| m.start);

    RhymeAnalysisResult {
        matches: all_matches
    }
}

#[tauri::command]
pub fn add_custom_word(new_word: &str, pattern_word: &str, lang: &str) -> Result<String, String> {
    match crate::dictionary::add_custom_word(new_word, pattern_word, lang) {
        Ok(_) => Ok(format!("Wort '{}' erfolgreich hinzugefügt.", new_word)),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn find_rhymes_for_word(word: &str, mode: &str, lang: &str) -> Vec<RhymeResultGrouped> {
    dictionary::init_db_local();

    let rhymes = dictionary::get_all_rhymes(word, mode, lang);

    // Group by syllables
    let mut grouped = std::collections::HashMap::new();
    for (rhyme_word, rhyme_lang) in rhymes {
        let syllables = count_syllables_word(&rhyme_word, &rhyme_lang);
        grouped.entry(syllables).or_insert(Vec::new()).push(RhymeWord {
            word: rhyme_word,
            lang: rhyme_lang,
        });
    }

    let mut result = Vec::new();
    for (syllables, words) in grouped {
        // Alternate languages so the DE query cannot crowd out EN in "Alle".
        let mut languages: std::collections::BTreeMap<String, std::collections::VecDeque<RhymeWord>> = std::collections::BTreeMap::new();
        for word in words { languages.entry(word.lang.clone()).or_default().push_back(word); }
        let mut limited_words = Vec::new();
        while limited_words.len() < 50 {
            let before = limited_words.len();
            for queue in languages.values_mut() {
                if limited_words.len() == 50 { break; }
                if let Some(word) = queue.pop_front() { limited_words.push(word); }
            }
            if limited_words.len() == before { break; }
        }
        result.push(RhymeResultGrouped {
            syllables,
            words: limited_words,
        });
    }

    result.sort_by_key(|r| r.syllables);
    result
}

fn root(parents: &[usize], mut index: usize) -> usize {
    while parents[index] != index { index = parents[index]; }
    index
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rhyme_groups_and_utf16_offsets() {
        let result = analyze_rhymes("😀 Haus\nMaus\nraus", "de");
        assert_eq!(result.matches.len(), 3);
        assert_eq!(result.matches[0].start, 3);
        assert_eq!(result.matches[0].end, 7);
        assert!(result.matches.iter().all(|m| m.group_id == result.matches[0].group_id));
    }
    #[test]
    fn language_filters_and_unknown_words() {
        dictionary::init_db_local();
        assert!(dictionary::get_word_attributes("zzqxxunknown", "auto").is_none());
        assert!(analyze_rhymes("zzqxxunknown zzqxxother", "auto").matches.is_empty());
        for lang in ["de", "en"] {
            for group in find_rhymes_for_word(if lang == "de" { "Haus" } else { "night" }, "rein", lang) {
                assert!(group.words.iter().all(|w| w.lang.to_lowercase() == lang));
            }
        }
        assert!(!find_rhymes_for_word("Haus", "rein", "de").is_empty());
        assert!(!find_rhymes_for_word("night", "rein", "en").is_empty());
    }
    #[test]
    fn syllables_empty_lines_and_repetition() {
        dictionary::init_db_local();
        assert_eq!(calculate_syllables("Haus\n\nMaus", "de").iter().map(|n| n.min).collect::<Vec<_>>(), vec![1, 0, 1]);
        assert_eq!(calculate_syllables("night light", "en")[0].min, 2);
        assert_eq!(count_syllables_word("", "auto"), 0);
        assert_eq!(count_syllables_word("banana", "unknown"), 3);
        assert!(analyze_rhymes("Haus Haus", "de").matches.is_empty());
        assert!(analyze_rhymes("Haus\n\n\n\n\nMaus", "de").matches.is_empty());
    }
    #[test]
    fn compare_complete_stressed_nuclei() {
        assert_eq!(vowel_match("uː", "oː"), None);
        assert_eq!(vowel_match("aɪ", "ɔɪ"), None);
        assert_eq!(vowel_match("aː|ə", "oː|ə"), None);
        assert_eq!(vowel_match("aː|ə", "aː|ɪ"), Some(("yellow", 1)));
        assert_eq!(vowel_match("aː|ə", "aː|ə"), Some(("purple", 2)));
        assert!(analyze_rhymes("gut rot", "de").matches.is_empty());
    }

    #[test]
    fn bilingual_syllables_use_context_or_show_uncertainty() {
        assert_eq!(calculate_syllables("mine", "auto")[0], SyllableCount { min: 1, max: 2, estimated: false });
        let english = calculate_syllables("This is mine", "auto");
        assert_eq!((english[0].min, english[0].max), (3, 3));
        let mixed = calculate_syllables("Das ist meine Mine\nThis is mine", "auto");
        assert_eq!((mixed[0].min, mixed[0].max), (6, 6));
        assert_eq!((mixed[1].min, mixed[1].max), (3, 3));
        assert_eq!(calculate_syllables("", "auto")[0], SyllableCount { min: 0, max: 0, estimated: false });
    }

    #[test]
    fn internal_vs_end_rhyme_classification() {
        dictionary::init_db_local();
        {
            let conn = dictionary::DB_CONN.get().unwrap().lock().unwrap();
            for (word, lang, rhyme, vowels) in [
                ("zzei1", "de", "aus", "au"),
                ("zzei2", "de", "aus", "au"),
                ("zzei3", "de", "aus", "au"),
            ] {
                conn.execute("INSERT OR REPLACE INTO words VALUES (?1, ?2, '', 1, ?3, ?4)", (word, lang, rhyme, vowels)).unwrap();
            }
        }

        // Line 1 ends with zzei1. Line 2 has zzei2 (internal) and zzei3 (end).
        let result = analyze_rhymes("zzei1\nzzei2 and zzei3", "de");
        assert_eq!(result.matches.len(), 3);
        let m1 = result.matches.iter().find(|m| m.word == "zzei1").unwrap();
        let m2 = result.matches.iter().find(|m| m.word == "zzei2").unwrap();
        let m3 = result.matches.iter().find(|m| m.word == "zzei3").unwrap();

        // Rhyme between end-word zzei1 and end-word zzei3 is pure end rhyme (moss-green)
        // Rhyme involving internal-word zzei2 is pure internal rhyme (light-green)
        assert_eq!(m1.match_type, "moss-green");
        assert_eq!(m3.match_type, "moss-green");
        assert_eq!(m2.match_type, "light-green");
    }

    #[test]
    fn apostrophe_words_tokenization() {
        dictionary::init_db_local();
        {
            let conn = dictionary::DB_CONN.get().unwrap().lock().unwrap();
            for (word, lang, rhyme, vowels) in [
                ("don't", "en", "ont", "o"),
                ("won't", "en", "ont", "o"),
            ] {
                conn.execute("INSERT OR REPLACE INTO words VALUES (?1, ?2, '', 1, ?3, ?4)", (word, lang, rhyme, vowels)).unwrap();
            }
        }
        let result = analyze_rhymes("don't\nwon't", "en");
        assert_eq!(result.matches.len(), 2);
        assert_eq!(result.matches[0].word, "don't");
        assert_eq!(result.matches[1].word, "won't");
    }

}
