import { describe, it, expect } from "vitest";
import { RssIngestionStrategy } from "../src/ingestion/rss-strategy.js";
import type { DataSource, RawDocument } from "@flashcard-master/core";

const SAMPLE_RSS_2_0 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Tech Insights</title>
    <link>https://techinsights.dev</link>
    <description>Latest in distributed systems</description>
    <item>
      <title>Understanding Raft Consensus</title>
      <link>https://techinsights.dev/posts/raft</link>
      <guid isPermaLink="true">https://techinsights.dev/posts/raft</guid>
      <pubDate>Sun, 30 Aug 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[<p>Raft is designed to be <strong>more understandable</strong> than Paxos.</p>]]></description>
      <content:encoded><![CDATA[<article><p>Raft consensus decomposes leader election, log replication, and safety into distinct subproblems.</p></article>]]></content:encoded>
    </item>
  </channel>
</rss>`;

const SAMPLE_ATOM_1_0 = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Engineering Blog</title>
  <link href="https://eng.example.com"/>
  <updated>2026-08-30T10:00:00Z</updated>
  <entry>
    <title>Zero Downtime Migrations</title>
    <link rel="alternate" href="https://eng.example.com/zero-downtime"/>
    <id>tag:eng.example.com,2026:post-42</id>
    <published>2026-08-30T09:00:00Z</published>
    <content type="html"><![CDATA[<p>Always expand before contracting column migrations in <code>SQLite</code>.</p>]]></content>
  </entry>
</feed>`;

const SAMPLE_MALFORMED_DATE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Edge Cases</title>
    <item>
      <title>Malformed Date Post</title>
      <pubDate>Invalid-Date-String-12345</pubDate>
      <description>Resilience test</description>
    </item>
  </channel>
</rss>`;

describe("RssIngestionStrategy", () => {
  const strategy = new RssIngestionStrategy();

  it("parses RSS 2.0 XML feeds with full encoded content and metadata", () => {
    const docs = strategy.parseXml(SAMPLE_RSS_2_0, "source-uuid-1", "https://techinsights.dev/rss");

    expect(docs.length).toBe(1);
    const doc = docs[0];
    expect(doc.sourceId).toBe("source-uuid-1");
    expect(doc.title).toBe("Understanding Raft Consensus");
    expect(doc.originUrl).toBe("https://techinsights.dev/posts/raft");
    expect(doc.guid).toBe("https://techinsights.dev/posts/raft");
    expect(doc.rawContent).toContain("Raft consensus decomposes leader election");
    expect(doc.publishedAt).toBe("2026-08-30T12:00:00.000Z");
  });

  it("parses Atom 1.0 XML feeds with alternate links and entry IDs", () => {
    const docs = strategy.parseXml(SAMPLE_ATOM_1_0, "source-uuid-2", "https://eng.example.com/atom.xml");

    expect(docs.length).toBe(1);
    const doc = docs[0];
    expect(doc.sourceId).toBe("source-uuid-2");
    expect(doc.title).toBe("Zero Downtime Migrations");
    expect(doc.originUrl).toBe("https://eng.example.com/zero-downtime");
    expect(doc.guid).toBe("tag:eng.example.com,2026:post-42");
    expect(doc.rawContent).toContain("Always expand before contracting");
    expect(doc.publishedAt).toBe("2026-08-30T09:00:00.000Z");
  });

  it("handles malformed pubDate strings gracefully without throwing RangeError", () => {
    const docs = strategy.parseXml(SAMPLE_MALFORMED_DATE_FEED, "source-uuid-3");
    expect(docs.length).toBe(1);
    expect(docs[0].publishedAt).toBeUndefined();
  });

  it("extracts clean text, strips HTML tags, and calculates sha256 contentHash", () => {
    const raw: RawDocument = {
      id: "doc-1",
      sourceId: "source-1",
      title: "Clean Text Test",
      rawContent: "<div><p>This is <b>bold</b> &amp; <i>italic</i> text.</p></div>",
    };

    const clean = strategy.extractCleanText(raw);

    expect(clean.id).toBe("doc-1");
    expect(clean.textContent).toBe("This is bold & italic text.");
    expect(clean.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("handles network failures and 404s gracefully without throwing", async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    }) as any;

    const customStrategy = new RssIngestionStrategy({ customFetch: mockFetch });
    const dummySource: DataSource = {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Broken Feed",
      type: "rss",
      uri: "https://example.com/404.xml",
      targetDeck: "Default",
      tags: [],
      isActive: true,
    };

    const results = await customStrategy.fetch(dummySource);
    expect(results).toEqual([]);
  });
});
