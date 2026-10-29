# @flashcard-master/adapters

[![npm version](https://img.shields.io/npm/v/@flashcard-master/adapters.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/@flashcard-master/adapters)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue.svg?style=flat-square)](https://github.com/alexprodan99/flashcard-master/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-green.svg?style=flat-square)](https://alexprodan99.github.io/flashcard-master/)

Multi-source ingestion strategies, LLM vendor adapters, and multi-format exporters for **Flashcard Master**.

---

## 🌐 Capabilities

### 1. Ingestion Strategies
Extract clean, distraction-free text from diverse learning sources:
- **Web Reader (`WebReaderStrategy`)**: Cleans web pages using Mozilla Readability and JSDOM, stripping ads, navbars, and cookie banners.
- **RSS & Atom (`RssIngestionStrategy`)**: Automatically parses syndication feeds to monitor new articles and blogs.
- **EPUB E-Books (`EpubParser`)**: Decompresses EPUB 2/3 books into chapter-level learning modules.
- **Notion Integration (`NotionAdapter`)**: Connects to the Notion API, traversing pages and databases recursively.
- **Local Files (`LocalFileStrategy`)**: Parses Markdown, PDF (`unpdf`), Word DOCX (`mammoth`), and plaintext documents.
- **AI Standard Formats**: Ingests `llms.txt` and XML sitemaps.

### 2. LLM Provider Adapters
Zero-parser, schema-enforced JSON generation across major AI backends:
- **Ollama (`OllamaAdapter`)**: 100% private, offline inference with local models (`deepseek-r1`, `llama3.2`, `mistral`).
- **OpenAI (`OpenAIAdapter`)**: Strict structured outputs with `gpt-4o` and `o3-mini`.
- **Google Gemini (`GeminiAdapter`)**: High-throughput extraction with `gemini-1.5-flash` and `gemini-2.0-flash`.
- **Anthropic (`AnthropicAdapter`)**: Deep conceptual synthesis with Claude 3.5 Sonnet.

### 3. Study Exporters
- **AnkiConnect (`AnkiConnectAdapter`)**: 1-click live synchronization to Desktop Anki over local REST (`127.0.0.1:8765`).
- **Anki Packages (`AnkiPackageExporter`)**: Generates standalone `.apkg` decks compatible with AnkiMobile (iOS) and AnkiDroid.
- **E-Reader Study Books (`EpubFlashcardExporter`)**: Packages flashcards into formatted EPUB books with collapsible CSS spoilers for Kindle, Kobo, and Apple Books.
- **Text Formats**: Markdown study guides, HTML printable cheat-sheets, CSV, and TSV spreadsheets.

---

## 📦 Installation

```bash
npm install @flashcard-master/adapters @flashcard-master/core
```

---

## 💻 Programmatic Usage

### Ingesting an Article from a URL
```typescript
import { WebReaderStrategy } from "@flashcard-master/adapters";

const reader = new WebReaderStrategy();
const doc = await reader.extract("https://en.wikipedia.org/wiki/Spaced_repetition");

console.log(`Title: ${doc.title}`);
console.log(`Word Count: ${doc.wordCount}`);
console.log(`Content Preview: ${doc.content.slice(0, 200)}...`);
```

### Exporting to Desktop Anki via AnkiConnect
```typescript
import { AnkiConnectAdapter } from "@flashcard-master/adapters";

const anki = new AnkiConnectAdapter({ baseUrl: "http://127.0.0.1:8765" });

// Test connection
const isConnected = await anki.checkConnection();
if (isConnected) {
  await anki.exportDeck({
    deckName: "Cognitive Science",
    cards: [
      {
        question: "What is the spacing effect?",
        answer: "Learning is greater when studying is spread out over time.",
        quoteCitation: "Learning is greater when studying is spread out over time, as opposed to cramming."
      }
    ]
  });
  console.log("Deck synced to Desktop Anki!");
}
```

---

## 📚 Documentation

For complete ingestion playbooks and exporter configurations, see the **[Flashcard Master Documentation](https://alexprodan99.github.io/flashcard-master/user-guide/ingestion-playbook)**.

---

## 📄 License

GNU Affero General Public License v3.0 ([AGPL-3.0](https://github.com/alexprodan99/flashcard-master/blob/main/LICENSE)).
