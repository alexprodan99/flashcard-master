import { Client, LogLevel } from "@notionhq/client";
import type {
  IngestionStrategy,
  IngestionOptions,
  DataSource,
  RawDocument,
  CleanTextDocument,
  SyncState,
  MediaService,
} from "@flashcard-master/core";
import crypto from "node:crypto";
import { safeIsoDate } from "../utils/date.js";
import { normalizeCleanText } from "../utils/html-cleaner.js";

export interface NotionStrategyOptions {
  settingsService?: { getSecret(provider: string): string | null };
  mediaService?: MediaService;
  notionClient?: Client;
  timeoutMs?: number;
  customFetch?: typeof fetch;
  defaultRecursiveDepth?: number;
}

/**
 * Sanitizes a URI by redacting sensitive query parameters (token, api_key)
 * to prevent secret credential leakage in logs or error messages.
 */
export function sanitizeUri(uri: string): string {
  try {
    if (/^https?:\/\//i.test(uri)) {
      const parsed = new URL(uri);
      if (parsed.searchParams.has("token")) {
        parsed.searchParams.set("token", "[REDACTED]");
      }
      if (parsed.searchParams.has("api_key")) {
        parsed.searchParams.set("api_key", "[REDACTED]");
      }
      return parsed.toString();
    }
  } catch {}
  return uri;
}

/**
 * Extracts a 32-character hexadecimal Notion ID from a Notion URL or raw UUID string.
 * Supports hyphenated UUIDs, unhyphenated 32-hex strings, side-peek ?p= query parameters,
 * and standard Notion web URLs.
 */
export function extractNotionId(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // Check for 8-4-4-4-12 hyphenated UUID directly
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed)) {
    return trimmed.replace(/-/g, "").toLowerCase();
  }

  // Check for raw 32-hex string directly
  if (/^[0-9a-fA-F]{32}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // If input is an HTTP(S) URL, inspect query parameters and pathname
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);

      // Check ?p= query parameter used in Notion side-peek/modal URLs
      const pParam = parsed.searchParams.get("p");
      if (pParam) {
        const idFromP = extractNotionId(pParam);
        if (idFromP) return idFromP;
      }

      const segments = parsed.pathname.split("/").filter(Boolean);
      const lastSegment = segments[segments.length - 1] || "";

      // 1. Check if the last path segment matches standard 8-4-4-4-12 UUID
      const uuidInPath = lastSegment.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
      if (uuidInPath) {
        return uuidInPath[0].replace(/-/g, "").toLowerCase();
      }

      // 2. Check if the last path segment ends with a 32-hex string (e.g., Page-Title-32hex)
      const hexAtEnd = lastSegment.match(/[0-9a-fA-F]{32}$/);
      if (hexAtEnd) {
        return hexAtEnd[0].toLowerCase();
      }

      // 3. Check for any 32-hex string with boundary in the last segment
      const anyHex = lastSegment.match(/(?:^|[-_])([0-9a-fA-F]{32})(?:[-_]|$)/);
      if (anyHex && anyHex[1]) {
        return anyHex[1].toLowerCase();
      }
    } catch {
      // Fall through if URL parsing fails
    }
  }

  // Check for general 8-4-4-4-12 hyphenated UUID substring
  const uuidMatch = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (uuidMatch) {
    return uuidMatch[0].replace(/-/g, "").toLowerCase();
  }

  // Check for general 32-hex substring
  const hexMatch = trimmed.match(/[0-9a-fA-F]{32}/);
  if (hexMatch) {
    return hexMatch[0].toLowerCase();
  }

  return null;
}

/**
 * Formats a 32-character hex ID into a standard 8-4-4-4-12 UUID format.
 */
export function formatNotionUuid(hex32: string): string {
  if (typeof hex32 !== "string" || hex32.length !== 32) {
    return hex32;
  }
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20)}`;
}

/**
 * Renders an array of Notion rich-text objects into standard Markdown with annotations.
 */
export function renderRichText(richTextArray?: any[]): string {
  if (!Array.isArray(richTextArray) || richTextArray.length === 0) return "";
  return richTextArray
    .map((chunk) => {
      if (!chunk || typeof chunk !== "object") return "";
      let text = chunk.plain_text ?? chunk.text?.content ?? "";
      if (!text) return "";

      const ann = chunk.annotations || {};
      if (ann.code) text = `\`${text}\``;
      if (ann.bold) text = `**${text}**`;
      if (ann.italic) text = `*${text}*`;
      if (ann.strikethrough) text = `~~${text}~~`;
      if (ann.underline) text = `<u>${text}</u>`;

      const link = chunk.href || chunk.text?.link?.url;
      if (link) {
        text = `[${text}](${link})`;
      }
      return text;
    })
    .join("");
}

