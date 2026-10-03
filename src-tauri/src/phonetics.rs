#[derive(Debug, PartialEq, Clone, Copy)]
pub(crate) enum SoundMatch {
    Pure,
    Assonance,
    VowelHarmony,
}

pub(crate) fn final_stressed_rhyme_part(ipa: &str, vowels: &str, fallback: &str) -> String {
    // The dictionary's rhyme_part is already based on the primary stress.
    // Only a later secondary stress marks a compound tail that should replace it.
    let Some((stress_index, stress)) = ipa.char_indices().find(|(_, ch)| *ch == 'ˌ') else {
        return fallback.replace('̯', "");
    };
    let after_stress = &ipa[stress_index + stress.len_utf8()..];
    let Some(nucleus) = vowels.split('|').filter(|v| !v.is_empty()).last() else {
        return fallback.to_string();
    };
    let Some(nucleus_offset) = after_stress.find(nucleus) else {
        return fallback.to_string();
    };
    after_stress[nucleus_offset..]
        .trim_end_matches(|ch: char| matches!(ch, ']' | ')' | '/' | ' '))
        .replace('̯', "")
}

pub(crate) fn classify(
    rhyme_a: &str,
    vowels_a: &str,
    rhyme_b: &str,
    vowels_b: &str,
) -> Option<SoundMatch> {
    if rhyme_a.is_empty() || rhyme_b.is_empty() {
        return None;
    }
    if rhyme_a == rhyme_b {
        return Some(SoundMatch::Pure);
    }
    classify_vowels(vowels_a, vowels_b)
}

pub(crate) fn classify_vowels(vowels_a: &str, vowels_b: &str) -> Option<SoundMatch> {
    let a: Vec<_> = vowels_a.split('|').filter(|s| !s.is_empty()).collect();
    let b: Vec<_> = vowels_b.split('|').filter(|s| !s.is_empty()).collect();
    if a.is_empty() || b.is_empty() {
        return None;
    }
    if a == b {
        if a.len() > 1 {
            Some(SoundMatch::VowelHarmony)
        } else {
            // A lone shared vowel connects too many short words to be useful
            // as an assonance highlight. Exact coda matches remain pure rhymes.
            None
        }
    // A shared stressed vowel alone is too broad for useful song-writing
    // highlights: it would connect every one-syllable word with that vowel to
    // a much longer word. Keep assonance within the same number of vowel
    // nuclei while allowing later vowels to differ.
    } else if a.len() == b.len() && a[0] == b[0] {
        Some(SoundMatch::Assonance)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_vowels, final_stressed_rhyme_part, SoundMatch};

    #[test]
    fn assonance_requires_matching_vowel_nucleus_count() {
        assert_eq!(classify_vowels("aː|ə|eː", "aː"), None);
        assert_eq!(classify_vowels("ɪ|a", "ɪ|ɑː"), Some(SoundMatch::Assonance));
        assert_eq!(classify_vowels("aː|ə", "aː|ɪ"), Some(SoundMatch::Assonance));
        assert_eq!(classify_vowels("a", "a"), None);
    }

    #[test]
    fn final_secondary_stress_recovers_compound_end_rhyme() {
        assert_eq!(
            final_stressed_rhyme_part("[ˈlaŋɡəˌleːkt]", "a|ə|eː", "aŋgəleːkt"),
            "eːkt"
        );
        assert_eq!(
            final_stressed_rhyme_part("[bəˈveːkt]", "ə|eː", "eːkt"),
            "eːkt"
        );
        assert_eq!(final_stressed_rhyme_part("/ˈnaɪ̯t/", "aɪ", "aɪt"), "aɪt");
        assert_eq!(final_stressed_rhyme_part("/ˈɹæbɪt/", "æ|ɪ", "æbɪt"), "æbɪt");
    }
}
