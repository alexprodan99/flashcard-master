# 🚀 Study & Export Workflows

Flashcard Master is built on the philosophy that **your knowledge belongs to you**. Once you synthesize flashcards, you can study them inside the built-in web dashboard, sync them directly to Anki, load them onto an E-Ink e-reader, or print physical study sheets.

---

## ⚡ 1. AnkiConnect (1-Click Live Sync)

The fastest and most seamless way to study with spaced repetition is via **AnkiConnect**, which connects Flashcard Master directly to your running Desktop Anki application:

```
Flashcard Master Web UI  ──▶  HTTP POST :8765  ──▶  AnkiConnect Add-on  ──▶  Desktop Anki
(1-Click Sync Deck)                                (Add-on #2055492159)     (Immediate Review)
```

### Setup in 60 Seconds:
1. Open your Desktop **Anki** app.
2. In the menu, go to **Tools** ➔ **Add-ons** ➔ **Get Add-ons...**
3. Enter code: `2055492159` (AnkiConnect) and click **OK**.
4. Restart Anki.
5. In Flashcard Master:
   - Navigate to **Export & Anki** (shortcut: `5` or `e`).
   - Select your target deck.
   - Choose **AnkiConnect Live Sync**.
   - Click **🚀 Sync to Anki**.
6. Switch to Anki—your deck is already imported with tags, difficulty indicators, and verbatim source citations!

---

## 📦 2. Standalone Anki Package (`.apkg`)

If you study on **AnkiMobile** (iOS), **AnkiDroid** (Android), or want to share decks with classmates:
1. In **Export & Anki**, select your deck.
2. Choose **Anki Package (.apkg)**.
3. Click **Download .apkg**.
4. Double-click the downloaded file on any computer or import it into your mobile Anki app.

---

## 📱 3. E-Reader Study Guides (`.epub` & `.html`)

Reading on E-Ink displays (Kindle, Kobo, Boox, reMarkable) provides a distraction-free, eye-friendly review environment before bed or while traveling.

Flashcard Master generates optimized **EPUB 3.0** study books:

```
┌────────────────────────────────────────────────────────┐
│ 🎴 Flashcard Master Study Guide: Computer Architecture │
│                                                        │
│ ▶ Chapter 1: Cache Coherence                           │
│                                                        │
│ Q: What is the primary difference between MSI and MESI?│
│                                                        │
│ [Show Answer / Spoilers]                               │
│ A: The MESI protocol adds an "Exclusive" state...      │
│                                                        │
│ 📌 Source Quote:                                       │
│ "The Exclusive state eliminates bus invalidation..."   │
└────────────────────────────────────────────────────────┘
```

### Key Features:
- **Interactive Collapsible Answers**: Utilizes semantic HTML `<details>` and `<summary>` tags supported by modern e-reader rendering engines.
- **Optimized Embedded Media**: Local diagrams and images are automatically compressed, downscaled, and embedded as Base64 WebP buffers, ensuring small file sizes and snappy page turns on low-power E-Ink hardware.
- **EPUB 3.0 Standard Compliance**: Validated for Kindle Paperwhite/Oasis (via Send-to-Kindle), Kobo Clara/Libra, and Apple Books.

---

## 🖨️ 4. Printable Study Sheets & PDFs

Prefer pen and paper?
1. In **Export & Anki**, choose **Printable HTML Study Guide**.
2. Click **Open Print Preview**.
3. Use your browser's Print dialog (`Ctrl+P` or `Cmd+P`):
   - The layout uses dedicated `@media print` CSS rules.
   - Formats questions and answers into a two-column foldable layout (fold in half vertically to quiz yourself).
   - Strips backgrounds and dark theme colors to conserve printer ink.

---

## 📊 5. Plaintext & Spreadsheets (Markdown, CSV, TSV)

For cross-app interoperability:
- **Markdown (`.md`)**: Formatted with Obsidian-friendly callouts (`> [!NOTE]`) and source back-links for PKM vaults.
- **CSV / TSV**: Delimited exports compatible with Microsoft Excel, Google Sheets, Quizlet, and Brainscape.
