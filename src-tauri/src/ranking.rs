use std::collections::HashMap;
use std::sync::OnceLock;

static FREQUENCIES: OnceLock<HashMap<(&'static str, &'static str), u16>> = OnceLock::new();

pub(crate) fn frequency(word: &str, lang: &str) -> u16 {
    let scores = FREQUENCIES.get_or_init(|| {
        include_str!("../resources/frequencies.tsv")
            .lines()
            .filter_map(|line| {
                let mut fields = line.split('\t');
                let lang = fields.next()?;
                let word = fields.next()?;
                let score = fields.next()?.parse().ok()?;
                Some(((lang, word), score))
            })
            .collect()
    });
    scores.get(&(lang, word)).copied().unwrap_or(0)
}

pub(crate) fn distance<T: Eq>(a: &[T], b: &[T]) -> usize {
    let mut previous: Vec<_> = (0..=b.len()).collect();
    for (i, left) in a.iter().enumerate() {
        let mut row = vec![i + 1; b.len() + 1];
        for (j, right) in b.iter().enumerate() {
            row[j + 1] = (row[j] + 1)
                .min(previous[j + 1] + 1)
                .min(previous[j] + usize::from(left != right));
        }
        previous = row;
    }
    previous[b.len()]
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frequency_is_language_specific_and_unknown_words_remain_valid() {
        assert!(frequency("haus", "de") > 400);
        assert!(frequency("house", "en") > 400);
        assert!(frequency("haus", "de") > frequency("haus", "en"));
        assert_eq!(frequency("zzunknownfrequency", "de"), 0);
        assert_eq!(distance(&['o', 'ː', 'n'], &['o', 'ː', 'm']), 1);
        assert_eq!(distance(&["oː", "ə"], &["oː", "ɪ"]), 1);
    }
}
