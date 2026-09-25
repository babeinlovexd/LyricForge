use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use lazy_static::lazy_static;

lazy_static! {
    static ref EN_DICT: Mutex<HashMap<String, Vec<String>>> = Mutex::new(HashMap::new());
    static ref DE_DICT: Mutex<HashMap<String, Vec<String>>> = Mutex::new(HashMap::new());
}

static DICTIONARY_INIT: OnceLock<()> = OnceLock::new();

pub fn init_dictionary() {
    DICTIONARY_INIT.get_or_init(|| {
    // Mock German Dict for standard rhyme combinations
    let mut de_dict = DE_DICT.lock().unwrap();
    let de_mock_entries = vec![
        ("haus", vec!["HH", "AW1", "S"]),
        ("maus", vec!["M", "AW1", "S"]),
        ("raus", vec!["R", "AW1", "S"]),
        ("kalt", vec!["K", "AA1", "L", "T"]),
        ("gestalt", vec!["G", "EH0", "SH", "T", "AA1", "L", "T"]),
        ("nacht", vec!["N", "AA1", "CH", "T"]),
        ("wacht", vec!["V", "AA1", "CH", "T"]),
        ("macht", vec!["M", "AA1", "CH", "T"]),
        ("regen", vec!["R", "EY1", "G", "EH0", "N"]),
        ("segen", vec!["Z", "EY1", "G", "EH0", "N"]),
        ("traum", vec!["T", "R", "AW1", "M"]),
        ("laut", vec!["L", "AW1", "T"]), // Assonance to traum
        ("stern", vec!["SH", "T", "EH1", "R", "N"]),
        ("berg", vec!["B", "EH1", "R", "G"]), // Assonance to stern
        ("funke", vec!["F", "UH1", "N", "K", "EH0"]),
        ("dunkel", vec!["D", "UH1", "N", "K", "EH0", "L"]), // Vocal harmony
        ("leid", vec!["L", "AY1", "D"]),
        ("streit", vec!["SH", "T", "R", "AY1", "T"]), // Vocal harmony/assonance depending on 'D'/'T'
        ("asphalt", vec!["AA0", "S", "F", "AA1", "L", "T"]),
        ("bitterkalt", vec!["B", "IH0", "T", "ER0", "K", "AA1", "L", "T"]),
        ("spur", vec!["SH", "P", "UH1", "R"]),
        ("urnatur", vec!["UH1", "R", "N", "AA0", "T", "UH1", "R"]),
        ("pur", vec!["P", "UH1", "R"]),
        ("flur", vec!["F", "L", "UH1", "R"]),
        ("schnur", vec!["SH", "N", "UH1", "R"]),
        ("schwur", vec!["SH", "V", "UH1", "R"]),
        ("tannengrün", vec!["T", "AA1", "N", "EH0", "N", "G", "R", "IY1", "N"]),
        ("blühn", vec!["B", "L", "IY1", "N"]),
        ("licht", vec!["L", "IH1", "CH", "T"]),
        ("gesicht", vec!["G", "EH0", "Z", "IH1", "CH", "T"]),
        ("zurück", vec!["Z", "UH0", "R", "IH1", "K"]),
        ("glück", vec!["G", "L", "IH1", "K"]),
        ("raum", vec!["R", "AW1", "M"]),
        ("baum", vec!["B", "AW1", "M"]),
        ("saum", vec!["Z", "AW1", "M"]),
        ("schaum", vec!["SH", "AW1", "M"]),
        ("flaum", vec!["F", "L", "AW1", "M"]),
        ("raumfahrt", vec!["R", "AW1", "M", "F", "AA2", "R", "T"]),
    ];
    for (w, p) in de_mock_entries {
        de_dict.insert(w.to_string(), p.iter().map(|&s| s.to_string()).collect());
    }

    let mut dict = EN_DICT.lock().unwrap();
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
    });
}

pub fn get_phonemes(word: &str, lang: &str) -> Option<Vec<String>> {
    let word_lower = word.to_lowercase();
    let en_dict = EN_DICT.lock().unwrap();
    let de_dict = DE_DICT.lock().unwrap();

    if lang == "de" || lang == "DE" {
        if let Some(p) = de_dict.get(&word_lower) { return Some(p.clone()); }
        if let Some(p) = en_dict.get(&word_lower) { return Some(p.clone()); }
    } else {
        if let Some(p) = en_dict.get(&word_lower) { return Some(p.clone()); }
        if let Some(p) = de_dict.get(&word_lower) { return Some(p.clone()); }
    }
    None
}

// Simple rhyme extraction:
// We look for the LAST primary stress (vowel ending in '1') to correctly match multi-syllable compound words
pub fn extract_rhyme_part(phonemes: &[String]) -> Option<Vec<String>> {
    let mut last_stress_idx = None;
    for (i, p) in phonemes.iter().enumerate() {
        if p.ends_with('1') || p.ends_with('2') {
            last_stress_idx = Some(i);
        }
    }

    if let Some(idx) = last_stress_idx {
        return Some(phonemes[idx..].to_vec());
    }

    // Fallback: use first vowel with '0'
    for (i, p) in phonemes.iter().enumerate() {
        if p.ends_with('0') {
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
// Tuple structure: (word, lang_tag)
pub fn get_all_rhymes(word: &str, mode: &str, lang: &str) -> Vec<(String, String)> {
    let target_phonemes = get_phonemes(word, lang);
    if target_phonemes.is_none() {
        return vec![];
    }
    let target_phonemes = target_phonemes.unwrap();
    let target_rhyme_part = extract_rhyme_part(&target_phonemes);
    if target_rhyme_part.is_none() {
        return vec![];
    }
    let target_rhyme_part = target_rhyme_part.unwrap();

    let mut results = Vec::new();

    let en_dict = EN_DICT.lock().unwrap();
    let de_dict = DE_DICT.lock().unwrap();

    let mut check_dict = |dict: &HashMap<String, Vec<String>>, lang_tag: &str| {
        for (dict_word, phonemes) in dict.iter() {
            if dict_word == &word.to_lowercase() {
                continue;
            }

            if let Some(rhyme_part) = extract_rhyme_part(phonemes) {
                match mode {
                    "rein" => {
                        if is_pure_rhyme(&target_rhyme_part, &rhyme_part) {
                            results.push((dict_word.clone(), lang_tag.to_string()));
                        }
                    }
                    "assonanz" => {
                        if is_assonance(&target_rhyme_part, &rhyme_part) {
                            results.push((dict_word.clone(), lang_tag.to_string()));
                        }
                    }
                    "vokalklang" => {
                        let target_vowel = get_vowel(&target_phonemes);
                        let dict_vowel = get_vowel(phonemes);
                        if let (Some(v1), Some(v2)) = (target_vowel, dict_vowel) {
                            if v1 == v2 {
                                results.push((dict_word.clone(), lang_tag.to_string()));
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    };

    check_dict(&en_dict, "EN");
    check_dict(&de_dict, "DE");

    results.sort();
    results.dedup();
    results
}
