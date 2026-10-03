use rusqlite::{Connection, OpenFlags};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

static DB_CONN: OnceLock<Mutex<Connection>> = OnceLock::new();

#[cfg(test)]
pub(crate) fn seed_test_words(words: &[(&str, &str, &str, &str)]) {
    init_db_local();
    let conn = DB_CONN.get().unwrap().lock().unwrap();
    for (word, lang, rhyme, vowels) in words {
        conn.execute(
            "INSERT INTO words (word, lang, ipa, syllables, rhyme_part, vowels_clean, final_rhyme) VALUES (?1, ?2, '', 1, ?3, ?4, ?3)",
            (word, lang, rhyme, vowels),
        )
        .unwrap();
    }
}

pub struct WordAttributes {
    pub lang: String,
    pub ipa: String,
    pub syllables: usize,
    pub rhyme_part: String,
    pub vowels_clean: String,
}

pub fn init_db(handle: &tauri::AppHandle) {
    DB_CONN.get_or_init(|| {
        let resource_path = handle
            .path()
            .resolve(
                "resources/dictionary.db",
                tauri::path::BaseDirectory::Resource,
            )
            .expect("Failed to resolve dictionary.db");

        let app_data_dir = handle
            .path()
            .app_data_dir()
            .expect("Failed to resolve app data dir");

        if !app_data_dir.exists() {
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
        }

        let user_db_path = app_data_dir.join("user_dictionary.db");

        // Main connection must be READ/WRITE so we can create tables and insert into user_db.
        // We will open the user_db as the main connection and ATTACH the read-only dictionary!
        let conn = Connection::open_with_flags(
            &user_db_path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .expect("Failed to open user database");

        // Create table in user_db (which is main here)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS words (
                word TEXT,
                lang TEXT,
                ipa TEXT,
                syllables INTEGER,
                rhyme_part TEXT,
                vowels_clean TEXT,
                final_rhyme TEXT,
                PRIMARY KEY (word, lang)
            )",
            [],
        )
        .expect("Failed to create user words table");
        migrate_user_dictionary(&conn);

        // Attach the bundled, read-only dictionary database
        let dict_db_str = resource_path.to_str().unwrap().replace("\\", "/");
        conn.execute("ATTACH DATABASE ?1 AS bundled_db", [&dict_db_str])
            .expect("Failed to attach bundled database");

        Mutex::new(conn)
    });
}

// Fallback init for CLI tests when we don't have an AppHandle
pub fn init_db_local() {
    DB_CONN.get_or_init(|| {
        let conn = Connection::open_in_memory().expect("Failed to open test database");

        conn.execute(
            "CREATE TABLE IF NOT EXISTS words (
                word TEXT,
                lang TEXT,
                ipa TEXT,
                syllables INTEGER,
                rhyme_part TEXT,
                vowels_clean TEXT,
                final_rhyme TEXT,
                PRIMARY KEY (word, lang)
            )",
            [],
        )
        .unwrap_or(0);
        migrate_user_dictionary(&conn);

        conn.execute(
            "ATTACH DATABASE ?1 AS bundled_db",
            [concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/resources/dictionary.db"
            )],
        )
        .unwrap_or(0);

        Mutex::new(conn)
    });
}

fn migrate_user_dictionary(conn: &Connection) {
    let has_final_rhyme = conn
        .prepare("SELECT final_rhyme FROM words LIMIT 0")
        .is_ok();
    if !has_final_rhyme {
        conn.execute("ALTER TABLE words ADD COLUMN final_rhyme TEXT NOT NULL DEFAULT ''", [])
            .expect("Failed to add indexed rhyme key to user dictionary");
    }
    let mut stmt = conn
        .prepare("SELECT word, lang, ipa, vowels_clean, rhyme_part FROM words WHERE final_rhyme = ''")
        .expect("Failed to read legacy user dictionary entries");
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .expect("Failed to migrate legacy user dictionary entries");
    let migrated: Vec<_> = rows.filter_map(Result::ok).collect();
    drop(stmt);
    for (word, lang, ipa, vowels, rhyme) in migrated {
        let key = crate::phonetics::final_stressed_rhyme_part(&ipa, &vowels, &rhyme);
        conn.execute(
            "UPDATE words SET final_rhyme = ?3 WHERE word = ?1 AND lang = ?2",
            (&word, &lang, key),
        )
        .expect("Failed to update legacy user dictionary rhyme key");
    }
    conn.execute(
        "CREATE INDEX IF NOT EXISTS words_final_rhyme ON words(lang, final_rhyme)",
        [],
    )
    .expect("Failed to index user dictionary rhyme keys");
}

