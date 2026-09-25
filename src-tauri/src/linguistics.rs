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
    pub match_type: String, // "green", "yellow", "purple"
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
    let dict = match lang {
        "en" => &*EN_DICT,
        "de" => &*DE_DICT,
        _ => &*DE_DICT, // default to DE
    };
    use hyphenation::Hyphenator;
    let hyphenated = dict.hyphenate(word);
    let iter = hyphenated.into_iter();
    let syllables = iter.segments().count();
    if syllables == 0 && !word.is_empty() { 1 } else { syllables }
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
pub fn analyze_rhymes(text: &str, _lang: &str) -> RhymeAnalysisResult {
    dictionary::init_dictionary();

    let mut matches = Vec::new();
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
    let lines: Vec<&str> = text.split('\n').collect();
    let mut line_end_indices = std::collections::HashSet::new();
    for line in lines {
        if let Some(mat) = re.find_iter(line).last() {
            // Find this match in the global word_matches list
            for (idx, w_match) in word_matches.iter().enumerate() {
                if w_match.as_str() == mat.as_str() {
                    line_end_indices.insert(idx);
                }
            }
        }
    }

    // Stop words to ignore for standalone matches
    let stop_words = vec!["der", "die", "das", "ein", "eine", "in", "im", "den", "dem", "mich", "und", "oder", "ist", "sind", "ich", "du", "er", "sie", "es", "wir", "ihr"];

    if word_matches.len() > 1 {
        // Compare every pair to find rhymes
        for i in 0..word_matches.len() {
            for j in (i+1)..word_matches.len() {
                let w1 = word_matches[i].as_str();
                let w2 = word_matches[j].as_str();

                let is_stop_word = stop_words.contains(&w1.to_lowercase().as_str()) || stop_words.contains(&w2.to_lowercase().as_str());
                let start1 = *byte_to_char.get(&word_matches[i].start()).unwrap_or(&0);
                let end1 = *byte_to_char.get(&word_matches[i].end()).unwrap_or(&0);
                let start2 = *byte_to_char.get(&word_matches[j].start()).unwrap_or(&0);
                let end2 = *byte_to_char.get(&word_matches[j].end()).unwrap_or(&0);

                if let (Some(ph1), Some(ph2)) = (dictionary::get_phonemes(w1), dictionary::get_phonemes(w2)) {
                    if let (Some(r1), Some(r2)) = (dictionary::extract_rhyme_part(&ph1), dictionary::extract_rhyme_part(&ph2)) {
                        let is_pure = dictionary::is_pure_rhyme(&r1, &r2);
                        let is_asso = dictionary::is_assonance(&r1, &r2);
                        let mut is_vocal = false;
                        if let (Some(v1), Some(v2)) = (dictionary::get_vowel(&ph1), dictionary::get_vowel(&ph2)) {
                            if v1 == v2 { is_vocal = true; }
                        }

                        // Priority: End rhymes must be green if pure. Stop words are only allowed if pure rhyme at line end.
                        let is_end_rhyme = line_end_indices.contains(&i) || line_end_indices.contains(&j);
                        if is_pure && (!is_stop_word || is_end_rhyme) {
                            // Pure rhymes get green.
                            matches.push(HighlightMatch {
                                word: w1.to_string(),
                                start: start1,
                                end: end1,
                                match_type: "green".to_string(),
                            });
                            matches.push(HighlightMatch {
                                word: w2.to_string(),
                                start: start2,
                                end: end2,
                                match_type: "green".to_string(),
                            });
                        } else if is_asso && !is_stop_word {
                             matches.push(HighlightMatch {
                                word: w1.to_string(),
                                start: start1,
                                end: end1,
                                match_type: "yellow".to_string(),
                            });
                            matches.push(HighlightMatch {
                                word: w2.to_string(),
                                start: start2,
                                end: end2,
                                match_type: "yellow".to_string(),
                            });
                        } else if is_vocal && !is_stop_word {
                            matches.push(HighlightMatch {
                                word: w1.to_string(),
                                start: start1,
                                end: end1,
                                match_type: "purple".to_string(),
                            });
                            matches.push(HighlightMatch {
                                word: w2.to_string(),
                                start: start2,
                                end: end2,
                                match_type: "purple".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    RhymeAnalysisResult {
        matches
    }
}

#[tauri::command]
pub fn find_rhymes_for_word(word: &str, mode: &str, lang: &str) -> Vec<RhymeResultGrouped> {
    dictionary::init_dictionary();

    let rhymes = dictionary::get_all_rhymes(word, mode);

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
