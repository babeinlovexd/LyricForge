use std::collections::HashMap;
use std::sync::OnceLock;

static EN_DICT: OnceLock<HashMap<String, Vec<String>>> = OnceLock::new();
static DE_DICT: OnceLock<HashMap<String, Vec<String>>> = OnceLock::new();
static DICTIONARY_INIT: OnceLock<()> = OnceLock::new();

/// Regelbasierter G2P-Fallback für deutsche Wörter (Graphem zu Phonem)
pub fn german_g2p(word: &str) -> Vec<String> {
    let w = word.to_lowercase();
    let chars: Vec<char> = w.chars().collect();
    let len = chars.len();
    let mut phonemes = Vec::new();
    let mut i = 0;

    while i < len {
        if i + 4 <= len {
            let s: String = chars[i..i + 4].iter().collect();
            if s == "tsch" {
                phonemes.push("CH".to_string());
                i += 4;
                continue;
            }
        }

        if i + 3 <= len {
            let s: String = chars[i..i + 3].iter().collect();
            if s == "sch" {
                phonemes.push("SH".to_string());
                i += 3;
                continue;
            }
        }

        if i + 2 <= len {
            let s: String = chars[i..i + 2].iter().collect();
            match s.as_str() {
                "ei" | "ey" | "ai" | "ay" => {
                    phonemes.push("AY1".to_string());
                    i += 2;
                    continue;
                }
                "au" => {
                    phonemes.push("AW1".to_string());
                    i += 2;
                    continue;
                }
                "eu" | "äu" => {
                    phonemes.push("OY1".to_string());
                    i += 2;
                    continue;
                }
                "ie" => {
                    phonemes.push("IY1".to_string());
                    i += 2;
                    continue;
                }
                "ch" => {
                    phonemes.push("CH".to_string());
                    i += 2;
                    continue;
                }
                "ck" => {
                    phonemes.push("K".to_string());
                    i += 2;
                    continue;
                }
                "tz" => {
                    phonemes.push("TS".to_string());
                    i += 2;
                    continue;
                }
                "sp" if i == 0 => {
                    phonemes.push("SH".to_string());
                    phonemes.push("P".to_string());
                    i += 2;
                    continue;
                }
                "st" if i == 0 => {
                    phonemes.push("SH".to_string());
                    phonemes.push("T".to_string());
                    i += 2;
                    continue;
                }
                "ng" => {
                    phonemes.push("NG".to_string());
                    i += 2;
                    continue;
                }
                _ => {}
            }
        }

        let c = chars[i];
        let is_last = i == len - 1;
        match c {
            'a' => phonemes.push("AA1".to_string()),
            'e' => {
                if is_last {
                    phonemes.push("EH0".to_string());
                } else {
                    phonemes.push("EH1".to_string());
                }
            }
            'i' => phonemes.push("IH1".to_string()),
            'o' => phonemes.push("OW1".to_string()),
            'u' => phonemes.push("UW1".to_string()),
            'ä' => phonemes.push("EH1".to_string()),
            'ö' => phonemes.push("ER1".to_string()),
            'ü' => phonemes.push("IY1".to_string()),
            'b' => {
                if is_last { phonemes.push("P".to_string()); } else { phonemes.push("B".to_string()); }
            }
            'd' => {
                if is_last { phonemes.push("T".to_string()); } else { phonemes.push("D".to_string()); }
            }
            'g' => {
                if is_last { phonemes.push("K".to_string()); } else { phonemes.push("G".to_string()); }
            }
            'f' | 'v' => phonemes.push("F".to_string()),
            'w' => phonemes.push("V".to_string()),
            's' => phonemes.push("S".to_string()),
            'z' => phonemes.push("TS".to_string()),
            'h' => {
                if i == 0 {
                    phonemes.push("HH".to_string());
                }
            }
            'j' => phonemes.push("Y".to_string()),
            'k' => phonemes.push("K".to_string()),
            'l' => phonemes.push("L".to_string()),
            'm' => phonemes.push("M".to_string()),
            'n' => phonemes.push("N".to_string()),
            'p' => phonemes.push("P".to_string()),
            'r' => phonemes.push("R".to_string()),
            't' => phonemes.push("T".to_string()),
            _ => {}
        }
        i += 1;
    }

    if phonemes.is_empty() {
        phonemes.push("AH0".to_string());
    }
    phonemes
}

