use std::collections::HashMap;
use std::sync::Mutex;
use lazy_static::lazy_static;

lazy_static! {
    static ref EN_DICT: Mutex<HashMap<String, Vec<String>>> = Mutex::new(HashMap::new());
}

pub fn init_dictionary() {
    let mut dict = EN_DICT.lock().unwrap();
    if !dict.is_empty() {
        return;
    }

    // Load CMUdict from embedded resource
    let cmudict_data = include_str!("../resources/cmudict.txt");
    for line in cmudict_data.lines() {
        if line.starts_with(";;;") {
            continue;
        }

        let parts: Vec<&str> = line.split("  ").collect();
        if parts.len() == 2 {
            let mut word = parts[0].to_lowercase();
            // Handle variants like WORD(1)
            if let Some(idx) = word.find('(') {
                word = word[..idx].to_string();
            }

            let phonemes: Vec<String> = parts[1].split(' ').map(|s: &str| s.to_string()).collect();
            dict.insert(word, phonemes);
        }
    }
}

pub fn get_phonemes(word: &str) -> Option<Vec<String>> {
    let dict = EN_DICT.lock().unwrap();
    dict.get(&word.to_lowercase()).cloned()
}

// Simple rhyme extraction:
// We look for primary stress (vowel ending in '1') and return all phonemes from there
pub fn extract_rhyme_part(phonemes: &[String]) -> Option<Vec<String>> {
    for (i, p) in phonemes.iter().enumerate() {
        if p.ends_with('1') {
            return Some(phonemes[i..].to_vec());
        }
    }
    // Fallback: use first vowel with '2' or '0'
    for (i, p) in phonemes.iter().enumerate() {
        if p.ends_with('2') || p.ends_with('0') {
            return Some(phonemes[i..].to_vec());
        }
    }
    None
}

// Check if two rhyme parts are a pure rhyme
// Vowel and all subsequent consonants match exactly
pub fn is_pure_rhyme(rhyme1: &[String], rhyme2: &[String]) -> bool {
    rhyme1 == rhyme2
}

// Check if two rhyme parts are an assonance
// Vowel matches, but subsequent consonants differ
pub fn is_assonance(rhyme1: &[String], rhyme2: &[String]) -> bool {
    if rhyme1.is_empty() || rhyme2.is_empty() {
        return false;
    }
    // Remove stress numbers for comparison (e.g., "AA1" -> "AA")
    if rhyme1[0].len() >= 2 && rhyme2[0].len() >= 2 {
        let vowel1 = &rhyme1[0][..2];
        let vowel2 = &rhyme2[0][..2];
        return vowel1 == vowel2 && rhyme1 != rhyme2;
    }
    false
}

// Get primary vowel for internal rhyming / vocal harmonies
pub fn get_vowel(phonemes: &[String]) -> Option<String> {
    for p in phonemes.iter() {
        if p.ends_with('1') || p.ends_with('2') || p.ends_with('0') {
            if p.len() >= 2 {
                return Some(p[..2].to_string());
            }
        }
    }
    None
}

// Group rhyme results
pub fn get_all_rhymes(word: &str, mode: &str) -> Vec<String> {
    let target_phonemes = get_phonemes(word);
    if target_phonemes.is_none() {
        return vec![];
    }
    let target_phonemes = target_phonemes.unwrap();
    let target_rhyme_part = extract_rhyme_part(&target_phonemes);
    if target_rhyme_part.is_none() {
        return vec![];
    }
    let target_rhyme_part = target_rhyme_part.unwrap();

    let dict = EN_DICT.lock().unwrap();
    let mut results = Vec::new();

    for (dict_word, phonemes) in dict.iter() {
        if dict_word == &word.to_lowercase() {
            continue;
        }

        if let Some(rhyme_part) = extract_rhyme_part(phonemes) {
            match mode {
                "rein" => {
                    if is_pure_rhyme(&target_rhyme_part, &rhyme_part) {
                        results.push(dict_word.clone());
                    }
                }
                "assonanz" => {
                    if is_assonance(&target_rhyme_part, &rhyme_part) {
                        results.push(dict_word.clone());
                    }
                }
                "vokalklang" => {
                    let target_vowel = get_vowel(&target_phonemes);
                    let dict_vowel = get_vowel(phonemes);
                    if let (Some(v1), Some(v2)) = (target_vowel, dict_vowel) {
                        if v1 == v2 {
                            results.push(dict_word.clone());
                        }
                    }
                }
                _ => {}
            }
        }
    }

    results.sort();
    results.dedup();
    results
}