/**
 * Extracts tag names from Notion page properties (multi_select and select).
 */
export function extractTagsFromProperties(properties?: Record<string, any>): string[] {
  if (!properties || typeof properties !== "object") return [];
  const tags: string[] = [];

  for (const key of Object.keys(properties)) {
    const prop = properties[key];
    if (prop?.type === "multi_select" && Array.isArray(prop.multi_select)) {
      for (const item of prop.multi_select) {
        if (item?.name && typeof item.name === "string") {
          const t = item.name.trim();
          if (t && !tags.includes(t)) tags.push(t);
        }
      }
    } else if (prop?.type === "select" && prop.select?.name) {
      const t = String(prop.select.name).trim();
      if (t && !tags.includes(t)) tags.push(t);
    }
  }

  return tags;
}

export class NotionStrategy implements IngestionStrategy {
  readonly type = "notion" as const;
  private readonly settingsService?: { getSecret(provider: string): string | null };
  private readonly mediaService?: MediaService;
  private readonly notionClient?: Client;
  private readonly timeoutMs: number;
  private readonly customFetch?: typeof fetch;
  private readonly defaultRecursiveDepth: number;

  constructor(options: NotionStrategyOptions = {}) {
    this.settingsService = options.settingsService;
    this.mediaService = options.mediaService;
    this.notionClient = options.notionClient;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.customFetch = options.customFetch;
    this.defaultRecursiveDepth = options.defaultRecursiveDepth ?? 6;
  }

  /**
   * Resolves the Notion integration token following the priority chain:
   * 1. SettingsService ("notion")
   * 2. Process environment variable (NOTION_API_KEY)
   * 3. URI query parameter (?token= or ?api_key=)
   */
  resolveToken(source: DataSource): string {
    const saved = this.settingsService?.getSecret("notion");
    if (saved && typeof saved === "string" && saved.trim().length > 0) {
      return saved.trim();
    }

    if (process.env.NOTION_API_KEY && process.env.NOTION_API_KEY.trim().length > 0) {
      return process.env.NOTION_API_KEY.trim();
    }

    try {
      if (/^https?:\/\//i.test(source.uri)) {
        const parsed = new URL(source.uri);
        const tokenParam = parsed.searchParams.get("token") || parsed.searchParams.get("api_key");
        if (tokenParam && tokenParam.trim().length > 0) {
          return tokenParam.trim();
        }
      }
    } catch {
      // Ignore invalid URL parsing
    }

    throw new Error(
      "No Notion API token configured. Please configure your Notion Integration secret in Settings or set NOTION_API_KEY."
    );
  }

  private getClient(token: string): Client {
    if (this.notionClient) {
      return this.notionClient;
    }

    return new Client({
      auth: token,
      timeoutMs: this.timeoutMs,
      logLevel: LogLevel.ERROR,
      fetch: this.customFetch
        ? (url, init) => this.customFetch!(url as any, init as any)
        : undefined,
    });
  }

