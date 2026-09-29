use rusqlite::{Connection, OpenFlags};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

static DB_CONN: OnceLock<Mutex<Connection>> = OnceLock::new();

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
            .resolve("resources/dictionary.db", tauri::path::BaseDirectory::Resource)
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
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_NO_MUTEX
        ).expect("Failed to open user database");

        // Create table in user_db (which is main here)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS words (
                word TEXT,
                lang TEXT,
                ipa TEXT,
                syllables INTEGER,
                rhyme_part TEXT,
                vowels_clean TEXT,
                PRIMARY KEY (word, lang)
            )",
            []
        ).expect("Failed to create user words table");

        // Attach the bundled, read-only dictionary database
        let dict_db_str = resource_path.to_str().unwrap().replace("\\", "/");
        conn.execute(
            "ATTACH DATABASE ?1 AS bundled_db",
            [&dict_db_str],
        ).expect("Failed to attach bundled database");

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
                PRIMARY KEY (word, lang)
            )",
            []
        ).unwrap_or(0);

        conn.execute(
            "ATTACH DATABASE ?1 AS bundled_db",
            [concat!(env!("CARGO_MANIFEST_DIR"), "/resources/dictionary.db")],
        ).unwrap_or(0);

        Mutex::new(conn)
    });
}

pub fn get_word_attributes(word: &str, lang: &str) -> Option<WordAttributes> {
    let word_lower = word.to_lowercase();
    let lock = DB_CONN.get()?;
    let conn = lock.lock().unwrap();

    let language = lang.to_lowercase();
    if language == "auto" || language == "alle" {
        let de = get_word_attributes_unlocked(&conn, &word_lower, "de");
        let en = get_word_attributes_unlocked(&conn, &word_lower, "en");
        return match (de, en) { (Some(a), None) | (None, Some(a)) => Some(a), _ => None };
    }
    get_word_attributes_unlocked(&conn, &word_lower, &language)
}

fn get_word_attributes_unlocked(conn: &Connection, word: &str, lang: &str) -> Option<WordAttributes> {
    if lang != "de" && lang != "en" { return None; }
    let mut stmt = conn.prepare_cached("SELECT ipa, syllables, rhyme_part, vowels_clean FROM (
        SELECT * FROM words UNION ALL SELECT * FROM bundled_db.words
    ) WHERE word = ?1 AND lang = ?2 LIMIT 1").ok()?;
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
    if !["de", "en"].contains(&lang_lower.as_str()) { return Err("Bitte DE oder EN wählen.".into()); }

    // 1. Get attributes from pattern word
    let attr = match get_word_attributes(&pattern_word_lower, &lang_lower) {
        Some(a) => a,
        None => return Err(format!("Musterwort '{}' nicht in der Datenbank gefunden.", pattern_word)),
    };

    let lock = match DB_CONN.get() {
        Some(l) => l,
        None => return Err("Datenbankverbindung fehlgeschlagen.".into()),
    };
    let conn = lock.lock().unwrap();

    // 2. Insert or Replace the new word with the pattern's phonetic attributes
    let query = "INSERT OR REPLACE INTO words (word, lang, ipa, syllables, rhyme_part, vowels_clean) VALUES (?1, ?2, ?3, ?4, ?5, ?6)";
    let syllables_i32 = attr.syllables as i32;
    match conn.execute(
        query,
        (
            &new_word_lower,
            &lang_lower,
            &attr.ipa,
            &syllables_i32,
            &attr.rhyme_part,
            &attr.vowels_clean,
        ),
    ) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Datenbankfehler beim Hinzufügen: {}", e)),
    }
}

