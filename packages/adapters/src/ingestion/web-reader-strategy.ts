import {
  createKnownItemMatcher,
  parseSourceUrlsPure,
  type IngestionStrategy,
  type IngestionOptions,
  type DataSource,
  type RawDocument,
  type CleanTextDocument,
  type SyncState,
  type MediaService,
} from "@flashcard-master/core";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import crypto from "node:crypto";
import { safeIsoDate } from "../utils/date.js";
import { fetchSafePublicResponse, readResponseTextWithLimit } from "../utils/safe-fetch.js";
import { htmlToCleanText } from "../utils/html-cleaner.js";

export interface WebReaderStrategyOptions {
  timeoutMs?: number;
  customFetch?: typeof fetch;
  concurrency?: number;
  mediaService?: MediaService;
}

export function parseSourceUrls(uri: string): string[] {
  return parseSourceUrlsPure(uri, { filterHttpOnly: true, deduplicate: true });
}

export class WebReaderStrategy implements IngestionStrategy {
  readonly type = "web" as const;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly concurrency: number;
  private readonly mediaService?: MediaService;

  constructor(options: WebReaderStrategyOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetchFn = options.customFetch ?? globalThis.fetch;
    this.concurrency =
      typeof options.concurrency === "number" && Number.isFinite(options.concurrency)
        ? Math.max(1, Math.min(Math.floor(options.concurrency), 10))
        : 3;
    this.mediaService = options.mediaService;
  }

  async localizeImagesInHtml(html: string, originUrl: string): Promise<string> {
    if (!this.mediaService || !html || typeof html !== "string") {
      return html;
    }

    try {
      const dom = new JSDOM(html, { url: originUrl });
      const doc = dom.window.document;
      const images = Array.from(doc.querySelectorAll("img"));

      // Collect unique candidate image URLs
      const targetUrls = new Set<string>();
      for (const img of images) {
        let src = (img.getAttribute("src") || "").trim();
        const dataSrc = (img.getAttribute("data-src") || "").trim();

        // Handle lazy-loaded images where src is a placeholder data URI
        if (!src || src.startsWith("data:")) {
          src = dataSrc;
        }
        if (!src || src.startsWith("data:") || src.startsWith("/api/media/")) {
          continue;
        }

        try {
          const resolvedUrl = new URL(src, originUrl).href;
          targetUrls.add(resolvedUrl);
        } catch {}
      }

      if (targetUrls.size === 0) {
        return html;
      }

      // Concurrently download unique image assets
      const urlToAssetMap = new Map<string, string>();
      await Promise.all(
        Array.from(targetUrls).map(async (url) => {
          try {
            const asset = await this.mediaService!.downloadAndSave(url, originUrl);
            if (asset) {
              urlToAssetMap.set(url, asset.url);
            }
          } catch {}
        })
      );

      // Replace img src attributes
      for (const img of images) {
        let src = (img.getAttribute("src") || "").trim();
        const dataSrc = (img.getAttribute("data-src") || "").trim();
        if (!src || src.startsWith("data:")) {
          src = dataSrc;
        }
        if (!src || src.startsWith("data:") || src.startsWith("/api/media/")) {
          continue;
        }

        try {
          const resolvedUrl = new URL(src, originUrl).href;
          const localizedUrl = urlToAssetMap.get(resolvedUrl);
          if (localizedUrl) {
            img.setAttribute("src", localizedUrl);
          } else {
            img.setAttribute("src", resolvedUrl);
          }
        } catch {}
      }

      return dom.serialize();
    } catch {
      return html;
    }
  }

  async fetch(source: DataSource, lastSync?: SyncState, options?: IngestionOptions): Promise<RawDocument[]> {
    const syncMode = options?.syncMode ?? "new-only";
    const knownMatcher =
      syncMode !== "full" ? createKnownItemMatcher("web", options?.knownItemKeys) : null;
    const rawUrls = parseSourceUrls(source.uri);
    const urls =
      knownMatcher && !knownMatcher.isEmpty
        ? rawUrls.filter((targetUrl) => {
            if (knownMatcher.hasHttpUrl(targetUrl)) {
              options?.onItemSkipped?.(targetUrl);
              options?.onLog?.("debug", `[WebReaderStrategy] Skipping already-synced URL: ${targetUrl}`);
              return false;
            }
            return true;
          })
        : rawUrls;
    if (urls.length === 0) {
      return [];
    }

    const results: (RawDocument | null)[] = new Array(urls.length);
    let currentIndex = 0;

    const workerCount = Math.min(this.concurrency, urls.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (currentIndex < urls.length) {
        const idx = currentIndex++;
        const targetUrl = urls[idx];
        results[idx] = await this.fetchSingleUrl(targetUrl, source.id, options?.onFetchError);
      }
    });

    await Promise.allSettled(workers);

    return results.filter((doc): doc is RawDocument => doc !== null);
  }

  async fetchSingleUrl(url: string, sourceId: string, onFetchError?: (msg: string) => void): Promise<RawDocument | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetchSafePublicResponse(this.fetchFn, url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "flashcard-master/1.0 (Mozilla/5.0 Compatible; +https://github.com/aprodan/flashcard-master)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        console.warn(`[WebReaderStrategy] HTTP error ${response.status} fetching ${url}`);
        onFetchError?.(`HTTP ${response.status} fetching ${url}`);
        return null;
      }

      let html = await readResponseTextWithLimit(response);
      if (this.mediaService) {
        html = await this.localizeImagesInHtml(html, url);
      }
      return this.parseHtml(html, sourceId, url);
    } catch (err: any) {
      console.warn(`[WebReaderStrategy] Network or parse failure for ${url}:`, err.message);
      onFetchError?.(err?.message || `Web fetch failed for ${url}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  parseHtml(html: string, sourceId: string, originUrl: string): RawDocument | null {
    if (!html || typeof html !== "string" || html.trim().length === 0) {
      return null;
    }

    try {
      const dom = new JSDOM(html, { url: originUrl });
      const document = dom.window.document;

      // Use Mozilla Readability algorithm to isolate main article
      const reader = new Readability(document);
      const article = reader.parse();

      let title = article?.title?.trim();
      let rawContent = article?.content?.trim();

      // Fallback if Readability fails to isolate an article tag (e.g. simple markdown/raw page)
      if (!rawContent || rawContent.length === 0) {
        title = title || document.querySelector("title")?.textContent?.trim() || "Untitled Document";
        rawContent = document.body?.innerHTML || html;
      }

      const publishedAt = safeIsoDate(article?.publishedTime) || new Date().toISOString();
      const docId = crypto.createHash("sha256").update(`${sourceId}:${originUrl}`).digest("hex").slice(0, 32);

      return {
        id: docId,
        sourceId,
        title: title || "Untitled Document",
        rawContent,
        originUrl,
        publishedAt,
        guid: originUrl,
      };
    } catch (err: any) {
      console.warn(`[WebReaderStrategy] DOM parsing error:`, err.message);
      return null;
    }
  }

  extractCleanText(raw: RawDocument): CleanTextDocument {
    const clean = htmlToCleanText(raw.rawContent || "", raw.originUrl);

    // Calculate SHA-256 hash
    const contentHash = crypto.createHash("sha256").update(clean, "utf8").digest("hex");

    return {
      id: raw.id,
      sourceId: raw.sourceId,
      title: raw.title,
      textContent: clean,
      rawContent: raw.rawContent,
      originUrl: raw.originUrl,
      contentHash,
    };
  }
}