  /**
   * Fetches Notion resources, auto-detecting Databases vs Pages.
   */
  async fetch(source: DataSource, lastSync?: SyncState, options?: IngestionOptions): Promise<RawDocument[]> {
    const rawId = extractNotionId(source.uri);
    if (!rawId) {
      throw new Error(`Could not extract a valid Notion ID from source URI: "${sanitizeUri(source.uri)}"`);
    }

    const canonicalId = formatNotionUuid(rawId);
    options?.onLog?.("info", `[Notion] Resolving source "${source.name}" (ID: ${canonicalId})...`);
    const token = this.resolveToken(source);
    const client = this.getClient(token);

    // Determine if recursive subpage crawl is requested via URI parameter or tag
    let isRecursive = Array.isArray(source.tags) && source.tags.includes("recursive");
    let maxDepthLimit = this.defaultRecursiveDepth;

    try {
      if (/^https?:\/\//i.test(source.uri)) {
        const parsed = new URL(source.uri);
        const recParam = parsed.searchParams.get("recursive");
        if (recParam === "true" || recParam === "1") {
          isRecursive = true;
        } else if (recParam && !isNaN(parseInt(recParam, 10)) && parseInt(recParam, 10) > 0) {
          isRecursive = true;
          maxDepthLimit = Math.max(1, Math.min(10, parseInt(recParam, 10)));
        }

        const depthParam = parsed.searchParams.get("depth") || parsed.searchParams.get("max_depth");
        if (depthParam && !isNaN(parseInt(depthParam, 10)) && parseInt(depthParam, 10) > 0) {
          isRecursive = true;
          maxDepthLimit = Math.max(1, Math.min(10, parseInt(depthParam, 10)));
        }
      }
    } catch {}
    if (/[?&]recursive=(true|1)(&|$)/i.test(source.uri)) {
      isRecursive = true;
    }

    options?.onLog?.(
      "debug",
      `[Notion] Recursive crawl mode: ${isRecursive} (max depth limit: ${maxDepthLimit})`
    );

    // Step 1: Auto-detection - Try Database retrieval first
    let isDatabase = false;
    options?.onLog?.("debug", `[Notion] Checking if resource ${canonicalId} is a Database...`);
    try {
      await client.databases.retrieve({ database_id: canonicalId });
      isDatabase = true;
      options?.onLog?.("info", `[Notion] Resource identified as Database`);
    } catch (err: any) {
      // Fast-fail on authentication or rate limit errors
      if (
        err?.status === 401 ||
        err?.status === 429 ||
        err?.code === "unauthorized" ||
        err?.code === "rate_limited"
      ) {
        throw err;
      }
      isDatabase = false;
    }

    if (isDatabase) {
      return this.fetchDatabase(client, source, canonicalId, lastSync, options);
    }

    // Step 2: Retrieve Page
    options?.onLog?.("debug", `[Notion] Retrieving page metadata for ${canonicalId}...`);
    let pageMeta: any = null;
    try {
      pageMeta = await client.pages.retrieve({ page_id: canonicalId });
    } catch (err: any) {
      throw new Error(
        `Failed to retrieve Notion resource (${canonicalId}): ${err.message || err}`
      );
    }

    const pageTitle = this.extractTitleFromProperties(pageMeta?.properties) || "Untitled Notion Document";
    options?.onLog?.("info", `[Notion] Target root page identified: "${pageTitle}"`);

    return this.fetchPage(client, source, canonicalId, pageMeta, isRecursive, maxDepthLimit, options);
  }

  /**
   * Queries database items, supporting incremental delta sync via last_edited_time.
   */
  private async fetchDatabase(
    client: Client,
    source: DataSource,
    databaseId: string,
    lastSync?: SyncState,
    options?: IngestionOptions
  ): Promise<RawDocument[]> {
    let filter: any = undefined;
    if (lastSync?.lastSyncedAt && !isNaN(Date.parse(lastSync.lastSyncedAt))) {
      filter = {
        timestamp: "last_edited_time",
        last_edited_time: {
          after: lastSync.lastSyncedAt,
        },
      };
    }

    const results: any[] = [];
    let cursor: string | undefined = undefined;

    do {
      const queryParams: any = {
        database_id: databaseId,
        page_size: 100,
        start_cursor: cursor,
      };
      if (filter) {
        queryParams.filter = filter;
      }

      let response: any;
      if (typeof (client.databases as any)?.query === "function") {
        response = await (client.databases as any).query(queryParams);
      } else if (typeof (client as any).request === "function") {
        response = await (client as any).request({
          path: `databases/${databaseId}/query`,
          method: "post",
          body: {
            start_cursor: cursor,
            page_size: 100,
            filter,
          },
        });
      } else if (typeof (client as any).dataSources?.query === "function") {
        response = await (client as any).dataSources.query({
          data_source_id: databaseId,
          start_cursor: cursor,
          page_size: 100,
          filter,
        });
      }

      if (response && Array.isArray(response.results)) {
        results.push(...response.results);
      }
      cursor = response?.has_more && response?.next_cursor ? response.next_cursor : undefined;
    } while (cursor);

    options?.onLog?.("info", `[Notion] Database query returned ${results.length} total item(s)`);

    const documents: RawDocument[] = [];

    for (const page of results) {
      if (!page || !page.id) continue;

      const title = this.extractTitleFromProperties(page.properties) || "Untitled Notion Document";
      const tags = extractTagsFromProperties(page.properties);
      const pageUrl = page.url || `https://www.notion.so/${page.id.replace(/-/g, "")}`;
      const publishedAt = safeIsoDate(page.last_edited_time || page.created_time);

      options?.onLog?.("debug", `[Notion] Ingesting database item: "${title}"`);

      let markdown = "";
      try {
        const rendered = await this.renderPageBlocksToMarkdown(client, page.id, pageUrl);
        markdown = rendered.markdown;
      } catch (err: any) {
        markdown = `*(Error retrieving page blocks: ${err.message || "access denied"})*`;
      }

      if (tags.length > 0) {
        markdown = `**Tags:** ${tags.join(", ")}\n\n${markdown}`;
      }

      const docId = crypto
        .createHash("sha256")
        .update(`${source.id}:${page.id}`)
        .digest("hex")
        .slice(0, 32);

      documents.push({
        id: docId,
        sourceId: source.id,
        title,
        rawContent: markdown,
        originUrl: pageUrl,
        publishedAt,
        guid: page.id,
      });
    }

    return documents;
  }

