# Architecture Diagrams: Epic 17

## 1. Local PDF & Word Ingestion & Slicing Pipeline

```mermaid
flowchart TD
    A["User selects .pdf or .docx in UI / CLI"] --> B["Upload Endpoint (Server)"]
    B -->|"Write raw file to ~/.flashcard-master/local-files"| C["Fast 200/202 Response (< 50ms)"]
    B -->|"Dispatch Ingestion Job"| D["Task Center Worker Queue"]
    
    D --> E{"File Type Check"}
    E -->|".docx"| F["Mammoth Parser"]
    E -->|".pdf"| G["PDF.js / Unpdf Parser"]
    
    F --> H["Extract Markdown Headings & Tables"]
    G --> I{"Has selectable text?"}
    I -->|No / Scanned| J["Fail early with Validation Warning (No OCR)"]
    I -->|Yes| K["Extract Page Streams & Reading Order"]
    
    H --> L{"Slicing Strategy"}
    K --> L
    
    L -->|"Semantic Outline"| M["Split on Headings or Bookmarks"]
    L -->|"Page Budget"| N["Split into N-Page Window Chunks"]
    L -->|"Full Document"| O["Single Document Record"]
    
    M --> P["Populate Subdocuments in SQLite `documents` table"]
    N --> P
    O --> P
    
    P --> Q["Generate Studio UI / Document Inspector"]
    Q -->|"Select specific subdocument"| R["AI Card Generation with exact sourceLocator (Page X)"]
```

## 2. Remote Media Localization in Document / EPUB Export

```mermaid
flowchart TD
    A["User triggers EPUB Export for Source / Documents"] --> B["DocumentExportService.exportEpub()"]
    B --> C["Scan textContent for /api/media/ and http(s):// image URLs"]
    
    C --> D{"External http(s):// URL?"}
    D -->|Yes| E["MediaService.fetchAndCacheMedia(url)"]
    D -->|No / Already Local| F["MediaService.readMedia(filename)"]
    
    E -->|"Success"| G["Write to OEBPS/images/<hash>.<ext>"]
    E -->|"Offline / 404"| H["Retain alt text & placeholder fallback"]
    F --> G
    
    G --> I["Register image in OEBPS/content.opf manifest"]
    G --> J["Rewrite XHTML img src to relative 'images/<hash>.<ext>'"]
    
    I --> K["Zip into valid EPUB 3.0 package"]
    J --> K
    K --> L["Client Downloads Offline-Ready eBook"]
```

## 3. Persistent Client & Dashboard State Pipeline

```mermaid
flowchart LR
    A["User interacts with Generate Studio / Dashboard"] --> B["generateStore ($state)"]
    B -->|"Sync active selections & filters"| C["Browser localStorage ('fc_generation_settings')"]
    
    D["User hits Browser Reload (F5)"] --> E["App.svelte / Store onMount()"]
    C -->|"Hydrate selections, filters & active tab"| E
    E --> F["Dashboard & Studio restored instantly without data loss"]
    
    G["Server & CLI Processes"] -->|"All connect to"| H["~/.flashcard-master/data.sqlite (WAL Mode)"]
```
