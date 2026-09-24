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
pub struct RhymeResultGrouped {
    pub syllables: usize,
    pub words: Vec<String>,
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
        if line.trim().is_empty() {
            results.push(0);
            continue;
        }

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

    if word_matches.len() > 1 {
        // Compare every pair to find rhymes
        for i in 0..word_matches.len() {
            for j in (i+1)..word_matches.len() {
                let w1 = word_matches[i].as_str();
                let w2 = word_matches[j].as_str();

                if let (Some(ph1), Some(ph2)) = (dictionary::get_phonemes(w1), dictionary::get_phonemes(w2)) {
                    if let (Some(r1), Some(r2)) = (dictionary::extract_rhyme_part(&ph1), dictionary::extract_rhyme_part(&ph2)) {
                        if dictionary::is_pure_rhyme(&r1, &r2) {
                            matches.push(HighlightMatch {
                                word: w1.to_string(),
                                start: word_matches[i].start(),
                                end: word_matches[i].end(),
                                match_type: "green".to_string(),
                            });
                            matches.push(HighlightMatch {
                                word: w2.to_string(),
                                start: word_matches[j].start(),
                                end: word_matches[j].end(),
                                match_type: "green".to_string(),
                            });
                        } else if dictionary::is_assonance(&r1, &r2) {
                             matches.push(HighlightMatch {
                                word: w1.to_string(),
                                start: word_matches[i].start(),
                                end: word_matches[i].end(),
                                match_type: "yellow".to_string(),
                            });
                            matches.push(HighlightMatch {
                                word: w2.to_string(),
                                start: word_matches[j].start(),
                                end: word_matches[j].end(),
                                match_type: "yellow".to_string(),
                            });
                        } else {
                            // vocal harmony
                            if let (Some(v1), Some(v2)) = (dictionary::get_vowel(&ph1), dictionary::get_vowel(&ph2)) {
                                if v1 == v2 {
                                    matches.push(HighlightMatch {
                                        word: w1.to_string(),
                                        start: word_matches[i].start(),
                                        end: word_matches[i].end(),
                                        match_type: "purple".to_string(),
                                    });
                                    matches.push(HighlightMatch {
                                        word: w2.to_string(),
                                        start: word_matches[j].start(),
                                        end: word_matches[j].end(),
                                        match_type: "purple".to_string(),
                                    });
                                }
                            }
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
    for rhyme in rhymes {
        let syllables = count_syllables_word(&rhyme, lang);
        grouped.entry(syllables).or_insert(Vec::new()).push(rhyme);
    }

    let mut result = Vec::new();
    for (syllables, words) in grouped {
        // limit to 50 results per syllable group to prevent UI freeze
        let mut limited_words = words.clone();
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
