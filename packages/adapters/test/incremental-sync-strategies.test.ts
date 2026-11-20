import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createDatabaseClient,
  DataSourceRepository,
  DocumentRepository,
  IngestionService,
  StrategyRegistry,
  SyncStateRepository,
  type DataSource,
  type SpeechToTextPort,
} from "@flashcard-master/core";
import {
  AudioIngestionStrategy,
  LlmsTxtIngestionStrategy,
  LocalFileStrategy,
  NotionStrategy,
  RssIngestionStrategy,
  SitemapIngestionStrategy,
  VideoIngestionStrategy,
  WebReaderStrategy,
  YouTubeIngestionStrategy,
  type CommandRunner,
} from "../src/index.js";

function makeSource(
  partial: Partial<DataSource> & { type: DataSource["type"]; uri: string }
): DataSource {
  return {
    id: partial.id ?? "11111111-1111-4111-8111-111111111111",
    name: partial.name ?? "Test Source",
    type: partial.type,
    uri: partial.uri,
    tags: partial.tags ?? [],
    isActive: partial.isActive ?? true,
  };
}

function buildWatchHtml(playerResponse: unknown): string {
  return `<!doctype html><html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(
    playerResponse
  )};</script></body></html>`;
}

describe("Pre-Fetch Incremental Skipping Across All 9 Ingestion Strategies (Story 22.2)", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function makeTempDir(prefix: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  it("WebReaderStrategy skips known URLs pre-fetch in new-only mode and fetches all in full mode", async () => {
    const customFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(`<html><head><title>Title ${url}</title></head><body><article><p>Article body for ${url}</p></article></body></html>`, {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const strategy = new WebReaderStrategy({ customFetch });
    const source = makeSource({
      type: "web",
      uri: "https://example.com/a\nhttps://example.com/b",
    });

    const skipped: string[] = [];
    const docsNewOnly = await strategy.fetch(source, undefined, {
      syncMode: "new-only",
      knownItemKeys: new Set(["https://example.com/a#part=1"]),
      onItemSkipped: (key) => skipped.push(key),
    });

    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(String((customFetch as any).mock.calls[0][0])).toBe("https://example.com/b");
    expect(docsNewOnly).toHaveLength(1);
    expect(docsNewOnly[0].originUrl).toBe("https://example.com/b");
    expect(skipped).toEqual(["https://example.com/a"]);

    const docsFull = await strategy.fetch(source, undefined, {
      syncMode: "full",
      knownItemKeys: new Set(["https://example.com/a"]),
    });
    expect(customFetch).toHaveBeenCalledTimes(3);
    expect(docsFull).toHaveLength(2);
  });

  it("SitemapIngestionStrategy skips known article URLs before fetching article HTML", async () => {
    const customFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("sitemap.xml")) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://example.com/p1</loc></url><url><loc>https://example.com/p2</loc></url></urlset>`,
          { status: 200 }
        );
      }
      return new Response(`<html><body><article><p>Content ${url}</p></article></body></html>`, {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const strategy = new SitemapIngestionStrategy({ customFetch });
    const source = makeSource({ type: "sitemap", uri: "https://example.com/sitemap.xml" });
    const skipped: string[] = [];

    const docs = await strategy.fetch(source, undefined, {
      knownItemKeys: new Set(["https://example.com/p1#section=Intro"]),
      onItemSkipped: (key) => skipped.push(key),
    });

    const fetchedUrls = (customFetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(fetchedUrls).toEqual([
      "https://example.com/sitemap.xml",
      "https://example.com/p2",
    ]);
    expect(docs).toHaveLength(1);
    expect(skipped).toEqual(["https://example.com/p1"]);
  });

  it("LlmsTxtIngestionStrategy skips known catalog URLs before fetching article HTML", async () => {
    const customFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("llms.txt")) {
        return new Response(
          `# Docs\n- [Guide 1](https://example.com/g1)\n- [Guide 2](https://example.com/g2)\n`,
          { status: 200 }
        );
      }
      return new Response(`<html><body><article><p>Guide body ${url}</p></article></body></html>`, {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const strategy = new LlmsTxtIngestionStrategy({ customFetch });
    const source = makeSource({ type: "llms-txt", uri: "https://example.com/llms.txt" });
    const skipped: string[] = [];

    const docs = await strategy.fetch(source, undefined, {
      knownItemKeys: new Set(["https://example.com/g1"]),
      onItemSkipped: (key) => skipped.push(key),
    });

    const fetchedUrls = (customFetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(fetchedUrls).toEqual([
      "https://example.com/llms.txt",
      "https://example.com/g2",
    ]);
    expect(docs).toHaveLength(1);
    expect(skipped).toEqual(["https://example.com/g1"]);
  });

  it("RssIngestionStrategy filters known feed items by link or guid in new-only mode and returns all in full mode", async () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel><title>Feed</title>
        <item><title>Old Post</title><link>https://blog.example.com/old</link><guid>guid-old</guid><description>Old body</description></item>
        <item><title>New Post</title><link>https://blog.example.com/new</link><guid>guid-new</guid><description>New body</description></item>
      </channel></rss>`;

    const customFetch = vi.fn(async () => new Response(rssXml, { status: 200 })) as unknown as typeof fetch;
    const strategy = new RssIngestionStrategy({ customFetch });
    const source = makeSource({ type: "rss", uri: "https://blog.example.com/feed.xml" });
    const skipped: string[] = [];

    const docsNewOnly = await strategy.fetch(source, undefined, {
      knownItemKeys: new Set(["https://blog.example.com/old#part=1"]),
      onItemSkipped: (key) => skipped.push(key),
    });
    expect(docsNewOnly.map((d) => d.title)).toEqual(["New Post"]);
    expect(skipped).toEqual(["guid-old"]);

    const skippedByGuid: string[] = [];
    const docsGuidSkipped = await strategy.fetch(source, undefined, {
      knownItemKeys: new Set(["guid-new"]),
      onItemSkipped: (key) => skippedByGuid.push(key),
    });
    expect(docsGuidSkipped.map((d) => d.title)).toEqual(["Old Post"]);
    expect(skippedByGuid).toEqual(["guid-new"]);

    const docsFull = await strategy.fetch(source, undefined, {
      syncMode: "full",
      knownItemKeys: new Set(["https://blog.example.com/old"]),
    });
    expect(docsFull).toHaveLength(2);
  });

  it("LocalFileStrategy skips already-synced files before disk parsing and keeps same-named paths distinct", async () => {
    const dir = await makeTempDir("fm-inc-local-");
    const dirA = path.join(dir, "dirA");
    const dirB = path.join(dir, "dirB");
    await fs.mkdir(dirA, { recursive: true });
    await fs.mkdir(dirB, { recursive: true });

    const pdfA = path.join(dirA, "notes.pdf");
    const pdfB = path.join(dirB, "notes.pdf");
    const newMd = path.join(dirA, "fresh.md");

    await fs.writeFile(pdfA, "fake pdf bytes", "utf8");
    await fs.writeFile(pdfB, "fake pdf bytes", "utf8");
    await fs.writeFile(newMd, "# Fresh Note\n\nContent here.", "utf8");

    const strategy = new LocalFileStrategy();
    const parseSpy = vi
      .spyOn((strategy as any).pdfParser, "parse")
      .mockResolvedValue({ title: "notes.pdf", text: "Parsed PDF text" });

    const source = makeSource({ type: "local", uri: dir });
    const skipped: string[] = [];

    const docs = await strategy.fetch(source, undefined, {
      knownItemKeys: new Set([`file://${pdfA.replace(/\\/g, "/")}#page=1-3`]),
      onItemSkipped: (key) => skipped.push(key),
    });

    // pdfA skipped pre-parse; pdfB (different directory, same filename) & fresh.md parsed
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(docs).toHaveLength(2);
    expect(skipped).toHaveLength(1);
    expect(docs.some((d) => d.originUrl?.includes("dirB/notes.pdf"))).toBe(true);
    expect(docs.some((d) => d.originUrl?.includes("fresh.md"))).toBe(true);

    // Full mode re-parses both pdfA and pdfB
    parseSpy.mockClear();
    const fullDocs = await strategy.fetch(source, undefined, {
      syncMode: "full",
      knownItemKeys: new Set([`file://${pdfA.replace(/\\/g, "/")}`]),
    });
    expect(parseSpy).toHaveBeenCalledTimes(2);
    expect(fullDocs).toHaveLength(3);

    // Single-file EPUB skips parseFile when chapter URL is already known
    const epubPath = path.join(dir, "book.epub");
    await fs.writeFile(epubPath, "fake epub");
    const epubSpy = vi.spyOn((strategy as any).epubParser, "parseFile").mockResolvedValue({ chapters: [] });
    const epubSource = makeSource({ type: "local", uri: epubPath });
    const epubSkipped = await strategy.fetch(epubSource, undefined, {
      knownItemKeys: new Set([`file://${epubPath.replace(/\\/g, "/")}#ch01.xhtml`]),
    });
    expect(epubSkipped).toEqual([]);
    expect(epubSpy).not.toHaveBeenCalled();

    const spacedEpubPath = path.join(dir, "My Book.epub");
    await fs.writeFile(spacedEpubPath, "fake epub");
    const spacedSource = makeSource({ type: "local", uri: spacedEpubPath });
    const spacedSkipped: string[] = [];
    const spacedResult = await strategy.fetch(spacedSource, undefined, {
      knownItemKeys: new Set([
        `file://${spacedEpubPath.replace(/\\/g, "/")}#Chapter 1.xhtml`,
        `file://${spacedEpubPath.replace(/\\/g, "/")}#toc_sec1`,
      ]),
      onItemSkipped: (k) => spacedSkipped.push(k),
    });
    expect(spacedResult).toEqual([]);
    expect(spacedSkipped.length).toBe(1);
    expect(epubSpy).not.toHaveBeenCalled();
  });

  it("AudioIngestionStrategy & VideoIngestionStrategy skip known items before STT transcription", async () => {
    const dir = await makeTempDir("fm-inc-media-");
    const oldAudio = path.join(dir, "old.mp3");
    const newAudio = path.join(dir, "new.mp3");
    const oldVideo = path.join(dir, "old.mp4");
    const newVideo = path.join(dir, "new.mp4");

    await fs.writeFile(oldAudio, "audio1");
    await fs.writeFile(newAudio, "audio2");
    await fs.writeFile(oldVideo, "video1");
    await fs.writeFile(newVideo, "video2");

    const transcribe = vi.fn(async ({ audioPath }: { audioPath: string }) => ({
      provider: "openai" as const,
      text: `Transcript for ${path.basename(audioPath)}`,
      cues: [{ startSeconds: 0, endSeconds: 5, text: `Transcript for ${path.basename(audioPath)}` }],
    }));
    const sttPort: SpeechToTextPort = { provider: "openai", transcribe };

    const audioStrategy = new AudioIngestionStrategy({ sttPort });
    const audioSource = makeSource({
      type: "audio",
      uri: JSON.stringify([
        { uri: oldAudio, extractionMode: "stt" },
        { uri: newAudio, extractionMode: "stt" },
      ]),
    });

    const skippedAudio: string[] = [];
    const audioDocs = await audioStrategy.fetch(audioSource, undefined, {
      knownItemKeys: new Set([`file://${oldAudio.replace(/\\/g, "/")}#t=0,5`]),
      onItemSkipped: (key) => skippedAudio.push(key),
    });

    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(audioDocs).toHaveLength(1);
    expect(audioDocs[0].originUrl).toContain("new.mp3");
    expect(skippedAudio).toEqual([oldAudio]);

    transcribe.mockClear();

    const commandRunner: CommandRunner = vi.fn(async (cmd, args) => {
      if (cmd.includes("ffprobe")) {
        return { exitCode: 0, stdout: JSON.stringify({ streams: [] }), stderr: "" };
      }
      const outPath = args[args.length - 1];
      if (outPath && outPath.endsWith(".mp3")) {
        await fs.writeFile(outPath, "extracted-audio");
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const videoStrategy = new VideoIngestionStrategy({ sttPort, commandRunner });
    const videoSource = makeSource({
      type: "video",
      uri: JSON.stringify([
        { uri: oldVideo, extractionMode: "stt" },
        { uri: newVideo, extractionMode: "stt" },
      ]),
    });

    const skippedVideo: string[] = [];
    const videoDocs = await videoStrategy.fetch(videoSource, undefined, {
      knownItemKeys: new Set([oldVideo]),
      onItemSkipped: (key) => skippedVideo.push(key),
    });

    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(commandRunner).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([oldVideo]),
      expect.anything()
    );
    expect(videoDocs).toHaveLength(1);
    expect(videoDocs[0].originUrl).toContain("new.mp4");
    expect(skippedVideo).toEqual([oldVideo]);
  });

  it("YouTubeIngestionStrategy skips known videos by canonical videoId pre-fetch and re-syncs all in full mode", async () => {
    const customFetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("VideoOne111")) {
        return new Response(
          buildWatchHtml({
            playabilityStatus: { status: "OK" },
            videoDetails: { videoId: "VideoOne111", title: "Video One", lengthSeconds: "30" },
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [{ baseUrl: "https://cap.example/1", languageCode: "en" }],
              },
            },
          }),
          { status: 200 }
        );
      }
      if (u.includes("VideoTwo222")) {
        return new Response(
          buildWatchHtml({
            playabilityStatus: { status: "OK" },
            videoDetails: { videoId: "VideoTwo222", title: "Video Two", lengthSeconds: "35" },
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [{ baseUrl: "https://cap.example/2", languageCode: "en" }],
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response('<transcript><text start="0.0" dur="3.0">Captions here.</text></transcript>', {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const db = createDatabaseClient({ inMemory: true });
    const sourceRepo = new DataSourceRepository(db);
    const syncRepo = new SyncStateRepository(db);
    const docRepo = new DocumentRepository(db);
    const registry = new StrategyRegistry();
    registry.register(new YouTubeIngestionStrategy({ customFetch }));
    const ingestion = new IngestionService(sourceRepo, syncRepo, registry, docRepo);

    const source = sourceRepo.create({
      name: "YouTube Playlist",
      type: "youtube",
      uri: JSON.stringify([{ uri: "https://www.youtube.com/watch?v=VideoOne111" }]),
    });

    const first = await ingestion.syncSource(source.id, {
      slicing: { mode: "timestamps", minutesPerChunk: 5 },
    });
    expect(first.newCount).toBe(1);

    // Update source URI to include short youtu.be link for already-synced VideoOne111 + new VideoTwo222
    sourceRepo.update(source.id, {
      uri: JSON.stringify([
        { uri: "https://youtu.be/VideoOne111" },
        { uri: "https://www.youtube.com/watch?v=VideoTwo222" },
      ]),
    });
    (customFetch as any).mockClear();

    const second = await ingestion.syncSource(source.id, {
      slicing: { mode: "timestamps", minutesPerChunk: 5 },
    });
    const fetchUrlsSecond = (customFetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(fetchUrlsSecond.some((u: string) => u.includes("VideoOne111"))).toBe(false);
    expect(fetchUrlsSecond.some((u: string) => u.includes("VideoTwo222"))).toBe(true);
    expect(second.skippedCount).toBe(1);
    expect(second.newCount).toBe(1);
    expect(docRepo.listBySourceId(source.id)).toHaveLength(2);

    // Full mode fetches both videos
    (customFetch as any).mockClear();
    const third = await ingestion.syncSource(source.id, { syncMode: "full" });
    const fetchUrlsThird = (customFetch as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(fetchUrlsThird.some((u: string) => u.includes("VideoOne111"))).toBe(true);
    expect(fetchUrlsThird.some((u: string) => u.includes("VideoTwo222"))).toBe(true);
    expect(third.skippedCount).toBe(0);
    expect(third.newCount).toBe(2);

    db.close();
  });

  it("NotionStrategy skips unchanged known pages pre-fetch in new-only mode and bypasses filter in full mode", async () => {
    const pageId = "12345678-90ab-cdef-1234-567890abcdef";
    const dbId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    const mockPageClient = {
      databases: {
        retrieve: vi.fn().mockRejectedValue({ status: 404 }),
      },
      pages: {
        retrieve: vi.fn().mockResolvedValue({
          id: pageId,
          url: `https://www.notion.so/Page-${pageId.replace(/-/g, "")}`,
          last_edited_time: "2026-09-01T00:00:00.000Z",
          properties: {
            title: { type: "title", title: [{ plain_text: "Test Page" }] },
          },
        }),
      },
      blocks: {
        children: {
          list: vi.fn().mockResolvedValue({
            results: [
              {
                id: "blk-1",
                type: "paragraph",
                has_children: false,
                paragraph: { rich_text: [{ plain_text: "Body text" }] },
              },
            ],
            has_more: false,
          }),
        },
      },
    } as any;

    const strategy = new NotionStrategy({ notionClient: mockPageClient, settingsService: { getSecret: () => "ntn_test" } });
    const pageSource = makeSource({ type: "notion", uri: pageId });
    const skipped: string[] = [];

    const skippedDocs = await strategy.fetch(
      pageSource,
      { sourceId: pageSource.id, lastSyncedAt: "2026-09-10T00:00:00.000Z", itemCount: 1 },
      {
        knownItemKeys: new Set([pageId]),
        onItemSkipped: (key) => skipped.push(key),
      }
    );
    expect(skippedDocs).toEqual([]);
    expect(skipped).toEqual([pageId]);
    expect(mockPageClient.blocks.children.list).not.toHaveBeenCalled();

    const fullDocs = await strategy.fetch(
      pageSource,
      { sourceId: pageSource.id, lastSyncedAt: "2026-09-10T00:00:00.000Z", itemCount: 1 },
      { syncMode: "full", knownItemKeys: new Set([pageId]) }
    );
    expect(fullDocs).toHaveLength(1);
    expect(mockPageClient.blocks.children.list).toHaveBeenCalledTimes(1);

    // Database query omits last_edited_time filter when syncMode === 'full'
    const queryFn = vi.fn().mockResolvedValue({ results: [], has_more: false });
    const mockDbClient = {
      databases: {
        retrieve: vi.fn().mockResolvedValue({ id: dbId }),
        query: queryFn,
      },
      blocks: { children: { list: vi.fn() } },
    } as any;
    const dbStrategy = new NotionStrategy({ notionClient: mockDbClient, settingsService: { getSecret: () => "ntn_test" } });
    const dbSource = makeSource({ type: "notion", uri: dbId });

    await dbStrategy.fetch(
      dbSource,
      { sourceId: dbSource.id, lastSyncedAt: "2026-09-10T00:00:00.000Z", itemCount: 0 },
      { syncMode: "full" }
    );
    expect(queryFn).toHaveBeenCalledWith(
      expect.not.objectContaining({ filter: expect.anything() })
    );

    // Database query in 'new-only' mode sends last_edited_time filter and re-fetches edited pages
    queryFn.mockClear();
    await dbStrategy.fetch(
      dbSource,
      { sourceId: dbSource.id, lastSyncedAt: "2026-09-10T00:00:00.000Z", itemCount: 0 },
      { syncMode: "new-only" }
    );
    expect(queryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          timestamp: "last_edited_time",
          last_edited_time: { after: "2026-09-10T00:00:00.000Z" },
        },
      })
    );

    mockPageClient.blocks.children.list.mockClear();
    mockPageClient.pages.retrieve.mockResolvedValueOnce({
      id: pageId,
      url: `https://www.notion.so/Page-${pageId.replace(/-/g, "")}`,
      last_edited_time: "2026-09-20T00:00:00.000Z",
      properties: {
        title: { type: "title", title: [{ plain_text: "Edited Page" }] },
      },
    });
    const editedDocs = await strategy.fetch(
      pageSource,
      { sourceId: pageSource.id, lastSyncedAt: "2026-09-10T00:00:00.000Z", itemCount: 1 },
      { syncMode: "new-only", knownItemKeys: new Set([pageId]) }
    );
    expect(editedDocs).toHaveLength(1);
    expect(mockPageClient.blocks.children.list).toHaveBeenCalledTimes(1);
  });

  it("NotionStrategy forwards lastSync to child databases, skips S3 media on unchanged parent pages, and flags fetch errors", async () => {
    const parentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const childDbId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const childRowId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const mediaSpy = { downloadAndSave: vi.fn(async () => ({ url: "/api/media/x.webp" })) };

    const dbQueryFn = vi.fn().mockResolvedValue({
      results: [
        {
          id: childRowId,
          url: "https://www.notion.so/Row-" + childRowId.replace(/-/g, ""),
          last_edited_time: "2026-09-20T00:00:00.000Z",
          properties: { Name: { type: "title", title: [{ plain_text: "Updated Child DB Row" }] } },
        },
      ],
      has_more: false,
    });

    const mockClient: any = {
      pages: {
        retrieve: vi.fn().mockResolvedValue({
          id: parentId,
          url: "https://www.notion.so/Parent-" + parentId.replace(/-/g, ""),
          last_edited_time: "2026-09-01T00:00:00.000Z",
          properties: { title: { type: "title", title: [{ plain_text: "Parent" }] } },
        }),
      },
      databases: {
        retrieve: vi.fn(async ({ database_id }: any) => {
          if (database_id === parentId) throw new Error("Not a database");
          return { id: childDbId };
        }),
        query: dbQueryFn,
      },
      blocks: {
        children: {
          list: vi.fn().mockImplementation(async ({ block_id }: any) => {
            if (block_id === parentId) {
              return {
                results: [
                  { id: "img-1", type: "image", image: { type: "external", external: { url: "https://example.com/pic.png" } } },
                  { id: childDbId, type: "child_database", child_database: { title: "Sub DB" } },
                ],
                has_more: false,
              };
            }
            return { results: [], has_more: false };
          }),
        },
      },
    };

    const notion = new NotionStrategy({
      settingsService: { getSecret: () => "secret" },
      mediaService: mediaSpy as any,
      notionClient: mockClient,
    });
    const src = makeSource({
      type: "notion",
      uri: "https://www.notion.so/Parent-" + parentId.replace(/-/g, "") + "?recursive=true",
    });

    const docs = await notion.fetch(
      src,
      { sourceId: src.id, lastSyncedAt: "2026-09-10T00:00:00.000Z", itemCount: 2 },
      { syncMode: "new-only", knownItemKeys: new Set([parentId, childRowId]) }
    );

    expect(mediaSpy.downloadAndSave).not.toHaveBeenCalled();
    expect(dbQueryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        database_id: childDbId,
        filter: {
          timestamp: "last_edited_time",
          last_edited_time: { after: "2026-09-10T00:00:00.000Z" },
        },
      })
    );
    expect(docs.map((d) => d.title)).toEqual(["Updated Child DB Row"]);

    const rssErrors: string[] = [];
    const rss = new RssIngestionStrategy({ customFetch: async () => new Response("fail", { status: 503 }) });
    await rss.fetch(makeSource({ type: "rss", uri: "https://example.com/feed.xml" }), undefined, {
      onFetchError: (m) => rssErrors.push(m),
    });
    expect(rssErrors.length).toBe(1);
  });

  it("NotionStrategy prioritizes ?p= side-peek page ID over parent DB ID during incremental skip (Action Item 5)", async () => {
    const dbId = "11111111-1111-1111-1111-111111111111";
    const peekPageId = "22222222-2222-2222-2222-222222222222";
    const mockPeekClient: any = {
      databases: { retrieve: vi.fn().mockRejectedValue({ status: 404 }) },
      pages: {
        retrieve: vi.fn().mockResolvedValue({
          id: peekPageId,
          url: "https://www.notion.so/SidePeek-22222222222222222222222222222222",
          last_edited_time: "2026-09-01T00:00:00.000Z",
          properties: { title: { type: "title", title: [{ plain_text: "Peek Page" }] } },
        }),
      },
      blocks: { children: { list: vi.fn() } },
    };

    const notion = new NotionStrategy({
      notionClient: mockPeekClient,
      settingsService: { getSecret: () => "secret" },
    });
    const skipped: string[] = [];
    const docs = await notion.fetch(
      makeSource({
        type: "notion",
        uri: "https://www.notion.so/workspace-11111111111111111111111111111111?p=22222222222222222222222222222222",
      }),
      undefined,
      {
        syncMode: "new-only",
        knownItemKeys: new Set([peekPageId]),
        onItemSkipped: (k) => skipped.push(k),
      }
    );
    expect(docs).toEqual([]);
    expect(skipped).toEqual([peekPageId]);
    expect(dbId).not.toBe(peekPageId);
    expect(mockPeekClient.blocks.children.list).not.toHaveBeenCalled();
  });
});