  /**
   * Fetches a single Notion Page, optionally crawling child pages recursively.
   */
  private async fetchPage(
    client: Client,
    source: DataSource,
    pageId: string,
    pageMeta: any,
    isRecursive: boolean,
    maxDepthLimit?: number,
    options?: IngestionOptions
  ): Promise<RawDocument[]> {
    const maxDepth = isRecursive ? (maxDepthLimit ?? this.defaultRecursiveDepth) : 0;
    const visited = new Set<string>();
    return this.crawlPageAndSubpages(client, source, pageId, pageMeta, maxDepth, 0, visited, [], options);
  }

  private async crawlPageAndSubpages(
    client: Client,
    source: DataSource,
    pageId: string,
    pageMeta: any,
    maxDepth: number,
    currentDepth: number,
    visited: Set<string>,
    breadcrumbs: Array<{ title: string; url: string; id: string }> = [],
    options?: IngestionOptions
  ): Promise<RawDocument[]> {
    if (!pageMeta || typeof pageMeta !== "object") return [];

    const canonicalKey = pageId.replace(/-/g, "").toLowerCase();
    if (visited.has(canonicalKey)) {
      return [];
    }
    visited.add(canonicalKey);

    const title = this.extractTitleFromProperties(pageMeta.properties) || "Untitled Notion Document";
    const pageUrl = pageMeta.url || `https://www.notion.so/${pageId.replace(/-/g, "")}`;
    const publishedAt = safeIsoDate(pageMeta.last_edited_time || pageMeta.created_time);

    options?.onLog?.("info", `[Notion] Crawling page "${title}" (depth ${currentDepth}/${maxDepth})`);

    const { markdown: renderedMarkdown, childPageIds, childDatabaseIds } = await this.renderPageBlocksToMarkdown(client, pageId, pageUrl);

    options?.onLog?.(
      "debug",
      `[Notion] "${title}": found ${childPageIds.length} child page(s), ${childDatabaseIds?.length || 0} child database(s)`
    );

    // Prepend multi-level parent provenance breadcrumbs when available
    let markdown = renderedMarkdown;
    if (breadcrumbs.length > 0) {
      const parentBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
      const hierarchyTrail = breadcrumbs.map((b) => `[${b.title}](${b.url})`).join(" ➔ ");
      markdown = `*Parent Hierarchy: ${hierarchyTrail}*\n*Parent: [${parentBreadcrumb.title}](${parentBreadcrumb.url})*\n\n${markdown}`;
      options?.onLog?.("debug", `[Notion] Hierarchy trail for "${title}": ${hierarchyTrail}`);
    }

    const docId = crypto
      .createHash("sha256")
      .update(`${source.id}:${pageId}`)
      .digest("hex")
      .slice(0, 32);

    const docs: RawDocument[] = [
      {
        id: docId,
        sourceId: source.id,
        title,
        rawContent: markdown,
        originUrl: pageUrl,
        publishedAt,
        guid: pageId,
      },
    ];

    if (currentDepth < maxDepth) {
      const nextBreadcrumbs = [...breadcrumbs, { title, url: pageUrl, id: pageId }];

      // 1. Crawl child pages
      if (childPageIds.length > 0) {
        for (const childId of childPageIds) {
          const childKey = childId.replace(/-/g, "").toLowerCase();
          if (visited.has(childKey)) continue;

          try {
            const childMeta = await client.pages.retrieve({ page_id: childId });
            const subDocs = await this.crawlPageAndSubpages(
              client,
              source,
              childId,
              childMeta,
              maxDepth,
              currentDepth + 1,
              visited,
              nextBreadcrumbs,
              options
            );
            docs.push(...subDocs);
          } catch {
            // Gracefully skip inaccessible or deleted child pages
            options?.onLog?.("warn", `[Notion] Inaccessible or deleted child page: ${childId}`);
          }
        }
      }

      // 2. Crawl child databases if any
      if (childDatabaseIds && childDatabaseIds.length > 0) {
        for (const dbId of childDatabaseIds) {
          const dbKey = dbId.replace(/-/g, "").toLowerCase();
          if (visited.has(dbKey)) continue;
          visited.add(dbKey);

          try {
            options?.onLog?.("info", `[Notion] Crawling child database ${dbId} inside "${title}"`);
            const dbDocs = await this.fetchDatabase(client, source, dbId, undefined, options);
            for (const dbDoc of dbDocs) {
              const hierarchyTrail = nextBreadcrumbs.map((b) => `[${b.title}](${b.url})`).join(" ➔ ");
              dbDoc.rawContent = `*Parent Hierarchy: ${hierarchyTrail}*\n*Parent: [${title}](${pageUrl})*\n\n${dbDoc.rawContent}`;
              docs.push(dbDoc);
            }
          } catch {
            // Gracefully skip inaccessible child databases
            options?.onLog?.("warn", `[Notion] Inaccessible or deleted child database: ${dbId}`);
          }
        }
      }
    }

    return docs;
  }