pub fn get_all_rhymes(word: &str, mode: &str, filter_lang: &str) -> Vec<(String, String)> {
    let target = match get_word_attributes(word, filter_lang) {
        Some(t) => t,
        None => return vec![],
    };

    let lock = match DB_CONN.get() {
        Some(l) => l,
        None => return vec![],
    };
    let conn = lock.lock().unwrap();

    let word_lower = word.to_lowercase();
    let mut results = Vec::new();

    let target_vowels_normalized = target.vowels_clean.clone();

    let query_base = match mode {
        "rein" => "SELECT word, lang FROM (SELECT * FROM words UNION ALL SELECT * FROM bundled_db.words) WHERE rhyme_part = ?1 AND word != ?2",
        "assonanz" => "SELECT word, lang FROM (SELECT * FROM words UNION ALL SELECT * FROM bundled_db.words) WHERE vowels_clean = ?1 AND rhyme_part != ?2 AND word != ?3",
        "vokalklang" => "SELECT word, lang FROM (SELECT * FROM words UNION ALL SELECT * FROM bundled_db.words) WHERE vowels_clean = ?1 AND word != ?2",
        _ => return vec![],
    };

    let is_lang_filtered = true;
    if target.rhyme_part.is_empty() || (mode != "rein" && target.vowels_clean.is_empty()) { return vec![]; }

    // Note: The inner UNION queries return rows with 'lang'. So we can filter on the outer select!
    let mut query = if is_lang_filtered {
        format!("{} AND lang = ?{}", query_base, if mode == "assonanz" { 4 } else { 3 })
    } else {
        query_base.to_string()
    };

    query.push_str(" ORDER BY syllables ASC, word ASC LIMIT 250");

    let mut stmt = conn.prepare(&query).unwrap();
    let lower_lang = target.lang;

    let mut rows = match mode {
        "rein" => {
            if is_lang_filtered {
                stmt.query((&target.rhyme_part, &word_lower, &lower_lang)).unwrap()
            } else {
                stmt.query((&target.rhyme_part, &word_lower)).unwrap()
            }
        },
        "assonanz" => {
            if is_lang_filtered {
                stmt.query((&target_vowels_normalized, &target.rhyme_part, &word_lower, &lower_lang)).unwrap()
            } else {
                stmt.query((&target_vowels_normalized, &target.rhyme_part, &word_lower)).unwrap()
            }
        },
        "vokalklang" => {
            if is_lang_filtered {
                stmt.query((&target_vowels_normalized, &word_lower, &lower_lang)).unwrap()
            } else {
                stmt.query((&target_vowels_normalized, &word_lower)).unwrap()
            }
        },
        _ => unreachable!(),
    };

    while let Some(row) = rows.next().unwrap() {
        let w: String = row.get(0).unwrap();
        let l: String = row.get(1).unwrap();
        results.push((w, l.to_uppercase()));
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn homographs_and_cross_language_phonetics_are_not_mixed() {
        init_db_local();
        {
            let conn = DB_CONN.get().unwrap().lock().unwrap();
            for (word, lang, rhyme) in [
                ("zzhomograph", "de", "test-de"), ("zzhomograph", "en", "test-en"),
                ("zzgerman", "de", "test-de"), ("zzenglish", "en", "test-en"),
                ("zzforeign", "en", "test-de"), ("zzunique", "de", "test-de")
            ] {
                conn.execute("INSERT INTO words VALUES (?1, ?2, '', 1, ?3, ?3)", (word, lang, rhyme)).unwrap();
            }
        }
        assert!(get_word_attributes("zzhomograph", "auto").is_none());
        for mode in ["rein", "vokalklang"] {
            let de = get_all_rhymes("zzhomograph", mode, "de");
            assert!(de.iter().any(|(w, _)| w == "zzgerman"));
            assert!(de.iter().all(|(_, lang)| lang == "DE"));
            let en = get_all_rhymes("zzhomograph", mode, "en");
            assert_eq!(en, vec![("zzenglish".into(), "EN".into())]);
            let auto = get_all_rhymes("zzunique", mode, "auto");
            assert!(!auto.is_empty());
            assert!(auto.iter().all(|(_, lang)| lang == "DE"));
        }
        assert!(crate::linguistics::analyze_rhymes("zzunique zzforeign", "auto").matches.is_empty());
    }
}
