# LyricForge

![LyricForge Logo](public/LF.png)

LyricForge ist eine lokale, offline-fähige Desktop-Applikation für modulares Songwriting und Metrik-Analyse.
Sie richtet sich an Songwriter, Rapper und Dichter, die eine strukturierte Umgebung suchen, um ihre Texte zu schreiben, zu organisieren und phonetisch zu analysieren.

## Hauptfunktionen

*   **Modulares Block-System:** Organisiere deine Songs in verschiebbare Blöcke wie Intro, Verse, Chorus oder eigene Typen.
*   **Live-Phonetik & Silben-Zählung:** Die App analysiert den Text während des Tippens und zählt die Silben in Echtzeit (via Rust-Backend).
*   **Reim- und Klang-Highlighting:** Reime, Assonanzen und Vokalklänge werden farblich direkt im Editor hervorgehoben.
    *   🟢 **Grün (Unterstrichen):** Reine Endreime
    *   🟡 **Gelb (Gepunktet):** Assonanzen (gleiche Vokale, unterschiedliche Konsonanten)
    *   🟣 **Lila (Hintergrund):** Binnenreime und Vokalklang/Harmonien
*   **Reim-Helfer:** Finde passende Reime, Assonanzen und Vokalklänge strukturiert nach Silbenanzahl über die rechte Seitenleiste.
*   **Lokale Speicherung:** Alle Daten bleiben lokal als `.lyricproj`-Datei gespeichert. Kein Cloud-Zwang.
*   **Export:** Exportiere deine fertigen Texte im Klartext (`.txt`) oder als Markdown (`.md`).

## Systemarchitektur

LyricForge nutzt das moderne **Tauri v2** Framework.
*   **Frontend:** React, TypeScript, Tailwind CSS v4, Zustand, ProseMirror/TipTap (für stabile Text-Manipulation und Highlighting).
*   **Backend:** Rust (zuständig für Phonetik-Parsing, Trielookup, Silbenberechnung und lokale Dateisystem-Operationen via Tauri IPC).

## Handbuch für Entwickler

### Voraussetzungen

*   Node.js (v18+)
*   Rust (cargo)
*   Systemabhängige Tauri-Voraussetzungen (z.B. `build-essential`, `libwebkit2gtk-4.1-dev` auf Linux)

### Installation und Start

1.  Abhängigkeiten installieren:
    ```bash
    npm install
    ```
2.  Entwicklungsserver starten:
    ```bash
    npm run tauri dev
    ```

### Build

Um die App für dein Betriebssystem zu kompilieren:
```bash
npm run tauri build
```
Die erzeugten Installationsdateien (z.B. `.deb`, `.app`, `.exe`) befinden sich dann unter `src-tauri/target/release/bundle/`.

## Nutzung / Workflow

1.  **Neuer Block:** Die App startet mit einem ersten Block. Klicke auf den Typ (z.B. "Verse"), um ihn zu ändern.
2.  **Schreiben:** Tippe deinen Text. Auf der rechten Seite des Blocks siehst du direkt die Silbenanzahl der jeweiligen Zeile.
3.  **Reime finden:** Markiere ein Wort oder doppelklicke darauf, um den "Reim-Helfer" (rechte Seitenleiste) zu öffnen.
4.  **Blöcke organisieren:** Nutze das Drag-Handle (die Punkte links am Block), um ihn per Drag-and-Drop zu verschieben.
5.  **Speichern & Exportieren:** Nutze die Buttons oben rechts, um dein Projekt als `.lyricproj` zu sichern oder den Text zu exportieren.
