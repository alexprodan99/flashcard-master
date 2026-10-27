import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalFileStrategy } from "../src/ingestion/local-file-strategy.js";
import type { DataSource, RawDocument } from "@flashcard-master/core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("LocalFileStrategy", () => {
  const strategy = new LocalFileStrategy();
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-local-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {}
    }
  });

  it("ingests a single markdown file with YAML frontmatter title", async () => {
    const filePath = path.join(tempDir, "sample-note.md");
    const content = `---
title: "Distributed Transactions"
author: "Alex"
---

Two-phase commit (2PC) ensures all nodes either commit or abort.
`;
    fs.writeFileSync(filePath, content, "utf8");

    const source: DataSource = {
      id: "source-local-1",
      name: "My Note",
      type: "local",
      uri: filePath,
      tags: [],
      isActive: true,
    };

    const docs = await strategy.fetch(source);
    expect(docs.length).toBe(1);
    expect(docs[0].title).toBe("Distributed Transactions");
    expect(docs[0].rawContent).toBe(content);
    expect(docs[0].originUrl).toContain("sample-note.md");
  });

  it("recursively discovers .md, .markdown, and .txt files in a directory", async () => {
    const subDir = path.join(tempDir, "subfolder");
    fs.mkdirSync(subDir, { recursive: true });

    fs.writeFileSync(path.join(tempDir, "doc1.txt"), "Plain text document with details.", "utf8");
    fs.writeFileSync(path.join(subDir, "doc2.markdown"), "# Markdown Header\nContent here.", "utf8");
    fs.writeFileSync(path.join(subDir, "ignore.png"), "binary fake data", "utf8");

    const source: DataSource = {
      id: "source-local-2",
      name: "Vault",
      type: "local",
      uri: tempDir,
      tags: [],
      isActive: true,
    };

    const docs = await strategy.fetch(source);
    expect(docs.length).toBe(2);
    const titles = docs.map((d) => d.title);
    expect(titles).toContain("doc1");
    expect(titles).toContain("Markdown Header");
  });

  it("extracts clean text without YAML frontmatter and generates sha256 contentHash", () => {
    const raw: RawDocument = {
      id: "doc-loc-1",
      sourceId: "source-1",
      title: "Clean Local Test",
      rawContent: "---\ntitle: Note\n---\n\nConsensus requires a quorum.",
    };

    const clean = strategy.extractCleanText(raw);
    expect(clean.textContent).toBe("Consensus requires a quorum.");
    expect(clean.rawContent).toBe(raw.rawContent);
    expect(clean.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves exact headers, paragraphs, lists, and code blocks in clean text extraction", () => {
    const markdownContent = `---
title: System Architecture
---

# Microservices Overview

Microservices communicate asynchronously via message queues.

## Key Patterns

- Event-driven choreography
- Dead-letter queues (DLQ)
- Circuit breaker pattern

\`\`\`typescript
interface Message {
  id: string;
  payload: unknown;
}
\`\`\`
`;

    const raw: RawDocument = {
      id: "doc-loc-2",
      sourceId: "source-1",
      title: "System Architecture",
      rawContent: markdownContent,
    };

    const clean = strategy.extractCleanText(raw);
    expect(clean.rawContent).toBe(markdownContent);
    expect(clean.textContent).toContain("# Microservices Overview\n\nMicroservices communicate asynchronously via message queues.");
    expect(clean.textContent).toContain("## Key Patterns\n\n- Event-driven choreography\n- Dead-letter queues (DLQ)\n- Circuit breaker pattern");
    expect(clean.textContent).toContain("```typescript\ninterface Message {\n  id: string;\n  payload: unknown;\n}\n```");
    expect(clean.textContent).not.toContain("---");
    expect(clean.textContent).not.toContain("title: System Architecture");
  });

  it("returns empty array gracefully on non-existent path", async () => {
    const source: DataSource = {
      id: "source-local-3",
      name: "Missing",
      type: "local",
      uri: path.join(tempDir, "does-not-exist"),
      tags: [],
      isActive: true,
    };

    const docs = await strategy.fetch(source);
    expect(docs).toEqual([]);
  });

  it("ingests multiple files when source URI contains a JSON array of file paths", async () => {
    const file1 = path.join(tempDir, "note1.md");
    const file2 = path.join(tempDir, "note2.md");
    fs.writeFileSync(file1, "# First Note\nFirst content.", "utf8");
    fs.writeFileSync(file2, "# Second Note\nSecond content.", "utf8");

    const source: DataSource = {
      id: "source-multi",
      name: "Multiple Notes",
      type: "local",
      uri: JSON.stringify([file1, file2]),
      tags: [],
      isActive: true,
    };

    const docs = await strategy.fetch(source);
    expect(docs.length).toBe(2);
    const titles = docs.map((d) => d.title);
    expect(titles).toContain("First Note");
    expect(titles).toContain("Second Note");
  });
});