  /**
   * Extracts page title from Notion properties object.
   */
  extractTitleFromProperties(properties?: Record<string, any>): string {
    if (!properties || typeof properties !== "object") return "";

    for (const key of Object.keys(properties)) {
      const prop = properties[key];
      if (prop && prop.type === "title" && Array.isArray(prop.title)) {
        const titleText = prop.title
          .map((t: any) => t?.plain_text ?? t?.text?.content ?? "")
          .join("")
          .trim();
        if (titleText) return titleText;
      }
    }

    // Secondary fallback: check Name or Title fields directly
    if (properties.title && Array.isArray(properties.title.title)) {
      return renderRichText(properties.title.title).trim();
    }
    if (properties.Name && Array.isArray(properties.Name.title)) {
      return renderRichText(properties.Name.title).trim();
    }

    return "";
  }

  /**
   * Fetches all child blocks of a given block/page ID with pagination.
   */
  private async fetchAllChildBlocks(client: Client, blockId: string): Promise<any[]> {
    const blocks: any[] = [];
    let cursor: string | undefined = undefined;

    do {
      try {
        const response: any = await client.blocks.children.list({
          block_id: blockId,
          start_cursor: cursor,
          page_size: 100,
        });

        if (response && Array.isArray(response.results)) {
          blocks.push(...response.results);
        }
        cursor = response?.has_more && response?.next_cursor ? response.next_cursor : undefined;
      } catch {
        // If block child retrieval fails, return partial collected blocks
        break;
      }
    } while (cursor);

    return blocks;
  }

  /**
   * Fetches and renders all blocks for a page, tracking child pages and localizing images.
   */
  private async renderPageBlocksToMarkdown(
    client: Client,
    pageId: string,
    originUrl: string
  ): Promise<{ markdown: string; childPageIds: string[]; childDatabaseIds: string[] }> {
    const blocks = await this.fetchAllChildBlocks(client, pageId);
    const childPageIds: string[] = [];
    const childDatabaseIds: string[] = [];
    const renderedParts: string[] = [];

    for (const block of blocks) {
      const { text, childPageIds: ids, childDatabaseIds: dbIds } = await this.renderBlock(client, block, originUrl);
      if (ids && ids.length > 0) {
        childPageIds.push(...ids);
      }
      if (dbIds && dbIds.length > 0) {
        childDatabaseIds.push(...dbIds);
      }
      if (text && text.trim().length > 0) {
        renderedParts.push(text);
      }
    }

    return {
      markdown: renderedParts.join("\n\n"),
      childPageIds,
      childDatabaseIds,
    };
  }

