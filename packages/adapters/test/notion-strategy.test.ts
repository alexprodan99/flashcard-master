import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  NotionStrategy,
  extractNotionId,
  formatNotionUuid,
  renderRichText,
  sanitizeUri,
  extractTagsFromProperties,
} from "../src/ingestion/notion-strategy.js";
import type { DataSource, SyncState, MediaService } from "@flashcard-master/core";

describe("NotionStrategy Helper Functions", () => {
  describe("sanitizeUri", () => {
    it("redacts token and api_key query parameters", () => {
      const uri = "https://notion.so/workspace/Page-123456781234123412341234567890ab?token=secret_12345&api_key=secret_67890&recursive=true";
      const sanitized = sanitizeUri(uri);
      expect(sanitized).not.toContain("secret_12345");
      expect(sanitized).not.toContain("secret_67890");
      expect(sanitized).toContain("token=%5BREDACTED%5D");
      expect(sanitized).toContain("recursive=true");
    });
  });

  describe("extractNotionId", () => {
    it("extracts ID from standard Notion page URL with slug", () => {
      const url = "https://www.notion.so/workspace/My-Study-Notes-a1b2c3d4e5f60718293a4b5c6d7e8f90";
      expect(extractNotionId(url)).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90");
    });

    it("extracts database ID from URL with view query parameters without confusing view ID", () => {
      const url =
        "https://www.notion.so/workspace/Flashcard-DB-11223344556677889900aabbccddeeff?v=99887766554433221100aabbccddeeff&pvs=4";
      expect(extractNotionId(url)).toBe("11223344556677889900aabbccddeeff");
    });

    it("extracts ID from side-peek ?p= query parameter", () => {
      const url = "https://www.notion.so/workspace/Database-View?p=aabbccddeeff00112233445566778899&pm=s";
      expect(extractNotionId(url)).toBe("aabbccddeeff00112233445566778899");
    });

    it("extracts ID from short notion.so URL", () => {
      const url = "https://notion.so/a1b2c3d4e5f60718293a4b5c6d7e8f90";
      expect(extractNotionId(url)).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90");
    });

    it("extracts ID from notion.site domain", () => {
      const url = "https://myworkspace.notion.site/Guide-to-Biology-a1b2c3d4e5f60718293a4b5c6d7e8f90";
      expect(extractNotionId(url)).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90");
    });

    it("extracts and strips hyphens from standard 8-4-4-4-12 UUID", () => {
      const uuid = "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90";
      expect(extractNotionId(uuid)).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90");
    });

    it("accepts raw 32-character hex string", () => {
      const hex = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
      expect(extractNotionId(hex)).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90");
    });

    it("returns null for invalid strings", () => {
      expect(extractNotionId("")).toBeNull();
      expect(extractNotionId("https://google.com/not-a-notion-link")).toBeNull();
      expect(extractNotionId("hello-world-123")).toBeNull();
    });
  });

  describe("formatNotionUuid", () => {
    it("formats 32-hex string into hyphenated UUID format", () => {
      const hex = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
      expect(formatNotionUuid(hex)).toBe("a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90");
    });

    it("preserves non-32 length strings", () => {
      expect(formatNotionUuid("short")).toBe("short");
    });
  });

  describe("renderRichText", () => {
    it("renders plain text chunks without annotations", () => {
      const chunks = [{ plain_text: "Hello " }, { plain_text: "world!" }];
      expect(renderRichText(chunks)).toBe("Hello world!");
    });

    it("handles null, undefined, or empty chunks safely", () => {
      expect(renderRichText([null, undefined, {} as any])).toBe("");
    });

    it("applies markdown styling for bold, italic, code, strikethrough, and links", () => {
      const chunks = [
        { plain_text: "bold", annotations: { bold: true } },
        { plain_text: " and " },
        { plain_text: "italic", annotations: { italic: true } },
        { plain_text: " and " },
        { plain_text: "code", annotations: { code: true } },
        { plain_text: " and " },
        { plain_text: "strike", annotations: { strikethrough: true } },
        { plain_text: " and " },
        { plain_text: "link", href: "https://example.com" },
      ];
      expect(renderRichText(chunks)).toBe(
        "**bold** and *italic* and `code` and ~~strike~~ and [link](https://example.com)"
      );
    });
  });

  describe("extractTagsFromProperties", () => {
    it("extracts unique tags from multi_select and select properties", () => {
      const properties = {
        Category: {
          type: "select",
          select: { name: "Medicine" },
        },
        Topics: {
          type: "multi_select",
          multi_select: [{ name: "Cardiology" }, { name: "Anatomy" }],
        },
      };
      expect(extractTagsFromProperties(properties)).toEqual(["Medicine", "Cardiology", "Anatomy"]);
    });
  });
});

