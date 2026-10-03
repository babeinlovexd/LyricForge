# Häufigkeitsdaten für LyricForge

`frequencies.tsv` enthält eine bearbeitete Teilmenge von **wordfreq 3.1.1**, Copyright 2022 **Robyn Speer**: https://github.com/rspeer/wordfreq

Quelle: die großen deutschen und englischen Häufigkeitslisten der veröffentlichten Python-Distribution 3.1.1. Die Daten wurden auf Wörter im gebündelten LyricForge-Wörterbuch eingeschränkt und als Zipf-Wert mal 100, gerundet auf ganze Zahlen, exportiert. Erzeugung: `scripts/build_frequencies.py`, 2. Oktober 2026.

Diese abgeleitete Datendatei steht unter **Creative Commons Attribution-ShareAlike 4.0 International**: https://creativecommons.org/licenses/by-sa/4.0/ . Die Lizenz bezieht sich auf diese Daten, nicht auf den übrigen Anwendungscode. Unveränderte upstream-Quellenhinweise und weitere Attributionen stehen in `wordfreq-NOTICE.md` (abgerufen aus dem offiziellen Repository am 2. Oktober 2026).

Enthalten sind unter anderem frei verfügbare SUBTLEX-Daten von **Marc Brysbaert und Mitautoren**, OpenSubtitles, Wikipedia, ParaCrawl, der Leeds Internet Corpus und Google Books Ngrams. Siehe die vollständigen Quellenhinweise in `wordfreq-NOTICE.md`.

Die Werte sind sprachbezogene Korpusstatistiken, keine Bewertung der Wortqualität. Fehlende Werte bedeuten „keine Häufigkeitsangabe“, nicht „ungültiges Wort“. Eigene Wörter bleiben auch ohne Häufigkeitswert verwendbar. Zur Laufzeit wird kein Netzwerkdienst benötigt.