  /**
   * Translates a single Notion block into Markdown.
   * Handles text, headings, lists, tables, callouts, codes, bookmarks, container blocks,
   * toggleable headings, and image localization.
   */
  private async renderBlock(
    client: Client,
    block: any,
    originUrl: string
  ): Promise<{ text: string; childPageIds?: string[]; childDatabaseIds?: string[] }> {
    if (!block || !block.type) {
      return { text: "" };
    }

    switch (block.type) {
      case "paragraph": {
        const text = renderRichText(block.paragraph?.rich_text);
        return { text };
      }

      case "heading_1":
      case "heading_2":
      case "heading_3": {
        const level = block.type === "heading_1" ? "#" : block.type === "heading_2" ? "##" : "###";
        const content = block[block.type];
        const headingText = renderRichText(content?.rich_text);
        let fullText = `${level} ${headingText}`;
        const childPageIds: string[] = [];
        const childDatabaseIds: string[] = [];

        if (content?.is_toggleable && block.has_children) {
          try {
            const children = await this.fetchAllChildBlocks(client, block.id);
            for (const child of children) {
              const res = await this.renderBlock(client, child, originUrl);
              if (res.childPageIds) childPageIds.push(...res.childPageIds);
              if (res.childDatabaseIds) childDatabaseIds.push(...res.childDatabaseIds);
              if (res.text) fullText += `\n> ${res.text.replace(/\n/g, "\n> ")}`;
            }
          } catch {}
        }
        return { text: fullText, childPageIds, childDatabaseIds };
      }

      case "bulleted_list_item": {
        let text = `- ${renderRichText(block.bulleted_list_item?.rich_text)}`;
        const childPageIds: string[] = [];
        const childDatabaseIds: string[] = [];
        if (block.has_children) {
          try {
            const children = await this.fetchAllChildBlocks(client, block.id);
            for (const child of children) {
              const res = await this.renderBlock(client, child, originUrl);
              if (res.childPageIds) childPageIds.push(...res.childPageIds);
              if (res.childDatabaseIds) childDatabaseIds.push(...res.childDatabaseIds);
              if (res.text) {
                text += `\n  ${res.text.replace(/\n/g, "\n  ")}`;
              }
            }
          } catch {}
        }
        return { text, childPageIds, childDatabaseIds };
      }

      case "numbered_list_item": {
        let text = `1. ${renderRichText(block.numbered_list_item?.rich_text)}`;
        const childPageIds: string[] = [];
        const childDatabaseIds: string[] = [];
        if (block.has_children) {
          try {
            const children = await this.fetchAllChildBlocks(client, block.id);
            for (const child of children) {
              const res = await this.renderBlock(client, child, originUrl);
              if (res.childPageIds) childPageIds.push(...res.childPageIds);
              if (res.childDatabaseIds) childDatabaseIds.push(...res.childDatabaseIds);
              if (res.text) {
                text += `\n   ${res.text.replace(/\n/g, "\n   ")}`;
              }
            }
          } catch {}
        }
        return { text, childPageIds, childDatabaseIds };
      }

      case "to_do": {
        const checked = block.to_do?.checked ? "- [x]" : "- [ ]";
        const content = renderRichText(block.to_do?.rich_text);
        return { text: `${checked} ${content}` };
      }

      case "toggle": {
        const summary = renderRichText(block.toggle?.rich_text);
        let innerText = "";
        const childPageIds: string[] = [];
        const childDatabaseIds: string[] = [];
        if (block.has_children) {
          try {
            const children = await this.fetchAllChildBlocks(client, block.id);
            const childTexts: string[] = [];
            for (const child of children) {
              const res = await this.renderBlock(client, child, originUrl);
              if (res.childPageIds) childPageIds.push(...res.childPageIds);
              if (res.childDatabaseIds) childDatabaseIds.push(...res.childDatabaseIds);
              if (res.text) childTexts.push(res.text);
            }
            innerText = childTexts.join("\n");
          } catch {}
        }
        return {
          text: innerText ? `> **${summary}**\n> ${innerText.replace(/\n/g, "\n> ")}` : `> **${summary}**`,
          childPageIds,
          childDatabaseIds,
        };
      }

      case "code": {
        const codeText = renderRichText(block.code?.rich_text);
        const lang = block.code?.language || "";
        const fence = codeText.includes("```") ? "````" : "```";
        return { text: `${fence}${lang}\n${codeText}\n${fence}` };
      }

      case "quote": {
        const quoteText = renderRichText(block.quote?.rich_text);
        return { text: `> ${quoteText.replace(/\n/g, "\n> ")}` };
      }

      case "callout": {
        const icon = block.callout?.icon?.emoji || "💡";
        const text = renderRichText(block.callout?.rich_text);
        return { text: `> ${icon} ${text.replace(/\n/g, "\n> ")}` };
      }

      case "divider": {
        return { text: "---" };
      }

      case "table": {
        try {
          const rows = await this.fetchAllChildBlocks(client, block.id);
          const tableLines: string[] = [];

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.type !== "table_row") continue;
            const cells = (row.table_row?.cells || []).map((cell: any[]) =>
              renderRichText(cell).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>").trim()
            );

            tableLines.push(`| ${cells.join(" | ")} |`);

            if (tableLines.length === 1) {
              const separator = cells.map(() => "---").join(" | ");
              tableLines.push(`| ${separator} |`);
            }
          }

          return { text: tableLines.join("\n") };
        } catch {
          return { text: "" };
        }
      }

