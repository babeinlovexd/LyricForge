use rusqlite::{Connection, OpenFlags};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

static DB_CONN: OnceLock<Mutex<Connection>> = OnceLock::new();

pub struct WordAttributes {
    pub ipa: String,
    pub syllables: usize,
    pub rhyme_part: String,
    pub vowels: String,
}

pub fn init_db(handle: &tauri::AppHandle) {
    DB_CONN.get_or_init(|| {
        let resource_path = handle
            .path()
            .resolve("resources/dictionary.db", tauri::path::BaseDirectory::Resource)
            .expect("Failed to resolve dictionary.db");

        let conn = Connection::open_with_flags(
            resource_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX
        ).expect("Failed to open dictionary database");

        Mutex::new(conn)
    });
}

// Fallback init for CLI tests when we don't have an AppHandle
pub fn init_db_local() {
    DB_CONN.get_or_init(|| {
        let conn = Connection::open_with_flags(
            "resources/dictionary.db",
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX
        ).expect("Failed to open dictionary database locally");
        Mutex::new(conn)
    });
}

pub fn get_word_attributes(word: &str, lang: &str) -> Option<WordAttributes> {
    let word_lower = word.to_lowercase();
    let lock = DB_CONN.get()?;
    let conn = lock.lock().unwrap();

    let query = if lang.eq_ignore_ascii_case("de") || lang.eq_ignore_ascii_case("en") {
        "SELECT ipa, syllables, rhyme_part, vowels FROM words WHERE word = ?1 AND lang = ?2 LIMIT 1"
    } else {
        "SELECT ipa, syllables, rhyme_part, vowels FROM words WHERE word = ?1 LIMIT 1"
    };

    let mut stmt = conn.prepare_cached(query).ok()?;

    let mut rows = if lang.eq_ignore_ascii_case("de") || lang.eq_ignore_ascii_case("en") {
        stmt.query([&word_lower, &lang.to_lowercase()]).ok()?
    } else {
        stmt.query([&word_lower]).ok()?
    };

    if let Some(row) = rows.next().ok().flatten() {
        let syll_int: i32 = row.get(1).unwrap_or(1);
        Some(WordAttributes {
            ipa: row.get(0).unwrap_or_default(),
            syllables: syll_int as usize,
            rhyme_part: row.get(2).unwrap_or_default(),
            vowels: row.get(3).unwrap_or_default(),
        })
    } else {
        None
    }
}

pub fn get_all_rhymes(word: &str, mode: &str, filter_lang: &str) -> Vec<(String, String)> {
    let target = match get_word_attributes(word, "auto") {
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

    // Helper to normalize vowels by stripping spaces and digits '0', '1', '2'
    let normalize_vowels = |v: &str| -> String {
        v.replace(' ', "").replace('0', "").replace('1', "").replace('2', "")
    };

    let target_vowels_normalized = normalize_vowels(&target.vowels);

    let query_base = match mode {
        "rein" => "SELECT word, lang FROM words WHERE rhyme_part = ?1 AND word != ?2",
        "assonanz" => "SELECT word, lang FROM words WHERE REPLACE(REPLACE(REPLACE(REPLACE(vowels, ' ', ''), '0', ''), '1', ''), '2', '') = ?1 AND rhyme_part != ?2 AND word != ?3",
        "vokalklang" => "SELECT word, lang FROM words WHERE REPLACE(REPLACE(REPLACE(REPLACE(vowels, ' ', ''), '0', ''), '1', ''), '2', '') = ?1 AND word != ?2",
        _ => return vec![],
    };

    let is_lang_filtered = filter_lang.eq_ignore_ascii_case("de") || filter_lang.eq_ignore_ascii_case("en");

    let mut query = if is_lang_filtered {
        format!("{} AND lang = ?{}", query_base, if mode == "assonanz" { 4 } else { 3 })
    } else {
        query_base.to_string()
    };

    query.push_str(" ORDER BY syllables ASC, word ASC LIMIT 250");

    let mut stmt = conn.prepare(&query).unwrap();
    let lower_lang = filter_lang.to_lowercase();

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