pub fn get_word_attributes(word: &str, lang: &str) -> Option<WordAttributes> {
    let word_lower = word.to_lowercase();
    let lock = DB_CONN.get()?;
    let conn = lock.lock().unwrap();

    let language = lang.to_lowercase();
    if language == "auto" || language == "alle" || language.is_empty() {
        let de = get_word_attributes_unlocked(&conn, &word_lower, "de");
        let en = get_word_attributes_unlocked(&conn, &word_lower, "en");
        return match (de, en) {
            (Some(a), None) | (None, Some(a)) => Some(a),
            _ => None,
        };
    }
    get_word_attributes_unlocked(&conn, &word_lower, &language)
}

pub fn get_word_attributes_unlocked(
    conn: &Connection,
    word: &str,
    lang: &str,
) -> Option<WordAttributes> {
    if lang != "de" && lang != "en" {
        return None;
    }
    let mut stmt = conn
        .prepare_cached(
        "SELECT ipa, syllables, rhyme_part, vowels_clean FROM (
         SELECT ipa, syllables, rhyme_part, vowels_clean, 0 AS source_order FROM words WHERE word = ?1 AND lang = ?2
         UNION ALL
         SELECT b.ipa, b.syllables, b.rhyme_part, b.vowels_clean, 1 AS source_order FROM bundled_db.words b
         WHERE b.word = ?1 AND b.lang = ?2
           AND NOT EXISTS (SELECT 1 FROM words u WHERE u.word = b.word AND u.lang = b.lang)
         ) ORDER BY source_order LIMIT 1",
        )
        .ok()?;
    let mut rows = stmt.query([word, lang]).ok()?;
    if let Some(row) = rows.next().ok().flatten() {
        let syll_int: i32 = row.get(1).unwrap_or(1);
        return Some(WordAttributes {
            lang: lang.to_string(),
            ipa: row.get(0).unwrap_or_default(),
            syllables: syll_int.max(0) as usize,
            rhyme_part: row.get(2).unwrap_or_default(),
            vowels_clean: row.get(3).unwrap_or_default(),
        });
    }

    None
}

pub fn add_custom_word(new_word: &str, pattern_word: &str, lang: &str) -> Result<(), String> {
    let new_word_lower = new_word.to_lowercase();
    let pattern_word_lower = pattern_word.to_lowercase();
    let lang_lower = lang.to_lowercase();
    if !["de", "en"].contains(&lang_lower.as_str()) {
        return Err("Bitte DE oder EN wählen.".into());
    }

    // 1. Get attributes from pattern word
    let attr = match get_word_attributes(&pattern_word_lower, &lang_lower) {
        Some(a) => a,
        None => {
            return Err(format!(
                "Musterwort '{}' nicht in der Datenbank gefunden.",
                pattern_word
            ))
        }
    };

    let lock = match DB_CONN.get() {
        Some(l) => l,
        None => return Err("Datenbankverbindung fehlgeschlagen.".into()),
    };
    let conn = lock.lock().unwrap();

    // 2. Insert or Replace the new word with the pattern's phonetic attributes
    let query = "INSERT OR REPLACE INTO words (word, lang, ipa, syllables, rhyme_part, vowels_clean, final_rhyme) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)";
    let syllables_i32 = attr.syllables as i32;
    let final_rhyme = crate::phonetics::final_stressed_rhyme_part(
        &attr.ipa,
        &attr.vowels_clean,
        &attr.rhyme_part,
    );
    match conn.execute(
        query,
        (
            &new_word_lower,
            &lang_lower,
            &attr.ipa,
            &syllables_i32,
            &attr.rhyme_part,
            &attr.vowels_clean,
            final_rhyme,
        ),
    ) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Datenbankfehler beim Hinzufügen: {}", e)),
    }
}

