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
    // 1. Try to get exact syllable count from phonemes (vowel count)
    if let Some(phonemes) = dictionary::get_phonemes(word, lang) {
        let mut count = 0;
        for p in phonemes {
            if p.ends_with('0') || p.ends_with('1') || p.ends_with('2') {
                count += 1;
            }
        }
        if count > 0 {
            return count;
        }
    }

    // 2. Fallback to hyphenation
    let dict = match lang {
        "en" => &*EN_DICT,
        "de" => &*DE_DICT,
        _ => &*DE_DICT, // default to DE
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

#[tauri::command]
pub fn calculate_syllables(text: &str, lang: &str) -> Vec<usize> {
    let mut results = Vec::new();
    let lines = text.split('\n');
    let re = Regex::new(r"[\p{L}]+").unwrap();

    for line in lines {
        let mut line_syllables = 0;
        for caps in re.captures_iter(line) {
            let word = caps.get(0).unwrap().as_str();
            line_syllables += count_syllables_word(word, lang);
        }
        results.push(line_syllables);
    }

    results
}

#[tauri::command]
pub fn analyze_rhymes(text: &str, lang: &str) -> RhymeAnalysisResult {
    dictionary::init_dictionary();

    let re = Regex::new(r"[\p{L}]+").unwrap();

    let mut word_matches = Vec::new();
    for mat in re.find_iter(text) {
        word_matches.push(mat);
    }

    // We need char indices, not byte indices, for JS interop
    let mut current_char_idx = 0;
    let mut byte_to_char = std::collections::HashMap::new();
    for (b_idx, _) in text.char_indices() {
        byte_to_char.insert(b_idx, current_char_idx);
        current_char_idx += 1;
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
    let mut group_counter: usize = 1;

    // Track the highest priority match for each word: priority 4 (moss-green) > 3 (light-green) > 2 (yellow) > 1 (purple)
    // We map start index to (priority, HighlightMatch)
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

                let is_stop_word = stop_words.contains(&w1.to_lowercase().as_str()) || stop_words.contains(&w2.to_lowercase().as_str());
                let start1 = *byte_to_char.get(&word_matches[i].start()).unwrap_or(&0);
                let end1 = *byte_to_char.get(&word_matches[i].end()).unwrap_or(&0);
                let start2 = *byte_to_char.get(&word_matches[j].start()).unwrap_or(&0);
                let end2 = *byte_to_char.get(&word_matches[j].end()).unwrap_or(&0);

                if let (Some(ph1), Some(ph2)) = (dictionary::get_phonemes(w1, lang), dictionary::get_phonemes(w2, lang)) {
                    if let (Some(r1), Some(r2)) = (dictionary::extract_rhyme_part(&ph1), dictionary::extract_rhyme_part(&ph2)) {
                        let is_pure = dictionary::is_pure_rhyme(&r1, &r2);
                        let is_asso = dictionary::is_assonance(&r1, &r2);

                        let vowels1 = dictionary::get_all_vowels(&ph1);
                        let vowels2 = dictionary::get_all_vowels(&ph2);

                        let mut is_vocal = false;
                        if vowels1.len() >= 2 && vowels1 == vowels2 {
                            is_vocal = true;
                        }

                        let is_end_rhyme_i = line_end_indices.contains(&i);
                        let is_end_rhyme_j = line_end_indices.contains(&j);
                        let is_end_rhyme = is_end_rhyme_i && is_end_rhyme_j;

                        let mut match_type_found = None;
                        let mut priority = 0;

                        // Priority: End rhymes must be moss-green if pure. Stop words are only allowed if pure rhyme at line end.
                        if is_pure && (!is_stop_word || is_end_rhyme) {
                            if is_end_rhyme_i || is_end_rhyme_j {
                                match_type_found = Some("moss-green".to_string());
                                priority = 4;
                            } else {
                                match_type_found = Some("light-green".to_string());
                                priority = 3;
                            }
                        } else if is_asso && !is_stop_word {
                             match_type_found = Some("yellow".to_string());
                             priority = 2;
                        } else if is_vocal && !is_stop_word {
                             match_type_found = Some("purple".to_string());
                             priority = 1;
                        }

                        if let Some(mt) = match_type_found {
                            let gid = group_counter;
                            group_counter += 1;

                            let match1 = HighlightMatch {
                                word: w1.to_string(),
                                start: start1,
                                end: end1,
                                match_type: mt.clone(),
                                group_id: gid,
                            };
                            let match2 = HighlightMatch {
                                word: w2.to_string(),
                                start: start2,
                                end: end2,
                                match_type: mt.clone(),
                                group_id: gid,
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

    for (_, (_, m)) in best_matches {
        all_matches.push(m);
    }

    // Ensure matches are sorted by start index
    all_matches.sort_by_key(|m| m.start);

    RhymeAnalysisResult {
        matches: all_matches
    }
}

#[tauri::command]
pub fn find_rhymes_for_word(word: &str, mode: &str, lang: &str) -> Vec<RhymeResultGrouped> {
    dictionary::init_dictionary();

    let rhymes = dictionary::get_all_rhymes(word, mode, lang);

    // Group by syllables
    let mut grouped = std::collections::HashMap::new();
    for (rhyme_word, rhyme_lang) in rhymes {
        let syllables = count_syllables_word(&rhyme_word, lang);
        grouped.entry(syllables).or_insert(Vec::new()).push(RhymeWord {
            word: rhyme_word,
            lang: rhyme_lang,
        });
    }

    let mut result = Vec::new();
    for (syllables, words) in grouped {
        // limit to 50 results per syllable group to prevent UI freeze
        let mut limited_words = words;
        if limited_words.len() > 50 {
            limited_words.truncate(50);
        }
        result.push(RhymeResultGrouped {
            syllables,
            words: limited_words,
        });
    }

    result.sort_by_key(|r| r.syllables);
    result
}
