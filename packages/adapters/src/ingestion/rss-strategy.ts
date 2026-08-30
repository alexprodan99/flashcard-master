import type { IngestionStrategy, DataSource, RawDocument, CleanTextDocument, SyncState } from "@flashcard-master/core";
import { XMLParser } from "fast-xml-parser";
import crypto from "node:crypto";

export class FeedParsingError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = "FeedParsingError";
  }
}

export interface RssStrategyOptions {
  timeoutMs?: number;
  customFetch?: typeof fetch;
}

export function safeIsoDate(dateStr?: string): string | undefined {
  if (!dateStr || typeof dateStr !== "string") {
    return undefined;
  }
  try {
    const d = new Date(dateStr);
    const time = d.getTime();
    if (isNaN(time)) {
      return undefined;
    }
    const year = d.getFullYear();
    if (year < 1970 || year > 2100) {
      return undefined;
    }
    return d.toISOString();
  } catch {
    return undefined;
  }
}

export class RssIngestionStrategy implements IngestionStrategy {
  readonly type = "rss" as const;
  private readonly parser: XMLParser;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: RssStrategyOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetchFn = options.customFetch ?? globalThis.fetch;
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      trimValues: true,
      parseAttributeValue: false,
    });
  }

  async fetch(source: DataSource, lastSync?: SyncState): Promise<RawDocument[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await this.fetchFn(source.uri, {
        signal: controller.signal,
        headers: {
          "User-Agent": "flashcard-master/1.0 (+https://github.com/aprodan/flashcard-master)",
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
      });
      clearTimeout(timer);

      if (!response.ok) {
        console.warn(`[RssIngestionStrategy] HTTP error ${response.status} fetching ${source.uri}`);
        return [];
      }

      const xmlText = await response.text();
      return this.parseXml(xmlText, source.id, source.uri);
    } catch (err: any) {
      console.warn(`[RssIngestionStrategy] Network or parse failure for ${source.uri}:`, err.message);
      return [];
    }
  }

  parseXml(xmlText: string, sourceId: string, originUri?: string): RawDocument[] {
    if (!xmlText || typeof xmlText !== "string" || xmlText.trim().length === 0) {
      return [];
    }

    try {
      const parsed = this.parser.parse(xmlText);
      const docs: RawDocument[] = [];

      // Case 1: RSS 2.0 format (<rss><channel><item>...</item></channel></rss>)
      if (parsed.rss?.channel?.item) {
        const items = Array.isArray(parsed.rss.channel.item)
          ? parsed.rss.channel.item
          : [parsed.rss.channel.item];

        for (const item of items) {
          const title = item.title ? String(item.title) : "Untitled";
          const rawContent =
            item["content:encoded"] ||
            item.content ||
            item.description ||
            "";
          const originUrl = item.link ? String(item.link) : originUri;
          const publishedAt = safeIsoDate(item.pubDate);
          const guid =
            typeof item.guid === "object"
              ? item.guid["#text"] || JSON.stringify(item.guid)
              : item.guid || item.link || title;

          docs.push({
            id: crypto.randomUUID(),
            sourceId,
            title,
            rawContent: String(rawContent),
            originUrl: String(originUrl),
            publishedAt,
            guid: String(guid),
          });
        }
        return docs;
      }

      // Case 2: Atom 1.0 format (<feed><entry>...</entry></feed>)
      if (parsed.feed?.entry) {
        const entries = Array.isArray(parsed.feed.entry)
          ? parsed.feed.entry
          : [parsed.feed.entry];

        for (const entry of entries) {
          const title =
            typeof entry.title === "object"
              ? entry.title["#text"] || "Untitled"
              : entry.title || "Untitled";

          const rawContent =
            (typeof entry.content === "object" ? entry.content["#text"] : entry.content) ||
            (typeof entry.summary === "object" ? entry.summary["#text"] : entry.summary) ||
            "";

          let originUrl = originUri;
          if (entry.link) {
            if (Array.isArray(entry.link)) {
              const alternate = entry.link.find((l: any) => l["@_rel"] === "alternate" || !l["@_rel"]);
              originUrl = alternate?.["@_href"] || entry.link[0]?.["@_href"] || originUri;
            } else if (typeof entry.link === "object") {
              originUrl = entry.link["@_href"] || originUri;
            } else {
              originUrl = String(entry.link);
            }
          }

          const publishedAt = safeIsoDate(entry.published || entry.updated);
          const guid = entry.id ? String(entry.id) : (originUrl || String(title));

          docs.push({
            id: crypto.randomUUID(),
            sourceId,
            title: String(title),
            rawContent: String(rawContent),
            originUrl: String(originUrl),
            publishedAt,
            guid,
          });
        }
        return docs;
      }

      return [];
    } catch (err: any) {
      throw new FeedParsingError(`Failed to parse XML feed content: ${err.message}`, err);
    }
  }

  extractCleanText(raw: RawDocument): CleanTextDocument {
    let clean = raw.rawContent || "";

    // 1. Strip HTML tags
    clean = clean.replace(/<[^>]+>/g, " ");

    // 2. Decode standard HTML entities
    clean = clean
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");

    // 3. Normalize multiple whitespace and newlines
    clean = clean.replace(/\s+/g, " ").trim();

    // 4. Calculate SHA-256 hash
    const contentHash = crypto.createHash("sha256").update(clean, "utf8").digest("hex");

    return {
      id: raw.id,
      sourceId: raw.sourceId,
      title: raw.title,
      textContent: clean,
      originUrl: raw.originUrl,
      contentHash,
    };
  }
}