      case "image": {
        const imgObj = block.image;
        let s3Url = "";
        if (imgObj?.type === "file") {
          s3Url = imgObj.file?.url || "";
        } else if (imgObj?.type === "external") {
          s3Url = imgObj.external?.url || "";
        }

        const caption = renderRichText(imgObj?.caption).trim() || "Notion Image";
        let finalUrl = s3Url;

        // AWS S3 Notion images expire in 60 minutes.
        // Download and localize via MediaService immediately when available.
        if (this.mediaService && s3Url) {
          try {
            const asset = await this.mediaService.downloadAndSave(s3Url, originUrl);
            if (asset && asset.url) {
              finalUrl = asset.url;
            }
          } catch {
            // Gracefully preserve original URL if download fails
          }
        }

        return { text: finalUrl ? `![${caption}](${finalUrl})` : "" };
      }

      case "child_page": {
        const title = block.child_page?.title || "Untitled Subpage";
        const link = `https://www.notion.so/${block.id.replace(/-/g, "")}`;
        return {
          text: `📄 [${title}](${link})`,
          childPageIds: [block.id],
        };
      }

      case "child_database": {
        const title = block.child_database?.title || "Untitled Database";
        const link = `https://www.notion.so/${block.id.replace(/-/g, "")}`;
        return {
          text: `🗄️ [${title}](${link})`,
          childDatabaseIds: [block.id],
        };
      }

      case "bookmark": {
        const url = block.bookmark?.url || "";
        return { text: url ? `[${url}](${url})` : "" };
      }

      case "link_preview": {
        const url = block.link_preview?.url || "";
        return { text: url ? `[${url}](${url})` : "" };
      }

      // Container block types: column_list, column, synced_block
      case "column_list":
      case "column":
      case "synced_block": {
        const childPageIds: string[] = [];
        const childDatabaseIds: string[] = [];
        const renderedTexts: string[] = [];
        if (block.has_children) {
          try {
            const children = await this.fetchAllChildBlocks(client, block.id);
            for (const child of children) {
              const res = await this.renderBlock(client, child, originUrl);
              if (res.childPageIds) childPageIds.push(...res.childPageIds);
              if (res.childDatabaseIds) childDatabaseIds.push(...res.childDatabaseIds);
              if (res.text) renderedTexts.push(res.text);
            }
          } catch {}
        }
        return { text: renderedTexts.join("\n\n"), childPageIds, childDatabaseIds };
      }

      default: {
        // Fallback for any other block with rich_text property
        const blockContent = block[block.type];
        if (blockContent && Array.isArray(blockContent.rich_text)) {
          const text = renderRichText(blockContent.rich_text);
          return { text };
        }
        return { text: "" };
      }
    }
  }

  /**
   * Extracts clean text and calculates content hash for change tracking.
   */
  extractCleanText(raw: RawDocument): CleanTextDocument {
    const textContent = normalizeCleanText(raw.rawContent || "");
    const contentHash = crypto.createHash("sha256").update(textContent, "utf8").digest("hex");

    return {
      id: raw.id,
      sourceId: raw.sourceId,
      title: raw.title,
      textContent,
      rawContent: raw.rawContent,
      originUrl: raw.originUrl,
      contentHash,
    };
  }
}