describe("NotionStrategy Ingestion", () => {
  const originalEnv = process.env.NOTION_API_KEY;

  beforeEach(() => {
    delete process.env.NOTION_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NOTION_API_KEY = originalEnv;
    } else {
      delete process.env.NOTION_API_KEY;
    }
  });

  const sampleSource: DataSource = {
    id: "src-notion-1",
    name: "Notion Knowledge Base",
    type: "notion",
    uri: "https://www.notion.so/workspace/Study-Guide-a1b2c3d4e5f60718293a4b5c6d7e8f90",
    targetDeck: "Biology",
    tags: ["exam", "biology"],
    isActive: true,
  };

  describe("Token Resolution", () => {
    it("resolves token from SettingsService", () => {
      const strategy = new NotionStrategy({
        settingsService: { getSecret: vi.fn().mockReturnValue("secret_from_settings") },
      });
      expect(strategy.resolveToken(sampleSource)).toBe("secret_from_settings");
    });

    it("falls back to process.env.NOTION_API_KEY when settingsService is empty", () => {
      process.env.NOTION_API_KEY = "secret_from_env";
      const strategy = new NotionStrategy({
        settingsService: { getSecret: vi.fn().mockReturnValue(null) },
      });
      expect(strategy.resolveToken(sampleSource)).toBe("secret_from_env");
    });

    it("falls back to URI parameter ?token= when neither service nor env exists", () => {
      const sourceWithToken: DataSource = {
        ...sampleSource,
        uri: "https://www.notion.so/workspace/Page-a1b2c3d4e5f60718293a4b5c6d7e8f90?token=secret_from_uri",
      };
      const strategy = new NotionStrategy();
      expect(strategy.resolveToken(sourceWithToken)).toBe("secret_from_uri");
    });

    it("throws descriptive error when no token is found", () => {
      const strategy = new NotionStrategy({
        settingsService: { getSecret: vi.fn().mockReturnValue(null) },
      });
      expect(() => strategy.resolveToken(sampleSource)).toThrow(
        /No Notion API token configured/
      );
    });

    it("redacts secret tokens from error message when URI ID extraction fails", async () => {
      const strategy = new NotionStrategy({
        settingsService: { getSecret: vi.fn().mockReturnValue("secret_key") },
      });
      const leakingSource: DataSource = {
        ...sampleSource,
        uri: "https://notion.so/invalid-path?token=super_secret_token_12345",
      };

      await expect(strategy.fetch(leakingSource)).rejects.toThrowError(
        expect.not.stringContaining("super_secret_token_12345")
      );
    });
  });

  describe("Database Ingestion", () => {
    it("auto-detects database, paginates query results across multiple pages, and extracts tags", async () => {
      const mockDatabaseRetrieve = vi.fn().mockResolvedValue({
        id: "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90",
        object: "database",
      });

      // Simulates 2-page pagination with has_more: true -> has_more: false
      const mockDatabaseQuery = vi.fn().mockImplementation(async ({ start_cursor }) => {
        if (!start_cursor) {
          return {
            object: "list",
            results: [
              {
                id: "page-1",
                url: "https://notion.so/page-1",
                created_time: "2026-09-01T10:00:00.000Z",
                last_edited_time: "2026-09-02T12:00:00.000Z",
                properties: {
                  Name: {
                    type: "title",
                    title: [{ plain_text: "Cellular Respiration" }],
                  },
                  Tags: {
                    type: "multi_select",
                    multi_select: [{ name: "Biology" }, { name: "Metabolism" }],
                  },
                },
              },
            ],
            has_more: true,
            next_cursor: "cursor-page-2",
          };
        }
        return {
          object: "list",
          results: [
            {
              id: "page-2",
              url: "https://notion.so/page-2",
              created_time: "2026-09-01T11:00:00.000Z",
              last_edited_time: "2026-09-02T13:00:00.000Z",
              properties: {
                Name: {
                  type: "title",
                  title: [{ plain_text: "Photosynthesis" }],
                },
              },
            },
          ],
          has_more: false,
        };
      });

      const mockBlocksChildrenList = vi.fn().mockImplementation(async ({ block_id }) => {
        if (block_id === "page-1") {
          return {
            results: [
              {
                type: "heading_1",
                heading_1: { rich_text: [{ plain_text: "Overview" }] },
              },
              {
                type: "paragraph",
                paragraph: {
                  rich_text: [
                    { plain_text: "ATP is produced in the " },
                    { plain_text: "mitochondria", annotations: { bold: true } },
                    { plain_text: "." },
                  ],
                },
              },
            ],
            has_more: false,
          };
        }
        return {
          results: [
            {
              type: "paragraph",
              paragraph: { rich_text: [{ plain_text: "Chlorophyll absorbs light." }] },
            },
          ],
          has_more: false,
        };
      });

      const mockClient: any = {
        databases: {
          retrieve: mockDatabaseRetrieve,
          query: mockDatabaseQuery,
        },
        pages: { retrieve: vi.fn() },
        blocks: { children: { list: mockBlocksChildrenList } },
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "test_secret" },
        notionClient: mockClient,
      });

      const docs = await strategy.fetch(sampleSource);

      expect(mockDatabaseRetrieve).toHaveBeenCalledWith({
        database_id: "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90",
      });
      expect(mockDatabaseQuery).toHaveBeenCalledTimes(2);

      expect(docs).toHaveLength(2);
      expect(docs[0].title).toBe("Cellular Respiration");
      expect(docs[0].rawContent).toContain("**Tags:** Biology, Metabolism");
      expect(docs[0].rawContent).toContain("# Overview");
      expect(docs[0].rawContent).toContain("ATP is produced in the **mitochondria**.");
      expect(docs[0].guid).toBe("page-1");

      expect(docs[1].title).toBe("Photosynthesis");
      expect(docs[1].rawContent).toContain("Chlorophyll absorbs light.");
    });

    it("executes via client.request when databases.query is undefined (matching Notion SDK v5)", async () => {
      const mockDatabaseRetrieve = vi.fn().mockResolvedValue({ id: "db-1" });
      const mockRequest = vi.fn().mockResolvedValue({
        object: "list",
        results: [
          {
            id: "page-req-1",
            properties: { title: { title: [{ plain_text: "Direct REST Query Item" }] } },
          },
        ],
        has_more: false,
      });

      const mockClient: any = {
        databases: { retrieve: mockDatabaseRetrieve }, // Notice query is undefined!
        request: mockRequest,
        blocks: {
          children: {
            list: vi.fn().mockResolvedValue({ results: [], has_more: false }),
          },
        },
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "test_secret" },
        notionClient: mockClient,
      });

      const docs = await strategy.fetch(sampleSource);

      expect(mockRequest).toHaveBeenCalledWith({
        path: "databases/a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90/query",
        method: "post",
        body: {
          start_cursor: undefined,
          page_size: 100,
          filter: undefined,
        },
      });
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe("Direct REST Query Item");
    });

    it("applies incremental delta filter using lastSyncedAt timestamp", async () => {
      const mockDatabaseRetrieve = vi.fn().mockResolvedValue({ id: "db-1" });
      const mockDatabaseQuery = vi.fn().mockResolvedValue({ results: [], has_more: false });

      const mockClient: any = {
        databases: {
          retrieve: mockDatabaseRetrieve,
          query: mockDatabaseQuery,
        },
        blocks: { children: { list: vi.fn() } },
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "test_secret" },
        notionClient: mockClient,
      });

      const lastSync: SyncState = {
        sourceId: sampleSource.id,
        lastSyncedAt: "2026-09-05T00:00:00.000Z",
        itemCount: 5,
      };

      const docs = await strategy.fetch(sampleSource, lastSync);

      expect(mockDatabaseQuery).toHaveBeenCalledWith({
        database_id: "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90",
        page_size: 100,
        start_cursor: undefined,
        filter: {
          timestamp: "last_edited_time",
          last_edited_time: {
            after: "2026-09-05T00:00:00.000Z",
          },
        },
      });
      expect(docs).toEqual([]);
    });

    it("fast-fails immediately when database retrieval encounters 401 unauthorized or 429 rate limit", async () => {
      const unauthorizedError: any = new Error("API token is invalid.");
      unauthorizedError.status = 401;
      unauthorizedError.code = "unauthorized";

      const mockClient: any = {
        databases: { retrieve: vi.fn().mockRejectedValue(unauthorizedError) },
        pages: { retrieve: vi.fn() },
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "invalid_secret" },
        notionClient: mockClient,
      });

      await expect(strategy.fetch(sampleSource)).rejects.toThrow("API token is invalid.");
      expect(mockClient.pages.retrieve).not.toHaveBeenCalled();
    });
  });

  describe("Page Ingestion & Rich Block Translation", () => {
    it("paginates block children across multiple calls when has_more: true", async () => {
      const mockDatabaseRetrieve = vi.fn().mockRejectedValue(new Error("Not db"));
      const mockPageRetrieve = vi.fn().mockResolvedValue({
        id: "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90",
        properties: { title: { title: [{ plain_text: "Paginated Page" }] } },
      });

      const mockBlocksList = vi.fn().mockImplementation(async ({ start_cursor }) => {
        if (!start_cursor) {
          return {
            results: [
              {
                type: "paragraph",
                paragraph: { rich_text: [{ plain_text: "Page 1 Content." }] },
              },
            ],
            has_more: true,
            next_cursor: "block-cursor-2",
          };
        }
        return {
          results: [
            {
              type: "paragraph",
              paragraph: { rich_text: [{ plain_text: "Page 2 Content." }] },
            },
          ],
          has_more: false,
        };
      });

      const mockClient: any = {
        databases: { retrieve: mockDatabaseRetrieve },
        pages: { retrieve: mockPageRetrieve },
        blocks: { children: { list: mockBlocksList } },
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "test_secret" },
        notionClient: mockClient,
      });

      const [doc] = await strategy.fetch(sampleSource);
      expect(mockBlocksList).toHaveBeenCalledTimes(2);
      expect(doc.rawContent).toContain("Page 1 Content.");
      expect(doc.rawContent).toContain("Page 2 Content.");
    });

    it("translates comprehensive block types including container blocks and code fences", async () => {
      const mockDatabaseRetrieve = vi.fn().mockRejectedValue(new Error("Not db"));

      const mockPageRetrieve = vi.fn().mockResolvedValue({
        id: "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90",
        url: "https://notion.so/my-study-page",
        created_time: "2026-09-01T08:00:00.000Z",
        last_edited_time: "2026-09-03T15:30:00.000Z",
        properties: {
          title: {
            type: "title",
            title: [{ plain_text: "Comprehensive Block Test Page" }],
          },
        },
      });

      const mockBlocksChildrenList = vi.fn().mockImplementation(async ({ block_id }) => {
        if (block_id === "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90") {
          return {
            results: [
              {
                type: "heading_1",
                heading_1: { rich_text: [{ plain_text: "Main Header" }] },
              },
              {
                type: "to_do",
                to_do: { checked: true, rich_text: [{ plain_text: "Completed action" }] },
              },
              {
                type: "to_do",
                to_do: { checked: false, rich_text: [{ plain_text: "Pending action" }] },
              },
              {
                type: "quote",
                quote: { rich_text: [{ plain_text: "Direct quote snippet" }] },
              },
              {
                type: "callout",
                callout: {
                  icon: { emoji: "🔥" },
                  rich_text: [{ plain_text: "Important callout message" }],
                },
              },
              {
                type: "code",
                code: {
                  language: "markdown",
                  rich_text: [{ plain_text: "Nested ``` inside code" }],
                },
              },
              {
                id: "synced-block-1",
                type: "synced_block",
                has_children: true,
              },
            ],
            has_more: false,
          };
        }
        if (block_id === "synced-block-1") {
          return {
            results: [
              {
                type: "paragraph",
                paragraph: { rich_text: [{ plain_text: "Reusable synced block paragraph." }] },
              },
            ],
            has_more: false,
          };
        }
        return { results: [], has_more: false };
      });

      const mockClient: any = {
        databases: { retrieve: mockDatabaseRetrieve },
        pages: { retrieve: mockPageRetrieve },
        blocks: { children: { list: mockBlocksChildrenList } },
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "test_secret" },
        notionClient: mockClient,
      });

      const [doc] = await strategy.fetch(sampleSource);

      expect(doc.title).toBe("Comprehensive Block Test Page");
      expect(doc.rawContent).toContain("# Main Header");
      expect(doc.rawContent).toContain("- [x] Completed action");
      expect(doc.rawContent).toContain("- [ ] Pending action");
      expect(doc.rawContent).toContain("> Direct quote snippet");
      expect(doc.rawContent).toContain("> 🔥 Important callout message");
      // Triple backticks should be enclosed in 4-backtick fence
      expect(doc.rawContent).toContain("````markdown");
      expect(doc.rawContent).toContain("Reusable synced block paragraph.");

      // CleanText extraction
      const clean = strategy.extractCleanText(doc);
      expect(clean.title).toBe(doc.title);
      expect(clean.textContent).toContain("Main Header");
      expect(clean.contentHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("translates Notion table blocks with multiline cells cleanly", async () => {
      const mockDatabaseRetrieve = vi.fn().mockRejectedValue(new Error("Not db"));
      const mockPageRetrieve = vi.fn().mockResolvedValue({
        id: "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90",
        properties: { title: { title: [{ plain_text: "Table Test" }] } },
      });

      const mockBlocksChildrenList = vi.fn().mockImplementation(async ({ block_id }) => {
        if (block_id === "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90") {
          return {
            results: [
              {
                id: "table-block-1",
                type: "table",
                table: { has_column_header: true },
              },
            ],
            has_more: false,
          };
        }
        if (block_id === "table-block-1") {
          return {
            results: [
              {
                type: "table_row",
                table_row: {
                  cells: [
                    [{ plain_text: "Concept" }],
                    [{ plain_text: "Definition" }],
                  ],
                },
              },
              {
                type: "table_row",
                table_row: {
                  cells: [
                    [{ plain_text: "Mitosis" }],
                    [{ plain_text: "Cell division\nresulting in 2 cells" }],
                  ],
                },
              },
            ],
            has_more: false,
          };
        }
        return { results: [], has_more: false };
      });

      const mockClient: any = {
        databases: { retrieve: mockDatabaseRetrieve },
        pages: { retrieve: mockPageRetrieve },
        blocks: { children: { list: mockBlocksChildrenList } },
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "test_secret" },
        notionClient: mockClient,
      });

      const [doc] = await strategy.fetch(sampleSource);
      expect(doc.rawContent).toContain("| Concept | Definition |");
      expect(doc.rawContent).toContain("| --- | --- |");
      // Multi-line cell text should be converted to <br> so row is not broken
      expect(doc.rawContent).toContain("| Mitosis | Cell division<br>resulting in 2 cells |");
    });
  });

  describe("Subpage Recursion (?recursive=true)", () => {
    it("recursively crawls child pages with parent provenance breadcrumbs and prevents cycles", async () => {
      const recursiveSource: DataSource = {
        ...sampleSource,
        uri: "https://www.notion.so/workspace/Root-Page-a1b2c3d4e5f60718293a4b5c6d7e8f90?recursive=true",
      };

      const mockDatabaseRetrieve = vi.fn().mockRejectedValue(new Error("Not db"));

      const mockPageRetrieve = vi.fn().mockImplementation(async ({ page_id }) => {
        if (page_id === "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90") {
          return {
            id: "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90",
            properties: { title: { title: [{ plain_text: "Root Document" }] } },
          };
        }
        if (page_id === "subpage-child-1") {
          return {
            id: "subpage-child-1",
            properties: { title: { title: [{ plain_text: "Child Chapter 1" }] } },
          };
        }
        if (page_id === "subpage-child-2") {
          return {
            id: "subpage-child-2",
            properties: { title: { title: [{ plain_text: "Grandchild Section 1.1" }] } },
          };
        }
        throw new Error("Page not found");
      });

      const mockBlocksChildrenList = vi.fn().mockImplementation(async ({ block_id }) => {
        if (block_id === "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90") {
          return {
            results: [
              {
                type: "paragraph",
                paragraph: { rich_text: [{ plain_text: "Welcome to Root." }] },
              },
              {
                id: "subpage-child-1",
                type: "child_page",
                child_page: { title: "Child Chapter 1" },
              },
            ],
            has_more: false,
          };
        }
        if (block_id === "subpage-child-1") {
          return {
            results: [
              {
                type: "paragraph",
                paragraph: { rich_text: [{ plain_text: "Chapter 1 content." }] },
              },
              {
                id: "subpage-child-2",
                type: "child_page",
                child_page: { title: "Grandchild Section 1.1" },
              },
              // Circular reference test: links back to root
              {
                id: "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90",
                type: "child_page",
                child_page: { title: "Root (Circular)" },
              },
            ],
            has_more: false,
          };
        }
        if (block_id === "subpage-child-2") {
          return {
            results: [
              {
                type: "paragraph",
                paragraph: { rich_text: [{ plain_text: "Grandchild leaf content." }] },
              },
            ],
            has_more: false,
          };
        }
        return { results: [], has_more: false };
      });

      const mockClient: any = {
        databases: { retrieve: mockDatabaseRetrieve },
        pages: { retrieve: mockPageRetrieve },
        blocks: { children: { list: mockBlocksChildrenList } },
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "test_secret" },
        notionClient: mockClient,
      });

      const docs = await strategy.fetch(recursiveSource);

      expect(docs).toHaveLength(3);
      expect(docs[0].title).toBe("Root Document");
      expect(docs[0].rawContent).toContain("Welcome to Root.");

      expect(docs[1].title).toBe("Child Chapter 1");
      expect(docs[1].rawContent).toContain("*Parent Hierarchy: [Root Document]");
      expect(docs[1].rawContent).toContain("*Parent: [Root Document]");
      expect(docs[1].rawContent).toContain("Chapter 1 content.");

      expect(docs[2].title).toBe("Grandchild Section 1.1");
      expect(docs[2].rawContent).toContain("*Parent Hierarchy: [Root Document]");
      expect(docs[2].rawContent).toContain("➔ [Child Chapter 1]");
      expect(docs[2].rawContent).toContain("*Parent: [Child Chapter 1]");
      expect(docs[2].rawContent).toContain("Grandchild leaf content.");
    });

    it("recursively crawls deep hierarchies up to 5 levels with parent lineage trail", async () => {
      const deepSource: DataSource = {
        id: "source-deep-1",
        name: "Deep Hierarchy Source",
        type: "notion",
        uri: "https://www.notion.so/workspace/p1-a1b2c3d4e5f60718293a4b5c6d7e8f90?recursive=true&depth=5",
        targetDeck: "AI",
        tags: [],
        isActive: true,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      };

      const mockDatabaseRetrieve = vi.fn().mockRejectedValue(new Error("Not db"));
      const mockPageRetrieve = vi.fn().mockImplementation(async ({ page_id }) => {
        return {
          id: page_id,
          properties: { title: { title: [{ plain_text: `Page Level ${page_id}` }] } },
        };
      });

      const mockBlocksChildrenList = vi.fn().mockImplementation(async ({ block_id }) => {
        if (block_id === "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90") {
          return {
            results: [
              { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Root Content" }] } },
              { id: "level-1", type: "child_page", child_page: { title: "Page Level level-1" } },
            ],
            has_more: false,
          };
        }
        if (block_id === "level-1") {
          return {
            results: [
              { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Level 1 Content" }] } },
              { id: "level-2", type: "child_page", child_page: { title: "Page Level level-2" } },
            ],
            has_more: false,
          };
        }
        if (block_id === "level-2") {
          return {
            results: [
              { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Level 2 Content" }] } },
              { id: "level-3", type: "child_page", child_page: { title: "Page Level level-3" } },
            ],
            has_more: false,
          };
        }
        if (block_id === "level-3") {
          return {
            results: [
              { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Level 3 Content" }] } },
              { id: "level-4", type: "child_page", child_page: { title: "Page Level level-4" } },
            ],
            has_more: false,
          };
        }
        if (block_id === "level-4") {
          return {
            results: [
              { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Level 4 Leaf Content" }] } },
            ],
            has_more: false,
          };
        }
        return { results: [], has_more: false };
      });

      const mockClient: any = {
        databases: { retrieve: mockDatabaseRetrieve },
        pages: { retrieve: mockPageRetrieve },
        blocks: { children: { list: mockBlocksChildrenList } },
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "test_secret" },
        notionClient: mockClient,
      });

      const docs = await strategy.fetch(deepSource);
      expect(docs).toHaveLength(5);
      expect(docs[4].title).toBe("Page Level level-4");
      expect(docs[4].rawContent).toContain(
        "*Parent Hierarchy: [Page Level a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90](https://www.notion.so/a1b2c3d4e5f60718293a4b5c6d7e8f90) ➔ [Page Level level-1](https://www.notion.so/level1) ➔ [Page Level level-2](https://www.notion.so/level2) ➔ [Page Level level-3](https://www.notion.so/level3)*"
      );
      expect(docs[4].rawContent).toContain("*Parent: [Page Level level-3]");
      expect(docs[4].rawContent).toContain("Level 4 Leaf Content");
    });

    it("crawls child database blocks embedded inside a page and attaches parent hierarchy", async () => {
      const dbSource: DataSource = {
        id: "source-child-db-1",
        name: "Source with Child DB",
        type: "notion",
        uri: "https://www.notion.so/workspace/p1-a1b2c3d4e5f60718293a4b5c6d7e8f90?recursive=true",
        targetDeck: "AI",
        tags: [],
        isActive: true,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      };

      const mockDatabaseRetrieve = vi.fn().mockImplementation(async ({ database_id }) => {
        if (database_id === "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90") {
          throw new Error("Root is page, not database");
        }
        if (database_id === "child-db-1") {
          return { id: "child-db-1", title: [{ plain_text: "Embedded Course Exercises" }] };
        }
        throw new Error("Not found");
      });

      const mockDatabaseQuery = vi.fn().mockImplementation(async ({ database_id }) => {
        if (database_id === "child-db-1") {
          return {
            results: [
              {
                id: "exercise-page-1",
                properties: { title: { title: [{ plain_text: "Exercise 1: Backprop" }] } },
                created_time: "2026-03-01T00:00:00.000Z",
              },
            ],
            has_more: false,
          };
        }
        return { results: [], has_more: false };
      });

      const mockPageRetrieve = vi.fn().mockImplementation(async ({ page_id }) => {
        if (page_id === "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90") {
          return {
            id: page_id,
            properties: { title: { title: [{ plain_text: "Deep Learning Course" }] } },
          };
        }
        return { id: page_id, properties: { title: { title: [{ plain_text: "Page" }] } } };
      });

      const mockBlocksChildrenList = vi.fn().mockImplementation(async ({ block_id }) => {
        if (block_id === "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90") {
          return {
            results: [
              { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Welcome to Deep Learning." }] } },
              { id: "child-db-1", type: "child_database", child_database: { title: "Embedded Course Exercises" } },
            ],
            has_more: false,
          };
        }
        if (block_id === "exercise-page-1") {
          return {
            results: [
              { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Implement gradient descent from scratch." }] } },
            ],
            has_more: false,
          };
        }
        return { results: [], has_more: false };
      });

      const mockClient: any = {
        databases: { retrieve: mockDatabaseRetrieve, query: mockDatabaseQuery },
        pages: { retrieve: mockPageRetrieve },
        blocks: { children: { list: mockBlocksChildrenList } },
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "test_secret" },
        notionClient: mockClient,
      });

      const docs = await strategy.fetch(dbSource);
      expect(docs).toHaveLength(2);
      expect(docs[0].title).toBe("Deep Learning Course");
      expect(docs[0].rawContent).toContain("🗄️ [Embedded Course Exercises]");

      expect(docs[1].title).toBe("Exercise 1: Backprop");
      expect(docs[1].rawContent).toContain("*Parent Hierarchy: [Deep Learning Course]");
      expect(docs[1].rawContent).toContain("*Parent: [Deep Learning Course]");
      expect(docs[1].rawContent).toContain("Implement gradient descent from scratch.");
    });
  });

  describe("S3 Presigned Media Localization", () => {
    it("intercepts AWS S3 image block and localizes via MediaService before expiration", async () => {
      const mockDatabaseRetrieve = vi.fn().mockRejectedValue(new Error("Not db"));
      const mockPageRetrieve = vi.fn().mockResolvedValue({
        id: "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90",
        properties: { title: { title: [{ plain_text: "Image Page" }] } },
      });

      const s3Url =
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/workspace/image.png?X-Amz-Expires=3600";

      const mockBlocksChildrenList = vi.fn().mockResolvedValue({
        results: [
          {
            type: "image",
            image: {
              type: "file",
              file: { url: s3Url },
              caption: [{ plain_text: "Mitochondria Diagram" }],
            },
          },
        ],
        has_more: false,
      });

      const mockMediaService: Partial<MediaService> = {
        downloadAndSave: vi.fn().mockResolvedValue({
          id: "media-1",
          filename: "mitochondria.webp",
          hash: "abc123hash",
          mimeType: "image/webp",
          byteSize: 12345,
          url: "/api/media/mitochondria.webp",
        }),
      };

      const mockClient: any = {
        databases: { retrieve: mockDatabaseRetrieve },
        pages: { retrieve: mockPageRetrieve },
        blocks: { children: { list: mockBlocksChildrenList } },
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "test_secret" },
        mediaService: mockMediaService as MediaService,
        notionClient: mockClient,
      });

      const [doc] = await strategy.fetch(sampleSource);

      expect(mockMediaService.downloadAndSave).toHaveBeenCalledWith(
        s3Url,
        expect.any(String)
      );
      expect(doc.rawContent).toContain("![Mitochondria Diagram](/api/media/mitochondria.webp)");
      expect(doc.rawContent).not.toContain("X-Amz-Expires");
    });

    it("gracefully preserves original URL when mediaService download fails", async () => {
      const s3Url = "https://prod-files-secure.s3.us-west-2.amazonaws.com/failing.png";

      const mockClient: any = {
        databases: { retrieve: vi.fn().mockRejectedValue(new Error("Not db")) },
        pages: {
          retrieve: vi.fn().mockResolvedValue({
            id: "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90",
            properties: { title: { title: [{ plain_text: "Failing Download Page" }] } },
          }),
        },
        blocks: {
          children: {
            list: vi.fn().mockResolvedValue({
              results: [
                {
                  type: "image",
                  image: {
                    type: "file",
                    file: { url: s3Url },
                    caption: [{ plain_text: "Failed Image" }],
                  },
                },
              ],
              has_more: false,
            }),
          },
        },
      };

      const mockFailingMediaService: Partial<MediaService> = {
        downloadAndSave: vi.fn().mockRejectedValue(new Error("Network timeout")),
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "test_secret" },
        mediaService: mockFailingMediaService as MediaService,
        notionClient: mockClient,
      });

      const [doc] = await strategy.fetch(sampleSource);
      expect(doc.rawContent).toContain(`![Failed Image](${s3Url})`);
    });
  });

  describe("Error Handling", () => {
    it("throws when neither database nor page can be retrieved", async () => {
      const mockClient: any = {
        databases: { retrieve: vi.fn().mockRejectedValue(new Error("Database not found")) },
        pages: { retrieve: vi.fn().mockRejectedValue(new Error("Page not found (404)")) },
      };

      const strategy = new NotionStrategy({
        settingsService: { getSecret: () => "test_secret" },
        notionClient: mockClient,
      });

      await expect(strategy.fetch(sampleSource)).rejects.toThrow(
        /Failed to retrieve Notion resource/
      );
    });
  });
});