pub fn init_dictionary() {
    DICTIONARY_INIT.get_or_init(|| {
    let mut de_dict = HashMap::new();

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
        ("laut", vec!["L", "AW1", "T"]),
        ("stern", vec!["SH", "T", "EH1", "R", "N"]),
        ("berg", vec!["B", "EH1", "R", "G"]),
        ("funke", vec!["F", "UH1", "N", "K", "EH0"]),
        ("dunkel", vec!["D", "UH1", "N", "K", "EH0", "L"]),
        ("leid", vec!["L", "AY1", "T"]),
        ("streit", vec!["SH", "T", "R", "AY1", "T"]),
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
        ("schicht", vec!["SH", "IH1", "CH", "T"]),
        ("dichtet", vec!["D", "IH1", "CH", "T", "EH0", "T"]),
        ("verdichtet", vec!["F", "EH0", "R", "D", "IH1", "CH", "T", "EH0", "T"]),
        ("berichtet", vec!["B", "EH0", "R", "IH1", "CH", "T", "EH0", "T"]),
        ("zurück", vec!["Z", "UH0", "R", "IH1", "K"]),
        ("glück", vec!["G", "L", "IH1", "K"]),
        ("raum", vec!["R", "AW1", "M"]),
        ("baum", vec!["B", "AW1", "M"]),
        ("saum", vec!["Z", "AW1", "M"]),
        ("schaum", vec!["SH", "AW1", "M"]),
        ("flaum", vec!["F", "L", "AW1", "M"]),
        ("lied", vec!["L", "IY1", "T"]),
        ("ein", vec!["AY1", "N"]),
        ("sein", vec!["Z", "AY1", "N"]),
        ("klang", vec!["K", "L", "AA1", "NG"]),
        ("gesang", vec!["G", "EH0", "Z", "AA1", "NG"]),
        ("raumfahrt", vec!["R", "AW1", "M", "F", "AA2", "R", "T"]),
    ];
    for (w, p) in de_mock_entries {
        de_dict.insert(w.to_string(), p.iter().map(|&s| s.to_string()).collect());
    }

    let _ = DE_DICT.set(de_dict);

    let mut en_dict = HashMap::new();
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

            // Filterung: Nur rein alphabetische Wörter übernehmen
            if !word.is_empty() && word.chars().all(|c| c.is_alphabetic()) {
                let phonemes: Vec<String> = parts[1].split(' ').map(|s: &str| s.to_string()).collect();
                en_dict.insert(word, phonemes);
            }
        }
    }
    let _ = EN_DICT.set(en_dict);
    });
}

pub fn get_phonemes(word: &str, lang: &str) -> Option<Vec<String>> {
    init_dictionary();
    let word_lower = word.to_lowercase();
    let en_dict = EN_DICT.get()?;
    let de_dict = DE_DICT.get()?;

    if lang.eq_ignore_ascii_case("de") {
        if let Some(p) = de_dict.get(&word_lower) {
            return Some(p.clone());
        }
        if word_lower.chars().all(|c| c.is_alphabetic()) {
            return Some(german_g2p(&word_lower));
        }
        if let Some(p) = en_dict.get(&word_lower) {
            return Some(p.clone());
        }
    } else {
        if let Some(p) = en_dict.get(&word_lower) {
            return Some(p.clone());
        }
        if let Some(p) = de_dict.get(&word_lower) {
            return Some(p.clone());
        }
        if word_lower.chars().all(|c| c.is_alphabetic()) {
            return Some(german_g2p(&word_lower));
        }
    }
    None
}

// Get all vowels for multi-syllable vocal harmony checks
pub fn get_all_vowels(phonemes: &[String]) -> Vec<String> {
    let mut vowels = Vec::new();
    for p in phonemes.iter() {
        if p.ends_with('1') || p.ends_with('2') || p.ends_with('0') {
            if p.len() >= 2 {
                vowels.push(p[..2].to_string());
            }
        }
    }
    vowels
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
    init_dictionary();
    let target_phonemes = match get_phonemes(word, lang) {
        Some(p) => p,
        None => return vec![],
    };
    let target_rhyme_part = match extract_rhyme_part(&target_phonemes) {
        Some(r) => r,
        None => return vec![],
    };

    let mut results = Vec::new();
    let en_dict = match EN_DICT.get() { Some(d) => d, None => return vec![] };
    let de_dict = match DE_DICT.get() { Some(d) => d, None => return vec![] };

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
                        let target_vowels = get_all_vowels(&target_phonemes);
                        let dict_vowels = get_all_vowels(phonemes);
                        if target_vowels.len() >= 2 && target_vowels == dict_vowels {
                            results.push((dict_word.clone(), lang_tag.to_string()));
                        }
                    }
                    _ => {}
                }
            }
        }
    };

    check_dict(de_dict, "DE");
    check_dict(en_dict, "EN");
    results.sort();
    results.dedup();
    results
}
