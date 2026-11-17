import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DocumentSlicingEngine,
  IngestionService,
  StrategyRegistry,
  DataSourceRepository,
  SyncStateRepository,
  DocumentRepository,
  createDatabaseClient,
  type DataSource,
  type SpeechToTextPort,
} from "@flashcard-master/core";
import {
  InvalidYouTubeUrlError,
  MissingSubtitleError,
  UnavailableYouTubeVideoError,
  YouTubeIngestionStrategy,
  extractYouTubeVideoId,
  normalizeYouTubeUrl,
  parseYouTubeCaptionPayload,
} from "../src/index.js";

function buildWatchHtml(
  playerResponse: Record<string, any>,
  initialData?: Record<string, any>
): string {
  const initialDataScript = initialData
    ? `<script>var ytInitialData = ${JSON.stringify(initialData)};</script>`
    : "";
  return `<!doctype html><html><head><title>YouTube</title></head><body><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>${initialDataScript}</body></html>`;
}

function makeYouTubeSource(uri: string, id = "yt-src-1"): DataSource {
  return {
    id,
    name: "YouTube Source",
    type: "youtube",
    uri,
    tags: [],
    isActive: true,
    createdAt: "2026-11-15T08:00:00.000Z",
  };
}

describe("YouTubeIngestionStrategy (Story 21.4)", () => {
  it("normalizes watch, youtu.be, shorts, live, embed, and bare IDs and rejects invalid URLs", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://www.youtube.com/shorts/abcDEF12345")).toBe("abcDEF12345");
    expect(extractYouTubeVideoId("https://m.youtube.com/live/LiveId_1234")).toBe("LiveId_1234");
    expect(extractYouTubeVideoId("https://www.youtube.com/embed/EmbEd_12345")).toBe("EmbEd_12345");
    expect(extractYouTubeVideoId("youtube.com/watch?v=NoProto1234")).toBe("NoProto1234");
    expect(extractYouTubeVideoId("BareId_1234")).toBe("BareId_1234");

    expect(normalizeYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=15")).toEqual({
      videoId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(extractYouTubeVideoId("https://vimeo.com/123456789")).toBeNull();
    expect(extractYouTubeVideoId("https://fake-youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(() => normalizeYouTubeUrl("https://example.com/not-youtube")).toThrow(
      InvalidYouTubeUrlError
    );
  });

  it("parses TimedText XML, json3, and WebVTT caption payloads cleanly", () => {
    const xmlCues = parseYouTubeCaptionPayload(
      `<transcript><text start="1.5" dur="4.0">Paxos &amp;amp; Raft &amp;#39;quorums&amp;#39;</text></transcript>`
    );
    expect(xmlCues).toEqual([
      { startSeconds: 1.5, endSeconds: 5.5, text: "Paxos & Raft 'quorums'" },
    ]);

    const json3Cues = parseYouTubeCaptionPayload(
      JSON.stringify({
        events: [
          { tStartMs: 2000, dDurationMs: 3500, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
        ],
      })
    );
    expect(json3Cues).toEqual([{ startSeconds: 2, endSeconds: 5.5, text: "Hello world" }]);
  });

  it("prefers manual creator captions over auto-generated, extracts chapters, and filters custom timestamp ranges", async () => {
    const fetchedUrls: string[] = [];
    const playerResponse = {
      playabilityStatus: { status: "OK" },
      videoDetails: {
        videoId: "SysDesign01",
        title: "Distributed Systems Architecture",
        author: "Systems Channel",
        lengthSeconds: "300",
        shortDescription: [
          "Overview of consensus.",
          "00:00 Introduction",
          "01:00 Consensus & Quorums",
          "03:00 Summary",
        ].join("\n"),
      },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: "https://captions.example/asr-en",
              languageCode: "en",
              kind: "asr",
              name: { simpleText: "English (auto-generated)" },
            },
            {
              baseUrl: "https://captions.example/manual-en",
              languageCode: "en",
              name: { simpleText: "English" },
            },
          ],
        },
      },
    };

    const customFetch = (async (url: string | URL | Request) => {
      const u = String(url);
      fetchedUrls.push(u);
      if (u.startsWith("https://www.youtube.com/watch?v=SysDesign01")) {
        return new Response(buildWatchHtml(playerResponse), { status: 200 });
      }
      if (u === "https://captions.example/manual-en") {
        return new Response(
          [
            "<transcript>",
            '<text start="5.0" dur="10.0">Welcome to the talk.</text>',
            '<text start="65.0" dur="12.0">Quorum intersection ensures consistency.</text>',
            '<text start="185.0" dur="10.0">Closing summary thoughts.</text>',
            "</transcript>",
          ].join(""),
          { status: 200 }
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const strategy = new YouTubeIngestionStrategy({ customFetch });

    // Verify metadata extraction preserves channel name
    const metadata = await strategy.fetchVideoMetadata(
      "SysDesign01",
      "https://www.youtube.com/watch?v=SysDesign01"
    );
    expect(metadata.channel).toBe("Systems Channel");

    // Full video with chapters
    const docs = await strategy.fetch(makeYouTubeSource("https://youtu.be/SysDesign01?t=30"));
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("Distributed Systems Architecture");
    expect(docs[0].originUrl).toBe("https://www.youtube.com/watch?v=SysDesign01");
    expect(docs[0].startSeconds).toBe(5);
    expect(docs[0].endSeconds).toBe(195);
    expect(docs[0].rawContent).toContain("## [00:00 - 01:00] Introduction");
    expect(docs[0].rawContent).toContain("## [01:00 - 03:00] Consensus & Quorums");
    expect(docs[0].rawContent).toContain("Quorum intersection ensures consistency.");
    expect(fetchedUrls).toContain("https://captions.example/manual-en");
    expect(fetchedUrls).not.toContain("https://captions.example/asr-en");

    // Custom timestampRange filters out chapters outside 00:55 - 01:30
    const filteredDocs = await strategy.fetch(
      makeYouTubeSource(
        JSON.stringify([
          {
            uri: "https://www.youtube.com/watch?v=SysDesign01",
            extractionMode: "subtitles",
            timestampRanges: [{ start: "00:55", end: "01:30" }],
          },
        ])
      )
    );
    expect(filteredDocs).toHaveLength(1);
    expect(filteredDocs[0].startSeconds).toBe(65);
    expect(filteredDocs[0].endSeconds).toBe(77);
    expect(filteredDocs[0].rawContent).not.toContain("Introduction");
    expect(filteredDocs[0].rawContent).toContain("## [01:00 - 03:00] Consensus & Quorums");
    expect(filteredDocs[0].rawContent).toContain("Quorum intersection ensures consistency.");
  });

  it("uses auto-captions in 'auto' mode and throws MissingSubtitleError in 'subtitles' mode", async () => {
    const playerResponse = {
      playabilityStatus: { status: "OK" },
      videoDetails: {
        videoId: "AutoCap1234",
        title: "Lecture Without Manual Subtitles",
        lengthSeconds: "90",
      },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: "https://captions.example/asr-en",
              languageCode: "en-US",
              kind: "asr",
            },
          ],
        },
      },
    };

    const customFetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("https://www.youtube.com/watch?v=AutoCap1234")) {
        return new Response(buildWatchHtml(playerResponse), { status: 200 });
      }
      if (u === "https://captions.example/asr-en") {
        return new Response(
          "WEBVTT\n\n00:00:02.000 --> 00:00:06.000\nAuto-generated lecture transcript.\n",
          { status: 200 }
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const strategy = new YouTubeIngestionStrategy({ customFetch });

    const autoDocs = await strategy.fetch(
      makeYouTubeSource("https://www.youtube.com/shorts/AutoCap1234")
    );
    expect(autoDocs).toHaveLength(1);
    expect(autoDocs[0].originUrl).toBe("https://www.youtube.com/watch?v=AutoCap1234");
    expect(autoDocs[0].rawContent).toContain("Auto-generated lecture transcript.");

    await expect(
      strategy.fetch(
        makeYouTubeSource(
          JSON.stringify([
            {
              uri: "https://www.youtube.com/shorts/AutoCap1234",
              extractionMode: "subtitles",
            },
          ])
        )
      )
    ).rejects.toThrow(MissingSubtitleError);
  });

  it("falls back to yt-dlp audio extraction + pre-STT trimming when captions are unavailable or 'stt' mode is forced", async () => {
    const playerResponse = {
      playabilityStatus: { status: "OK" },
      videoDetails: {
        videoId: "NoCapStt999",
        title: "Captionless Talk",
        author: "Guest Speaker",
        lengthSeconds: "600",
      },
    };

    const customFetch = (async () =>
      new Response(buildWatchHtml(playerResponse), { status: 200 })) as typeof fetch;

    const commandsCalled: Array<{ cmd: string; args: string[] }> = [];
    let ytdlpTempDir = "";
    const commandRunner = async (cmd: string, args: string[]) => {
      commandsCalled.push({ cmd, args });
      if (cmd === "yt-dlp") {
        const outArg = args[args.indexOf("-o") + 1];
        ytdlpTempDir = path.dirname(outArg);
        await fs.writeFile(path.join(ytdlpTempDir, "audio.webm"), Buffer.from("webm-audio"));
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (cmd === "ffmpeg") {
        const segmentPath = args[args.length - 1];
        await fs.writeFile(segmentPath, Buffer.from("trimmed-mp3"));
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 1 };
    };

    const sttInputs: Array<{ audioPath?: string }> = [];
    const mockStt: SpeechToTextPort = {
      provider: "gemini",
      async transcribe(input) {
        sttInputs.push({ audioPath: input.audioPath });
        return {
          provider: "gemini",
          language: "en",
          cues: [{ startSeconds: 1.0, endSeconds: 5.5, text: "Transcribed trimmed YouTube audio." }],
          text: "Transcribed trimmed YouTube audio.",
        };
      },
    };

    const strategy = new YouTubeIngestionStrategy({
      customFetch,
      commandRunner,
      sttPort: mockStt,
    });

    const docs = await strategy.fetch(
      makeYouTubeSource(
        JSON.stringify([
          {
            uri: "https://www.youtube.com/live/NoCapStt999",
            extractionMode: "auto",
            sttProvider: "gemini",
            timestampRanges: [{ start: "02:00", end: "03:00" }],
          },
        ])
      )
    );

    expect(docs).toHaveLength(1);
    expect(docs[0].originUrl).toBe("https://www.youtube.com/watch?v=NoCapStt999");
    expect(docs[0].startSeconds).toBe(121);
    expect(docs[0].endSeconds).toBe(126);
    expect(docs[0].rawContent).toContain("[02:01 - 02:06] Transcribed trimmed YouTube audio.");
    expect(commandsCalled.map((c) => c.cmd)).toEqual(["yt-dlp", "ffmpeg"]);
    expect(commandsCalled[1].args).toContain("120");
    expect(commandsCalled[1].args).toContain("180");
    expect(sttInputs).toHaveLength(1);
    // Temp dir from yt-dlp download must be cleaned up
    await expect(fs.stat(ytdlpTempDir)).rejects.toThrow();
  });

  it("retrieves captions via InnerTube IOS fallback when watch-page timedtext returns empty", async () => {
    const playerResponse = {
      playabilityStatus: { status: "OK" },
      videoDetails: {
        videoId: "XpeGated001",
        title: "PO-Gated Watch TimedText",
        lengthSeconds: "120",
      },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: "https://captions.example/xpe-empty?exp=xpe",
              languageCode: "en",
              kind: "asr",
            },
          ],
        },
      },
    };

    let sawInnerTubeIosPost = false;
    const customFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith("https://www.youtube.com/watch?v=XpeGated001")) {
        return new Response(buildWatchHtml(playerResponse), { status: 200 });
      }
      if (u === "https://captions.example/xpe-empty?exp=xpe") {
        return new Response("", { status: 200 });
      }
      if (u.startsWith("https://www.youtube.com/youtubei/v1/player") && init?.method === "POST") {
        const parsed = JSON.parse(String(init.body || "{}"));
        if (parsed?.context?.client?.clientName === "IOS" && parsed?.videoId === "XpeGated001") {
          sawInnerTubeIosPost = true;
          return new Response(
            JSON.stringify({
              captions: {
                playerCaptionsTracklistRenderer: {
                  captionTracks: [
                    {
                      baseUrl: "https://captions.example/ios-direct-en",
                      languageCode: "en",
                      kind: "asr",
                    },
                  ],
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      if (u === "https://captions.example/ios-direct-en") {
        return new Response(
          '<transcript><text start="2.0" dur="4.0">Fetched directly from InnerTube IOS captions.</text></transcript>',
          { status: 200 }
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const commandsCalled: string[] = [];
    const strategy = new YouTubeIngestionStrategy({
      customFetch,
      commandRunner: async (cmd) => {
        commandsCalled.push(cmd);
        return { stdout: "", stderr: "", exitCode: 1 };
      },
      sttPort: {
        provider: "gemini",
        async transcribe() {
          throw new Error("STT should not run when InnerTube IOS captions succeed");
        },
      },
    });

    const docs = await strategy.fetch(makeYouTubeSource("https://www.youtube.com/watch?v=XpeGated001"));
    expect(sawInnerTubeIosPost).toBe(true);
    expect(commandsCalled).toEqual([]);
    expect(docs).toHaveLength(1);
    expect(docs[0].rawContent).toContain("[00:02 - 00:06] Fetched directly from InnerTube IOS captions.");
  });

  it("falls back to yt-dlp caption download when direct timedtext returns empty payload", async () => {
    const playerResponse = {
      playabilityStatus: { status: "OK" },
      videoDetails: {
        videoId: "EmptyTimed1",
        title: "Empty Direct TimedText Video",
        lengthSeconds: "120",
      },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: "https://captions.example/empty-timedtext",
              languageCode: "en",
              kind: "asr",
            },
          ],
        },
      },
    };

    const customFetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("https://www.youtube.com/watch?v=EmptyTimed1")) {
        return new Response(buildWatchHtml(playerResponse), { status: 200 });
      }
      if (u === "https://captions.example/empty-timedtext") {
        return new Response("", { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const commandsCalled: Array<{ cmd: string; args: string[] }> = [];
    let subTempDir = "";
    const commandRunner = async (cmd: string, args: string[]) => {
      commandsCalled.push({ cmd, args });
      if (cmd === "yt-dlp" && args.includes("--skip-download")) {
        const outArg = args[args.indexOf("-o") + 1];
        subTempDir = path.dirname(outArg);
        await fs.writeFile(
          path.join(subTempDir, "sub.en.vtt"),
          "WEBVTT\n\n00:00:03.000 --> 00:00:08.000\nDownloaded via yt-dlp VTT fallback.\n",
          "utf8"
        );
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 1 };
    };

    const unusedStt: SpeechToTextPort = {
      provider: "gemini",
      async transcribe() {
        throw new Error("STT should not be called when yt-dlp subtitle download succeeds");
      },
    };

    const strategy = new YouTubeIngestionStrategy({
      customFetch,
      commandRunner,
      sttPort: unusedStt,
    });

    const docs = await strategy.fetch(makeYouTubeSource("https://www.youtube.com/watch?v=EmptyTimed1"));
    expect(docs).toHaveLength(1);
    expect(docs[0].rawContent).toContain("[00:03 - 00:08] Downloaded via yt-dlp VTT fallback.");
    expect(commandsCalled).toHaveLength(1);
    expect(commandsCalled[0].cmd).toBe("yt-dlp");
    expect(commandsCalled[0].args).toEqual(
      expect.arrayContaining([
        "--no-playlist",
        "--skip-download",
        "--write-auto-subs",
        "--sub-langs",
        "en",
        "--sub-format",
        "vtt",
      ])
    );
    await expect(fs.stat(subTempDir)).rejects.toThrow();
  });

  it("auto-downloads yt-dlp binary into cacheDir when enabled", async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-ytdlp-test-"));
    try {
      const requestedUrls: string[] = [];
      const customFetch = (async (url: string | URL | Request) => {
        requestedUrls.push(String(url));
        return new Response(new Uint8Array(Buffer.from("ytdlp-binary-bytes")), { status: 200 });
      }) as typeof fetch;

      const strategy = new YouTubeIngestionStrategy({
        cacheDir,
        autoDownloadYtDlp: true,
        platform: "linux",
        arch: "x64",
        customFetch,
      });

      const resolved = await strategy.ensureYtDlpBinary();
      expect(resolved).toBe(path.join(cacheDir, "yt-dlp"));
      expect(await fs.readFile(resolved, "utf8")).toBe("ytdlp-binary-bytes");
      expect(requestedUrls).toEqual([
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux",
      ]);

      // Subsequent call uses cache without network request
      const cached = await strategy.ensureYtDlpBinary();
      expect(cached).toBe(resolved);
      expect(requestedUrls).toHaveLength(1);
    } finally {
      await fs.rm(cacheDir, { recursive: true, force: true });
    }
  });

  it("throws UnavailableYouTubeVideoError for private/removed videos and persists YouTube docs via IngestionService", async () => {
    const privateResponse = {
      playabilityStatus: {
        status: "LOGIN_REQUIRED",
        reason: "This is a private video.",
      },
    };

    const errorStrategy = new YouTubeIngestionStrategy({
      customFetch: (async () =>
        new Response(buildWatchHtml(privateResponse), { status: 200 })) as typeof fetch,
    });

    await expect(
      errorStrategy.fetch(makeYouTubeSource("https://www.youtube.com/watch?v=PrivateVid1"))
    ).rejects.toThrow(UnavailableYouTubeVideoError);

    // Multi-URL persistence through IngestionService + SQLite
    const db = createDatabaseClient({ inMemory: true });
    const sourceRepo = new DataSourceRepository(db);
    const syncRepo = new SyncStateRepository(db);
    const docRepo = new DocumentRepository(db);
    const registry = new StrategyRegistry();

    const customFetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("VideoOne111")) {
        return new Response(
          buildWatchHtml({
            playabilityStatus: { status: "OK" },
            videoDetails: { videoId: "VideoOne111", title: "First Talk", lengthSeconds: "40" },
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
            videoDetails: { videoId: "VideoTwo222", title: "Second Talk", lengthSeconds: "50" },
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [{ baseUrl: "https://cap.example/2", languageCode: "en" }],
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response('<transcript><text start="1.0" dur="3.0">Transcript content.</text></transcript>', {
        status: 200,
      });
    }) as typeof fetch;

    registry.register(new YouTubeIngestionStrategy({ customFetch }));
    const ingestion = new IngestionService(sourceRepo, syncRepo, registry, docRepo);

    const src = await sourceRepo.create({
      name: "YouTube Course",
      type: "youtube",
      uri: JSON.stringify([
        "https://www.youtube.com/watch?v=VideoOne111",
        "https://youtu.be/VideoTwo222",
      ]),
    });

    const result = await ingestion.syncSource(src.id);
    expect(result.error).toBeUndefined();
    expect(result.newCount).toBe(2);
    expect(result.newDocuments).toHaveLength(2);

    const saved = docRepo.listBySourceId(src.id);
    expect(saved).toHaveLength(2);
    expect(saved.map((d) => d.url).sort()).toEqual([
      "https://www.youtube.com/watch?v=VideoOne111",
      "https://www.youtube.com/watch?v=VideoTwo222",
    ]);
    expect(saved[0].startSeconds).toBe(1);
    expect(saved[0].endSeconds).toBe(4);
    db.close();
  });

  it("falls back to English before first alphabetical track when preferred language is unavailable", async () => {
    const multiTrackResponse = {
      playabilityStatus: { status: "OK" },
      videoDetails: { videoId: "MultiLang01", title: "Multilingual Talk", lengthSeconds: "60" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            { baseUrl: "https://cap.example/ar", languageCode: "ar", name: { simpleText: "Arabic" } },
            { baseUrl: "https://cap.example/en", languageCode: "en", name: { simpleText: "English" } },
            { baseUrl: "https://cap.example/fr", languageCode: "fr", name: { simpleText: "French" } },
          ],
        },
      },
    };
    const spanishOnlyResponse = {
      playabilityStatus: { status: "OK" },
      videoDetails: { videoId: "SpanishOnly", title: "Charla en Español", lengthSeconds: "60" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            { baseUrl: "https://cap.example/es", languageCode: "es", name: { simpleText: "Spanish" } },
          ],
        },
      },
    };

    const fetchedCaptionUrls: string[] = [];
    const customFetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("https://www.youtube.com/watch?v=MultiLang01")) {
        return new Response(buildWatchHtml(multiTrackResponse), { status: 200 });
      }
      if (u.startsWith("https://www.youtube.com/watch?v=SpanishOnly")) {
        return new Response(buildWatchHtml(spanishOnlyResponse), { status: 200 });
      }
      if (u.startsWith("https://cap.example/")) {
        fetchedCaptionUrls.push(u);
        return new Response(`<transcript><text start="0" dur="4">Selected ${u.split("/").pop()}</text></transcript>`, {
          status: 200,
        });
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const strategy = new YouTubeIngestionStrategy({
      customFetch,
      defaultCaptionLanguage: "ro",
    });

    const multiDocs = await strategy.fetch(makeYouTubeSource("https://www.youtube.com/watch?v=MultiLang01"));
    expect(multiDocs[0].rawContent).toContain("Selected en");

    const singleDocs = await strategy.fetch(makeYouTubeSource("https://www.youtube.com/watch?v=SpanishOnly"));
    expect(singleDocs[0].rawContent).toContain("Selected es");

    expect(fetchedCaptionUrls).toEqual(["https://cap.example/en", "https://cap.example/es"]);
  });

  it("extracts chapters from ytInitialData markersMap (even after HEATSEEKER) when description has no timestamps", async () => {
    const playerResponse = {
      playabilityStatus: { status: "OK" },
      videoDetails: {
        videoId: "AutoChap001",
        title: "Large Language Models explained briefly",
        author: "3Blue1Brown",
        lengthSeconds: "478",
        shortDescription: "A light intro to LLMs without timestamp lines in description.",
      },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ baseUrl: "https://cap.example/auto-ch", languageCode: "en" }],
        },
      },
    };

    const initialData = {
      playerOverlays: {
        playerOverlayRenderer: {
          decoratedPlayerBarRenderer: {
            decoratedPlayerBarRenderer: {
              playerBar: {
                multiMarkersPlayerBarRenderer: {
                  markersMap: [
                    {
                      key: "HEATSEEKER",
                      value: { heatmap: { heatmapRenderer: { maxHeightDp: 40 } } },
                    },
                    {
                      key: "AUTO_CHAPTERS",
                      value: {
                        chapters: [
                          {
                            chapterRenderer: {
                              title: { simpleText: "How chatbots work" },
                              timeRangeStartMillis: 0,
                            },
                          },
                          {
                            chapterRenderer: {
                              title: { simpleText: "Large language models" },
                              timeRangeStartMillis: 35079,
                            },
                          },
                          {
                            chapterRenderer: {
                              title: { simpleText: "Transformer architecture" },
                              timeRangeStartMillis: 282240,
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    };

    const customFetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("https://www.youtube.com/watch?v=AutoChap001")) {
        return new Response(buildWatchHtml(playerResponse, initialData), { status: 200 });
      }
      if (u === "https://cap.example/auto-ch") {
        return new Response(
          [
            `<transcript>`,
            `<text start="2.0" dur="5.0">Imagine chatting with a helpful bot.</text>`,
            `<text start="40.0" dur="6.0">Next word prediction powers large language models.</text>`,
            `<text start="290.0" dur="6.0">Inside the transformer, attention moves context between words.</text>`,
            `</transcript>`,
          ].join(""),
          { status: 200 }
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const strategy = new YouTubeIngestionStrategy({ customFetch });
    const metadata = await strategy.fetchVideoMetadata(
      "AutoChap001",
      "https://www.youtube.com/watch?v=AutoChap001"
    );
    expect(metadata.chapters).toEqual([
      { title: "How chatbots work", startSeconds: 0, endSeconds: 35.079 },
      { title: "Large language models", startSeconds: 35.079, endSeconds: 282.24 },
      { title: "Transformer architecture", startSeconds: 282.24, endSeconds: 478 },
    ]);

    const rawDocs = await strategy.fetch(makeYouTubeSource("https://www.youtube.com/watch?v=AutoChap001"));
    expect(rawDocs).toHaveLength(1);

    const cleanDoc = strategy.extractCleanText(rawDocs[0]);
    expect(cleanDoc.textContent).toContain("## [00:00 - 00:36] How chatbots work");
    expect(cleanDoc.textContent).toContain("## [00:35 - 04:43] Large language models");
    expect(cleanDoc.textContent).toContain("## [04:42 - 07:58] Transformer architecture");

    const slicer = new DocumentSlicingEngine();
    const sliced = slicer.slice(
      {
        sourceId: "yt-src-1",
        title: cleanDoc.title,
        textContent: cleanDoc.textContent,
        originUrl: cleanDoc.originUrl,
      },
      { mode: "chapters", minutesPerChunk: 10 }
    );
    expect(sliced).toHaveLength(3);
    expect(sliced.map((s) => s.title)).toEqual([
      "Large Language Models explained briefly - How chatbots work [00:00 - 00:36]",
      "Large Language Models explained briefly - Large language models [00:35 - 04:43]",
      "Large Language Models explained briefly - Transformer architecture [04:42 - 07:58]",
    ]);
  });

  it("ignores out-of-range numeric HTML entities in captions without throwing RangeError", async () => {
    const playerResponse = {
      playabilityStatus: { status: "OK" },
      videoDetails: {
        videoId: "EntityGrd01",
        title: "Entity &#9999999; Test",
        lengthSeconds: "60",
      },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ baseUrl: "https://captions.example/entity-guard", languageCode: "en" }],
        },
      },
    };

    const customFetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("https://www.youtube.com/watch?v=EntityGrd01")) {
        return new Response(buildWatchHtml(playerResponse), { status: 200 });
      }
      if (u === "https://captions.example/entity-guard") {
        return new Response(
          '<transcript><text start="1.0" dur="4.0">Valid &#65; and invalid &#9999999; &#x110000; entities.</text></transcript>',
          { status: 200 }
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const strategy = new YouTubeIngestionStrategy({ customFetch });
    const rawDocs = await strategy.fetch(makeYouTubeSource("https://www.youtube.com/watch?v=EntityGrd01"));
    expect(rawDocs).toHaveLength(1);
    const clean = strategy.extractCleanText(rawDocs[0]);
    expect(clean.textContent).toContain("Valid A and invalid &#9999999; &#x110000; entities.");
  });
});

