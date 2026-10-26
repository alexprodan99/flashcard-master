# 🌐 Multi-Source Ingestion Playbook

Flashcard Master features a modular, extensible ingestion pipeline built on Hexagonal architecture. It allows you to transform diverse learning sources—from short web articles to multi-hundred-page textbooks—into clean, chunked documents ready for hallucination-free card generation.

---

## 📑 Supported Source Types

| Source Type | Extractor Strategy | Typical Use Cases | Key Features |
| :--- | :--- | :--- | :--- |
| **Web Article** | Mozilla Readability + JSDOM | Blogs, documentation, Wikipedia | Strips navigation, headers, footers, and ads; extracts clean title and body text. |
| **RSS / Atom Feed** | Fast-XML-Parser + Feed Polling | Newsletters, tech publications, blogs | Incremental ingestion; only imports new items since the last sync timestamp. |
| **Local File / Notes** | Fast-Glob + Native Parsers | Obsidian vaults, local Markdown notes | Recursive folder crawling, frontmatter parsing, tag indexing. |
| **EPUB E-Books** | EPUB3 Navigation + JSZip | Technical manuals, e-books, textbooks | Chapter extraction, semantic heading outline slicing, cover image extraction. |
| **PDF Documents** | UnPDF / Native Text Extractor | Academic papers, lecture slides, books | Multi-page text extraction, page coordinate indexing (`startPage`, `endPage`). |
| **Notion Workspaces** | Notion Official SDK Client | Knowledge bases, personal wikis | Recursive page hierarchy crawling, database table syncing, media asset localization. |

---

## 📖 Chapter & Document Slicing for Books (EPUB & PDF)

When ingesting long-form materials like 300-page books or 60-page research reports, passing the entire document to an LLM degrades card quality due to *lost-in-the-middle* attention degradation and context limits.

Flashcard Master provides the **Document Slicing Engine** (`DocumentSlicingEngine`) to split books into focused, chapter-level subdocuments:

```
Full Book (EPUB / PDF)  ──▶  Document Slicing Engine  ──▶  Subdocument Chapters (10–50)
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
Semantic Outline Mode        Page Budget Mode             Word Budget Mode
(Headings H1-H3)             (e.g., 10-page chunks)       (e.g., 2,500-word chunks)
```

### 1. Semantic Outline Mode (`outline`) — *Recommended*
- Analyzes the internal document structure, Table of Contents, and HTML heading elements (`#`, `##`, `<h3>`).
- Splits the text naturally at chapter and major section boundaries.
- Produces clean chapter titles like *"Chapter 1: Foundations"*, *"Chapter 2: Core Concepts"*.
- If a book lacks heading markers, it automatically falls back gracefully to Page Budget or Word Budget mode.

### 2. Page Budget Mode (`pages`)
- Groups pages into consistent blocks (e.g., 5 to 25 pages per subdocument).
- Maintains page coordinate ranges (`startPage` to `endPage`) for precise citation tracing.
- Ideal for textbooks and academic papers with structured page layouts.

### 3. Word Budget Mode (`words`)
- Splits dense text into balanced word counts (e.g., 2,000 to 4,000 words).
- Guarantees each chunk fits comfortably inside optimal LLM attention windows.

### 4. Single Document Mode (`none`)
- Retains the entire input as a single document record.
- Recommended for short articles, single blog posts, and brief meeting notes.

---

## 🗃️ Notion Integration Setup

Flashcard Master connects to Notion via Notion's official REST API to import pages and databases while preserving rich text and headings:

### Step 1: Create an Internal Integration
1. Visit the [Notion Developers Portal](https://www.notion.so/my-integrations).
2. Click **➕ New integration**.
3. Name it `Flashcard Master` and associate it with your target workspace.
4. Set capabilities to **Read content** and **Read user information (without email)**.
5. Copy your **Internal Integration Secret** (`ntn_...`).

### Step 2: Grant Access to Your Target Pages
> **Crucial Step:** In Notion, an integration has zero access until you explicitly invite it to specific pages!
1. Open the Notion page or database you want to ingest.
2. Click the **•••** menu in the top right corner.
3. Scroll down to **Connections** (or **Add connections**).
4. Search for `Flashcard Master` and click **Confirm**.
5. All child pages under this root page will now inherit access automatically.

### Step 3: Add to Flashcard Master
1. In Flashcard Master Web UI, go to **Data Sources** ➔ **➕ Add Source**.
2. Select **Notion Workspace**.
3. Paste your **Integration Token** and enter the **Page URL** or **Database ID**.
4. Set your desired **Max Crawl Depth** (1 for single page, 2–4 for nested subpages).
5. Click **Save & Ingest**.

---

## 🔄 RSS & Atom Feeds Automated Syncing

RSS and Atom feeds allow you to continuously learn from your favorite newsletters and technical publications:
- Flashcard Master records the `lastSyncedAt` timestamp for each feed.
- Only newly published articles are ingested during subsequent syncs.
- Background sync tasks can be triggered manually or via CLI:
  ```bash
  # Sync a specific source:
  flashcard-master sync <source-id>

  # Sync all configured data sources:
  flashcard-master sync --all
  ```

---

## 🏷️ Interactive Tagging & Organization

Data sources can be organized with interactive tags (e.g. `#neuroscience`, `#javascript`, `#economics`):
- Assign tags during source creation or update them in **Data Sources**.
- In **Generate Studio**, filter your source library by tags to focus card generation on specific topics.
- In **Question Explorer**, filter cards by source tags and deck memberships.