pub(crate) struct RankedRhyme {
    pub word: String,
    pub lang: String,
    pub syllables: usize,
    pub syllable_distance: usize,
    vowel_distance: usize,
    frequency: u16,
    rhyme_distance: usize,
}

impl RankedRhyme {
    fn key(&self) -> (usize, usize, std::cmp::Reverse<u16>, usize, &str, &str) {
        (
            self.syllable_distance,
            self.vowel_distance,
            std::cmp::Reverse(self.frequency),
            self.rhyme_distance,
            &self.word,
            &self.lang,
        )
    }
}

#[cfg(test)]
fn get_all_rhymes(word: &str, mode: &str, lang: &str) -> Vec<(String, String)> {
    get_ranked_rhymes(word, mode, lang)
        .into_iter()
        .map(|r| (r.word, r.lang))
        .collect()
}

pub(crate) fn get_ranked_rhymes(word: &str, mode: &str, filter_lang: &str) -> Vec<RankedRhyme> {
    let filter_lower = filter_lang.to_lowercase();
    let automatic = filter_lower == "auto" || filter_lower == "alle" || filter_lower.is_empty();
    let requested_result_lang = if automatic {
        None
    } else if filter_lower == "de" || filter_lower == "en" {
        Some(filter_lower.as_str())
    } else {
        return vec![];
    };
    // The source pronunciation and requested candidate language are separate.
    let source_langs = ["de", "en"];

    let lock = match DB_CONN.get() {
        Some(l) => l,
        None => return vec![],
    };
    let conn = lock.lock().unwrap();

    let word_lower = word.to_lowercase();
    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for source_lang in source_langs {
        let target = match get_word_attributes_unlocked(&conn, &word_lower, source_lang) {
            Some(t) => t,
            None => continue,
        };

        let target_rhyme_part = crate::phonetics::final_stressed_rhyme_part(
            &target.ipa,
            &target.vowels_clean,
            &target.rhyme_part,
        );
        if target_rhyme_part.is_empty() || (mode != "rein" && target.vowels_clean.is_empty()) {
            continue;
        }
        use crate::phonetics::{classify, SoundMatch};
        let (condition, wanted) = match mode {
            "rein" => (
                "final_rhyme = ?3",
                SoundMatch::Pure,
            ),
            "assonanz" => (
                "(vowels_clean >= ?3 AND vowels_clean < ?4)",
                SoundMatch::Assonance,
            ),
            "vokalklang" => ("vowels_clean = ?3", SoundMatch::VowelHarmony),
            _ => return vec![],
        };
        // User pronunciations override bundled entries, as in word lookup.
        // Apply the shared classifier before limiting the number of results.
        let query = format!(
            "SELECT word, lang, rhyme_part, vowels_clean, syllables, ipa FROM (
            SELECT word, lang, rhyme_part, vowels_clean, syllables, ipa, final_rhyme FROM words
            UNION ALL SELECT b.word, b.lang, b.rhyme_part, b.vowels_clean, b.syllables, b.ipa, b.final_rhyme FROM bundled_db.words b
            WHERE NOT EXISTS (SELECT 1 FROM words u WHERE u.word = b.word AND u.lang = b.lang)
        ) WHERE word != ?1 AND lang = ?2 AND {}",
            condition
        );
        let first_vowel = target
            .vowels_clean
            .split('|')
            .find(|v| !v.is_empty())
            .unwrap_or("");
        // Auto keeps same-language behavior. Explicit DE/EN controls the
        // output language while checking both source pronunciations.
        let result_langs = [requested_result_lang.unwrap_or(source_lang)];
        for result_lang in &result_langs {
            let mut stmt = match conn.prepare(&query) {
                Ok(s) => s,
                Err(_) => continue,
            };
            let rows = match mode {
                "rein" => stmt.query((&word_lower, *result_lang, &target_rhyme_part)),
                // Indexed superset containing the nucleus itself and nucleus + '|...'.
                // The shared classifier rejects any additional prefix candidates.
                "assonanz" => stmt.query((
                    &word_lower,
                    *result_lang,
                    first_vowel,
                    format!("{}}}", first_vowel),
                )),
                "vokalklang" => stmt.query((&word_lower, *result_lang, &target.vowels_clean)),
                _ => unreachable!(),
            };

            if let Ok(mut r_iter) = rows {
                let mut candidates = Vec::new();
                let target_vowels: Vec<_> = target.vowels_clean.split('|').collect();
                let target_rhyme: Vec<_> = target_rhyme_part.chars().collect();
                while let Ok(Some(row)) = r_iter.next() {
                    let rhyme: String = row.get(2).unwrap_or_default();
                    let vowels: String = row.get(3).unwrap_or_default();
                    let ipa: String = row.get(5).unwrap_or_default();
                    let candidate_rhyme =
                        crate::phonetics::final_stressed_rhyme_part(&ipa, &vowels, &rhyme);
                    if classify(
                        &target_rhyme_part,
                        &target.vowels_clean,
                        &candidate_rhyme,
                        &vowels,
                    ) != Some(wanted)
                    {
                        continue;
                    }
                    let w: String = row.get(0).unwrap_or_default();
                    let l: String = row.get(1).unwrap_or_default();
                    let key = (w.clone(), l.to_uppercase());
                    if !seen.contains(&key) {
                        seen.insert(key.clone());
                        let syllables = row.get::<_, i64>(4).unwrap_or(1).max(1) as usize;
                        candidates.push(RankedRhyme {
                            syllable_distance: syllables.abs_diff(target.syllables),
                            vowel_distance: crate::ranking::distance(
                                &target_vowels,
                                &vowels.split('|').collect::<Vec<_>>(),
                            ),
                            frequency: crate::ranking::frequency(&w, &l),
                            rhyme_distance: crate::ranking::distance(
                                &target_rhyme,
                                &candidate_rhyme.chars().collect::<Vec<_>>(),
                            ),
                            word: w,
                            lang: l.to_uppercase(),
                            syllables,
                        });
                    }
                }
                // Rank all matching candidates before applying a cap, including later letters.
                candidates.sort_by(|a, b| a.key().cmp(&b.key()));
                candidates.truncate(250);
                results.extend(candidates);
            }
        }
    }
    results.sort_by(|a, b| a.key().cmp(&b.key()));
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rhyme_helper_filters_result_language_independently_from_source_language() {
        seed_test_words(&[
            ("zzcrossde", "de", "cross-rhyme", "aɪt"),
            ("zzcrossen", "en", "cross-rhyme", "aɪt"),
            ("zzcrossdeen", "de", "other-rhyme", "oː"),
            ("zzcrossen_de", "en", "other-rhyme", "oː"),
        ]);

        let english = get_ranked_rhymes("zzcrossde", "rein", "en");
        assert!(english
            .iter()
            .any(|r| r.word == "zzcrossen" && r.lang == "EN"));
        assert!(english.iter().all(|r| r.lang == "EN"));

        let german = get_ranked_rhymes("zzcrossen", "rein", "de");
        assert!(german
            .iter()
            .any(|r| r.word == "zzcrossde" && r.lang == "DE"));
        assert!(german.iter().all(|r| r.lang == "DE"));
    }

    #[test]
    fn ordinary_english_rhyme_uses_primary_stress_suffix() {
        init_db_local();
        let results = get_all_rhymes("rabbit", "rein", "en");
        assert!(!results.iter().any(|(word, _)| word == "fit"));
    }

    #[test]
    fn user_pronunciation_overrides_bundled_pronunciation() {
        init_db_local();
        {
            let conn = DB_CONN.get().unwrap().lock().unwrap();
            conn.execute(
                "INSERT OR REPLACE INTO words (word, lang, ipa, syllables, rhyme_part, vowels_clean, final_rhyme) VALUES ('hello', 'en', '/həloʊ/', 2, 'oʊ', 'ə|oʊ', 'oʊ')",
                [],
            )
            .unwrap();
        }
        let attr = get_word_attributes("hello", "en").unwrap();
        assert_eq!(attr.ipa, "/həloʊ/");
        assert_eq!(attr.rhyme_part, "oʊ");
    }

    #[test]
    fn ranking_precedes_limit_and_frequency_breaks_equal_sound_ties() {
        init_db_local();
        {
            let conn = DB_CONN.get().unwrap().lock().unwrap();
            for i in 0..300 {
                conn.execute(
                    "INSERT INTO words (word, lang, ipa, syllables, rhyme_part, vowels_clean, final_rhyme) VALUES (?1, 'de', '', 1, 'ranking-only', 'test-vowel', 'ranking-only')",
                    [format!("aaranking{i}")],
                )
                .unwrap();
            }
            for word in ["zzrankingtarget", "zzrankingbest"] {
                conn.execute(
                    "INSERT INTO words (word, lang, ipa, syllables, rhyme_part, vowels_clean, final_rhyme) VALUES (?1, 'de', '', 2, 'ranking-only', 'test-vowel', 'ranking-only')",
                    [word],
                )
                .unwrap();
            }
        }
        let result = get_ranked_rhymes("zzrankingtarget", "rein", "de");
        assert_eq!(result.len(), 250);
        assert_eq!(result[0].word, "zzrankingbest");
        let make = |word: &str| RankedRhyme {
            word: word.into(),
            lang: "DE".into(),
            syllables: 2,
            syllable_distance: 0,
            vowel_distance: 0,
            rhyme_distance: 1,
            frequency: crate::ranking::frequency(word, "de"),
        };
        assert!(make("haus").key() < make("aaaunknownword").key());
    }
    #[test]
    fn helper_categories_match_editor_and_keep_languages_separate() {
        seed_test_words(&[
            ("zzsoundtarget", "de", "rhyme-target", "ɶː|ɪ"),
            ("zzsoundpure", "de", "rhyme-target", "ɶː|ɪ"),
            ("zzsoundyellow", "de", "rhyme-yellow", "ɶː|ə"),
            ("zzsoundpurple", "de", "rhyme-purple", "ɶː|ɪ"),
            ("zzsounddifferent", "de", "rhyme-different", "uː|ɪ"),
            ("zzsoundforeign", "en", "rhyme-foreign", "ɶː|ɪ"),
            ("zzsoundmono", "de", "rhyme-mono", "ɶː"),
        ]);
        for (word, mode, color) in [
            ("zzsoundpure", "rein", "moss-green"),
            ("zzsoundyellow", "assonanz", "yellow"),
            ("zzsoundpurple", "vokalklang", "purple"),
        ] {
            let found = get_all_rhymes("zzsoundtarget", mode, "auto");
            assert!(
                found.iter().any(|(w, _)| w == word),
                "missing {word} in {mode}"
            );
            assert!(found.iter().all(|(_, lang)| lang == "DE"));
            let analysis =
                crate::linguistics::analyze_rhymes(&format!("zzsoundtarget\n{word}"), "auto");
            assert_eq!(analysis.matches[0].match_type, color);
            for other in ["rein", "assonanz", "vokalklang"] {
                if other != mode {
                    assert!(!get_all_rhymes("zzsoundtarget", other, "de")
                        .iter()
                        .any(|(w, _)| w == word));
                }
            }
        }
        assert!(!get_all_rhymes("zzsoundtarget", "assonanz", "de")
            .iter()
            .any(|(w, _)| w == "zzsoundmono"));
        assert!(
            crate::linguistics::analyze_rhymes("zzsoundtarget\nzzsoundmono", "auto")
                .matches
                .is_empty()
        );
        assert!(get_all_rhymes("zzsoundmono", "vokalklang", "de").is_empty());
        for mode in ["rein", "assonanz", "vokalklang"] {
            assert!(!get_all_rhymes("zzsoundtarget", mode, "de")
                .iter()
                .any(|(w, _)| w == "zzsounddifferent"));
        }
    }
    #[test]
    fn homographs_and_cross_language_phonetics_are_not_mixed() {
        init_db_local();
        {
            let conn = DB_CONN.get().unwrap().lock().unwrap();
            for (word, lang, rhyme, vowels) in [
                ("zzhomograph", "de", "test-de", "i"),
                ("zzhomograph", "en", "test-en", "u"),
                ("zzgerman", "de", "test-de", "i"),
                ("zzenglish", "en", "test-en", "u"),
                ("zzforeign", "en", "test-de", "e"),
                ("zzunique", "de", "test-de", "i"),
            ] {
                conn.execute(
                    "INSERT INTO words (word, lang, ipa, syllables, rhyme_part, vowels_clean, final_rhyme) VALUES (?1, ?2, '', 1, ?3, ?4, ?3)",
                    (word, lang, rhyme, vowels),
                )
                .unwrap();
            }
        }
        assert!(get_word_attributes("zzhomograph", "auto").is_none());
        for mode in ["rein"] {
            let de = get_all_rhymes("zzhomograph", mode, "de");
            assert!(de.iter().any(|(w, _)| w == "zzgerman"));
            assert!(de.iter().all(|(_, lang)| lang == "DE"));
            let en = get_all_rhymes("zzhomograph", mode, "en");
            assert!(en.iter().any(|(w, _)| w == "zzenglish"));
            assert!(en.iter().any(|(w, _)| w == "zzforeign"));
            assert!(en.iter().all(|(_, lang)| lang == "EN"));
            let auto = get_all_rhymes("zzunique", mode, "auto");
            assert!(!auto.is_empty());
            assert!(auto.iter().all(|(_, lang)| lang == "DE"));
        }
        assert!(
            crate::linguistics::analyze_rhymes("zzunique zzforeign", "auto")
                .matches
                .is_empty()
        );
    }
    #[test]
    fn direct_partners_do_not_follow_bilingual_bridges() {
        init_db_local();
        {
            let conn = DB_CONN.get().unwrap().lock().unwrap();
            for (word, lang, rhyme, vowels) in [
                ("zzalpha", "de", "at", "a|e"),
                ("zzbravo", "de", "ak", "a|ɪ"),
                ("zzbravo", "en", "et", "e|o"),
                ("zzcharlie", "en", "ek", "e|ɪ"),
            ] {
                conn.execute(
                    "INSERT INTO words (word, lang, ipa, syllables, rhyme_part, vowels_clean, final_rhyme) VALUES (?1, ?2, '', 1, ?3, ?4, ?3)",
                    (word, lang, rhyme, vowels),
                )
                .unwrap();
            }
        }
        let result = crate::linguistics::analyze_rhymes("zzalpha zzbravo zzcharlie", "auto");
        assert_eq!(result.matches.len(), 3);
        let alpha = &result.matches[0];
        let bravo = &result.matches[1];
        let charlie = &result.matches[2];
        assert_eq!(alpha.partners.len(), 1);
        assert_eq!(alpha.partners[0].start, bravo.start);
        assert_eq!(bravo.partners.len(), 2);
        assert_eq!(charlie.partners.len(), 1);
        assert!(alpha.partners.iter().all(|p| p.start != charlie.start));
    }
}
