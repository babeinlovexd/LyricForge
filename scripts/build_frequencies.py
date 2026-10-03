"""Generate offline DE/EN scores. Requires wordfreq==3.1.1 (build time only)."""
import math
import sqlite3
from pathlib import Path
from importlib.metadata import version
from wordfreq import get_frequency_dict

assert version('wordfreq') == '3.1.1', 'Use the pinned data release'
root = Path(__file__).resolve().parents[1]
db = sqlite3.connect((root / 'src-tauri/resources/dictionary.db').as_uri() + '?mode=ro', uri=True)
destination = root / 'src-tauri/resources/frequencies.tsv'
with destination.open('w', encoding='utf-8', newline='\n') as output:
    output.write('# wordfreq 3.1.1; Zipf * 100; DE/EN dictionary intersection; CC BY-SA 4.0\n')
    for lang in ['de', 'en']:
        frequencies = get_frequency_dict(lang, wordlist='large')
        count = 0
        for (word,) in db.execute('SELECT word FROM words WHERE lang=? ORDER BY word', (lang,)):
            frequency = frequencies.get(word, 0)
            if frequency > 0 and not any(c in word for c in '\t\n\r'):
                score = round((9 + math.log10(frequency)) * 100)
                output.write(f'{lang}\t{word}\t{score}\n')
                count += 1
        print(f'{lang}: {count} frequency scores')
db.close()
