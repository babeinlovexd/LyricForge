"""Add the indexed final_rhyme key required by the desktop rhyme lookup."""

import sqlite3
import sys
from pathlib import Path


def final_rhyme(ipa: str, vowels: str, fallback: str) -> str:
    # Stored rhyme_part is correct for ordinary primary-stress words.
    # A later secondary stress identifies the audible tail of a compound.
    stress_at = ipa.find("ˌ")
    if stress_at < 0:
        return fallback.replace("̯", "")
    after_stress = ipa[stress_at + len("ˌ") :]
    nuclei = [vowel for vowel in vowels.split("|") if vowel]
    if not nuclei:
        return fallback.replace("̯", "")
    offset = after_stress.find(nuclei[-1])
    if offset < 0:
        return fallback.replace("̯", "")
    return after_stress[offset:].rstrip("])/ ").replace("̯", "")


def migrate(path: Path) -> None:
    connection = sqlite3.connect(path)
    try:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(words)")}
        if "final_rhyme" not in columns:
            connection.execute("ALTER TABLE words ADD COLUMN final_rhyme TEXT NOT NULL DEFAULT ''")
        connection.execute("BEGIN")
        rows = connection.execute(
            "SELECT word, lang, ipa, vowels_clean, rhyme_part FROM words WHERE final_rhyme = ''"
        ).fetchall()
        connection.executemany(
            "UPDATE words SET final_rhyme = ? WHERE word = ? AND lang = ?",
            [(final_rhyme(ipa or "", vowels or "", rhyme or ""), word, lang) for word, lang, ipa, vowels, rhyme in rows],
        )
        connection.execute("CREATE INDEX IF NOT EXISTS words_final_rhyme ON words(lang, final_rhyme)")
        connection.commit()
        print(f"Indexed {len(rows):,} entries in {path}")
    finally:
        connection.close()


if __name__ == "__main__":
    migrate(Path(sys.argv[1]))
