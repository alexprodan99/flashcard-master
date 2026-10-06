import { describe, it, expect } from "vitest";
import { htmlToCleanText, normalizeCleanText } from "../src/utils/html-cleaner.js";

describe("htmlToCleanText and normalizeCleanText", () => {
  it("converts HTML headings and paragraphs to structured Markdown", () => {
    const html = `
      <h1>Introduction to Raft</h1>
      <p>Raft is a <strong>consensus algorithm</strong> designed to be easy to understand.</p>
      <h2>Leader Election</h2>
      <p>A leader is elected when a follower transitions to candidate state.</p>
    `;

    const clean = htmlToCleanText(html);
    expect(clean).toContain("# Introduction to Raft");
    expect(clean).toContain("## Leader Election");
    expect(clean).toContain("Raft is a consensus algorithm designed to be easy to understand.");
    expect(clean).toContain("A leader is elected when a follower transitions to candidate state.");
    // Verify separation by double newline
    expect(clean).toMatch(/# Introduction to Raft\n\nRaft is a consensus/);
  });

  it("converts inline formatting elements like strong, b, em, i, and a links when preserveInlineFormatting is enabled", () => {
    const html = `
      <p>This is <b>bold</b> and <strong>strong</strong> text.</p>
      <p>This is <i>italic</i> and <em>emphasized</em> text.</p>
      <p>Visit <a href="https://example.com/docs">our documentation</a> for details.</p>
    `;

    const clean = htmlToCleanText(html, undefined, { preserveInlineFormatting: true });
    expect(clean).toContain("This is **bold** and **strong** text.");
    expect(clean).toContain("This is *italic* and *emphasized* text.");
    expect(clean).toContain("Visit [our documentation](https://example.com/docs) for details.");
  });

  it("converts pre and code blocks while preserving code indentation and language", () => {
    const html = `
      <p>Example code:</p>
      <pre class="language-typescript"><code>function add(a: number, b: number): number {
  return a + b;
}</code></pre>
      <p>Use inline <code>console.log(add(1, 2))</code> to print.</p>
    `;

    const clean = htmlToCleanText(html);
    expect(clean).toContain("```typescript");
    expect(clean).toContain("function add(a: number, b: number): number {\n  return a + b;\n}");
    expect(clean).toContain("`console.log(add(1, 2))`");
  });

  it("converts blockquotes, horizontal rules, and lists", () => {
    const html = `
      <blockquote>Consensus is the core of distributed systems.</blockquote>
      <hr />
      <ul>
        <li>Leader</li>
        <li>Follower</li>
        <li>Candidate</li>
      </ul>
      <ol>
        <li>Step One</li>
        <li>Step Two</li>
      </ol>
    `;

    const clean = htmlToCleanText(html);
    expect(clean).toContain("> Consensus is the core of distributed systems.");
    expect(clean).toContain("---");
    expect(clean).toContain("- Leader");
    expect(clean).toContain("- Follower");
    expect(clean).toContain("1. Step One");
    expect(clean).toContain("1. Step Two");
  });

  it("removes non-content elements like scripts, styles, svgs, and iframes", () => {
    const html = `
      <header><nav><a href="#">Nav Link</a></nav></header>
      <script>alert("malicious");</script>
      <style>body { color: red; }</style>
      <svg><circle cx="50" cy="50" r="40" /></svg>
      <iframe></iframe>
      <p>Actual article content.</p>
    `;

    const clean = htmlToCleanText(html);
    expect(clean).not.toContain("alert");
    expect(clean).not.toContain("color: red");
    expect(clean).toContain("Actual article content.");
  });

  it("preserves pure markdown and plain text unchanged", () => {
    const md = "# Pure Markdown Doc\n\nThis is a paragraph with **bold** words.\n\n- Item 1\n- Item 2\n\n\`\`\`python\ndef greet():\n    print(\"hello\")\n\`\`\`";

    const clean = htmlToCleanText(md);
    expect(clean).toBe(md.trim());
  });

  it("converts img tags to structured Markdown images with alt text and resolves relative URLs", () => {
    const html = `
      <h1>Architecture Overview</h1>
      <p>Here is our system design:</p>
      <img src="/assets/diagram.png" alt="Architecture Diagram" />
      <p>Followed by a photo without alt text:</p>
      <img src="https://example.com/photo.jpg" />
    `;

    const clean = htmlToCleanText(html, "https://example.com/docs/intro");
    expect(clean).toContain("![Architecture Diagram](https://example.com/assets/diagram.png)");
    expect(clean).toContain("![](https://example.com/photo.jpg)");
  });

  it("converts HTML tables to GitHub Flavored Markdown (GFM) tables", () => {
    const html = `
      <h1>Features</h1>
      <table>
        <thead>
          <tr>
            <th>Format</th>
            <th>Parser</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>PDF</td>
            <td>unpdf</td>
            <td>Supported</td>
          </tr>
          <tr>
            <td>DOCX</td>
            <td>mammoth</td>
            <td>Supported</td>
          </tr>
        </tbody>
      </table>
    `;

    const clean = htmlToCleanText(html);
    expect(clean).toContain("# Features");
    expect(clean).toContain("| Format | Parser | Status |");
    expect(clean).toContain("| --- | --- | --- |");
    expect(clean).toContain("| PDF | unpdf | Supported |");
    expect(clean).toContain("| DOCX | mammoth | Supported |");
  });

  it("handles empty or null inputs gracefully", () => {
    expect(htmlToCleanText("")).toBe("");
    expect(htmlToCleanText("   ")).toBe("");
    expect(htmlToCleanText(null as any)).toBe("");
    expect(htmlToCleanText(undefined as any)).toBe("");
  });
});
