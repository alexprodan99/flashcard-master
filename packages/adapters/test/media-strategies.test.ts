import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  createDatabaseClient,
  DataSourceRepository,
  DocumentRepository,
  IngestionService,
  type SpeechToTextPort,
  StrategyRegistry,
  SyncStateRepository,
  type DataSource,
} from "@flashcard-master/core";
import {
  AudioIngestionStrategy,
  VideoIngestionStrategy,
  MissingSubtitleError,
  computeMediaItemConfigHash,
  extractTimestampBoundsFromText,
  filterCuesByTimestampRanges,
  type CommandRunner,
} from "../src/index.js";

function makeSource(partial: Partial<DataSource> & { type: DataSource["type"]; uri: string }): DataSource {
  return {
    id: partial.id ?? "11111111-1111-4111-8111-111111111111",
    name: partial.name ?? "Media Course",
    type: partial.type,
    uri: partial.uri,
    tags: partial.tags ?? [],
    isActive: partial.isActive ?? true,
  };
}

describe("Local Audio & Video Ingestion Strategies (Story 21.3)", () => {
  describe("Tier 1: Explicit & Sidecar .srt / .vtt Subtitles", () => {
    it("extracts coalesced transcript and startSeconds/endSeconds from explicit subtitlePath without invoking STT", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-audio-t1-"));
      try {
        const mp3Path = path.join(tmpDir, "lecture-01.mp3");
        const vttPath = path.join(tmpDir, "custom-captions.vtt");
        await fs.writeFile(mp3Path, Buffer.from("fake-mp3"));
        await fs.writeFile(
          vttPath,
          [
            "WEBVTT",
            "",
            "00:01:05.000 --> 00:01:09.000",
            "Write-Ahead Logging appends changes sequentially.",
            "",
            "00:01:10.000 --> 00:01:15.500",
            "Checkpoints flush dirty pages to disk.",
          ].join("\n")
        );

        const sttTranscribed = vi.fn();
        const mockStt: SpeechToTextPort = {
          provider: "openai",
          transcribe: sttTranscribed,
        };

        const strategy = new AudioIngestionStrategy({ sttPort: mockStt });
        const source = makeSource({
          type: "audio",
          uri: JSON.stringify([
            {
              uri: mp3Path,
              title: "WAL Fundamentals",
              extractionMode: "subtitles",
              subtitlePath: vttPath,
            },
          ]),
        });

        const rawDocs = await strategy.fetch(source);
        expect(sttTranscribed).not.toHaveBeenCalled();
        expect(rawDocs).toHaveLength(1);
        expect(rawDocs[0].title).toBe("WAL Fundamentals");
        expect(rawDocs[0].rawContent).toContain("[01:05 - 01:16]");
        expect(rawDocs[0].rawContent).toContain("Write-Ahead Logging appends changes sequentially.");

        const clean = strategy.extractCleanText(rawDocs[0]);
        expect(clean.startSeconds).toBe(65);
        expect(clean.endSeconds).toBe(76);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("auto-discovers matching sidecar .srt / .vtt files in auto mode and pairs directory scans without duplicating sidecars", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-media-dir-"));
      try {
        const videoPath = path.join(tmpDir, "lesson1.mp4");
        const sidecarSrt = path.join(tmpDir, "lesson1.srt");
        const standaloneVtt = path.join(tmpDir, "bonus-notes.vtt");

        await fs.writeFile(videoPath, Buffer.from("fake-mp4"));
        await fs.writeFile(
          sidecarSrt,
          "1\n00:00:02,000 --> 00:00:06,000\nB-Trees optimize disk page reads.\n"
        );
        await fs.writeFile(
          standaloneVtt,
          "WEBVTT\n\n00:00:10.000 --> 00:00:14.000\nStandalone caption notes.\n"
        );

        const sttTranscribed = vi.fn();
        const runner: CommandRunner = vi.fn(async () => ({
          stdout: "",
          stderr: "",
          exitCode: 0,
        }));

        const strategy = new VideoIngestionStrategy({
          sttPort: { provider: "openai", transcribe: sttTranscribed },
          commandRunner: runner,
        });

        const rawDocs = await strategy.fetch(
          makeSource({ type: "video", uri: tmpDir })
        );

        expect(sttTranscribed).not.toHaveBeenCalled();
        // Should NOT probe ffprobe/ffmpeg because Tier 1 sidecar matched for lesson1.mp4
        expect(runner).not.toHaveBeenCalled();
        // Sidecar lesson1.srt is paired with lesson1.mp4 (not ingested twice); bonus-notes.vtt is standalone
        expect(rawDocs).toHaveLength(2);
        const titles = rawDocs.map((d) => d.title).sort();
        expect(titles).toEqual(["bonus-notes", "lesson1"]);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("Tier 2: Embedded Video Subtitle Stream Extraction", () => {
    it("extracts embedded container subtitle track via ffprobe/ffmpeg in auto mode without invoking STT", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-video-t2-"));
      try {
        const mkvPath = path.join(tmpDir, "talk.mkv");
        await fs.writeFile(mkvPath, Buffer.from("fake-mkv"));

        const sttTranscribed = vi.fn();
        const commands: Array<{ cmd: string; args: string[] }> = [];
        const runner: CommandRunner = async (cmd, args) => {
          commands.push({ cmd, args });
          if (cmd === "ffprobe") {
            return {
              stdout: JSON.stringify({
                streams: [{ index: 2, codec_name: "subrip", tags: { language: "eng" } }],
              }),
              stderr: "",
              exitCode: 0,
            };
          }
          // ffmpeg extracting embedded track 0:s:0 to temp .srt path
          const outPath = args[args.length - 1];
          await fs.writeFile(
            outPath,
            "1\n00:02:00,000 --> 00:02:05,500\nRaft elects a single leader per term.\n"
          );
          return { stdout: "", stderr: "", exitCode: 0 };
        };

        const strategy = new VideoIngestionStrategy({
          commandRunner: runner,
          sttPort: { provider: "gemini", transcribe: sttTranscribed },
        });

        const rawDocs = await strategy.fetch(
          makeSource({ type: "video", uri: mkvPath })
        );

        expect(sttTranscribed).not.toHaveBeenCalled();
        expect(commands.some((c) => c.cmd === "ffprobe")).toBe(true);
        const ffmpegCall = commands.find((c) => c.cmd === "ffmpeg");
        expect(ffmpegCall?.args).toContain("0:s:0");
        expect(rawDocs).toHaveLength(1);
        expect(rawDocs[0].rawContent).toContain("[02:00 - 02:06]");
        expect(rawDocs[0].rawContent).toContain("Raft elects a single leader per term.");
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("Tier 3: Explicit STT & Auto Fallback with Pre-STT Timestamp Trimming", () => {
    it("skips existing sidecar .srt when extractionMode is 'stt', trims audio windows first, and uses per-item sttProvider", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-stt-mode-"));
      try {
        const audioPath = path.join(tmpDir, "interview.mp3");
        const sidecarSrt = path.join(tmpDir, "interview.srt");
        await fs.writeFile(audioPath, Buffer.from("audio-bytes"));
        await fs.writeFile(sidecarSrt, "1\n00:00:01,000 --> 00:00:03,000\nIgnored sidecar.\n");

        const ffmpegArgs: string[][] = [];
        const runner: CommandRunner = async (cmd, args) => {
          if (cmd === "ffmpeg") {
            ffmpegArgs.push(args);
            const outPath = args[args.length - 1];
            await fs.writeFile(outPath, Buffer.from("trimmed-segment"));
            return { stdout: "", stderr: "", exitCode: 0 };
          }
          return { stdout: "", stderr: "", exitCode: 0 };
        };

        const resolvedProviders: Array<string | undefined> = [];
        const logs: Array<{ level: string; msg: string }> = [];

        const strategy = new AudioIngestionStrategy({
          commandRunner: runner,
          sttFactory: (provider) => {
            resolvedProviders.push(provider);
            return {
              provider: provider ?? "openai",
              async transcribe() {
                return {
                  provider: provider ?? "openai",
                  language: "en",
                  cues: [
                    { startSeconds: 5, endSeconds: 12, text: "MVCC gives each transaction a snapshot." },
                  ],
                  text: "MVCC gives each transaction a snapshot.",
                };
              },
            };
          },
        });

        const rawDocs = await strategy.fetch(
          makeSource({
            type: "audio",
            uri: JSON.stringify([
              {
                uri: audioPath,
                extractionMode: "stt",
                sttProvider: "whisper-local",
                timestampRanges: [{ start: "10:00", end: "20:00", label: "MVCC Section" }],
              },
            ]),
          }),
          undefined,
          { onLog: (level, msg) => logs.push({ level, msg }) }
        );

        expect(resolvedProviders).toEqual(["whisper-local"]);
        expect(ffmpegArgs[0]).toContain("-ss");
        expect(ffmpegArgs[0]).toContain("600");
        expect(ffmpegArgs[0]).toContain("-to");
        expect(ffmpegArgs[0]).toContain("1200");
        expect(rawDocs).toHaveLength(1);
        // Cue at 5s..12s inside trimmed window [600s..1200s] => [10:05 - 10:12]
        expect(rawDocs[0].rawContent).toContain("[10:05 - 10:12]");
        expect(rawDocs[0].rawContent).not.toContain("Ignored sidecar");
        expect(logs.some((l) => l.msg.includes("Trimming audio window(s)"))).toBe(true);
        expect(logs.some((l) => l.msg.includes("whisper-local Speech-to-Text"))).toBe(true);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("falls back to STT in auto mode when no external or embedded subtitles exist", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-auto-fallback-"));
      try {
        const videoPath = path.join(tmpDir, "no-subs.mp4");
        await fs.writeFile(videoPath, Buffer.from("mp4-bytes"));

        const runner: CommandRunner = async (cmd, args) => {
          if (cmd === "ffprobe") {
            return { stdout: JSON.stringify({ streams: [] }), stderr: "", exitCode: 0 };
          }
          if (cmd === "ffmpeg") {
            await fs.writeFile(args[args.length - 1], Buffer.from("extracted-audio"));
            return { stdout: "", stderr: "", exitCode: 0 };
          }
          return { stdout: "", stderr: "", exitCode: 0 };
        };

        const strategy = new VideoIngestionStrategy({
          commandRunner: runner,
          sttFactory: (provider) => ({
            provider: provider ?? "gemini",
            async transcribe() {
              return {
                provider: provider ?? "gemini",
                cues: [{ startSeconds: 1, endSeconds: 6, text: "Transcribed via Gemini fallback." }],
                text: "Transcribed via Gemini fallback.",
              };
            },
          }),
        });

        const rawDocs = await strategy.fetch(
          makeSource({
            type: "video",
            uri: JSON.stringify([{ uri: videoPath, extractionMode: "auto", sttProvider: "gemini" }]),
          })
        );

        expect(rawDocs).toHaveLength(1);
        expect(rawDocs[0].rawContent).toBe("[00:01 - 00:06] Transcribed via Gemini fallback.");
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("Missing Subtitle Error Guard, Mixed Multi-Item Sources & IngestionService Persistence", () => {
    it("throws MissingSubtitleError when extractionMode is 'subtitles' and no subtitles exist, never calling STT", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-miss-sub-"));
      try {
        const audioPath = path.join(tmpDir, "unsubtitled.mp3");
        await fs.writeFile(audioPath, Buffer.from("bytes"));

        const sttTranscribed = vi.fn();
        const strategy = new AudioIngestionStrategy({
          sttPort: { provider: "openai", transcribe: sttTranscribed },
        });

        await expect(
          strategy.fetch(
            makeSource({
              type: "audio",
              uri: JSON.stringify([{ uri: audioPath, extractionMode: "subtitles" }]),
            })
          )
        ).rejects.toThrow(MissingSubtitleError);
        expect(sttTranscribed).not.toHaveBeenCalled();

        await expect(
          strategy.fetch(
            makeSource({
              type: "audio",
              uri: JSON.stringify([
                {
                  uri: audioPath,
                  extractionMode: "subtitles",
                  subtitlePath: path.join(tmpDir, "does-not-exist.srt"),
                },
              ]),
            })
          )
        ).rejects.toThrow(MissingSubtitleError);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("processes multi-item mixed sources, invalidates hashes on config changes, and persists timeline bounds in SQLite", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-multi-e2e-"));
      const db = createDatabaseClient({ inMemory: true });

      try {
        const a1 = path.join(tmpDir, "track1.mp3");
        const s1 = path.join(tmpDir, "track1.srt");
        const a2 = path.join(tmpDir, "track2.wav");
        await fs.writeFile(a1, Buffer.from("track1"));
        await fs.writeFile(
          s1,
          [
            "1",
            "00:00:05,000 --> 00:00:10,000",
            "Clip before range.",
            "",
            "2",
            "00:01:00,000 --> 00:01:12,000",
            "Core explanation inside range.",
          ].join("\n")
        );
        await fs.writeFile(a2, Buffer.from("track2"));

        const sttCalls: string[] = [];
        const audioStrategy = new AudioIngestionStrategy({
          sttFactory: () => ({
            provider: "openai",
            async transcribe(input) {
              sttCalls.push(input.audioPath || "");
              return {
                provider: "openai",
                cues: [{ startSeconds: 0, endSeconds: 8, text: "Track 2 spoken summary." }],
                text: "Track 2 spoken summary.",
              };
            },
          }),
        });

        const sourceRepo = new DataSourceRepository(db);
        const syncRepo = new SyncStateRepository(db);
        const docRepo = new DocumentRepository(db);
        const registry = new StrategyRegistry();
        registry.register(audioStrategy);

        const createdSource = sourceRepo.create({
          name: "Podcast Series",
          type: "audio",
          uri: JSON.stringify([
            {
              uri: a1,
              title: "Episode 1",
              extractionMode: "subtitles",
              timestampRanges: [{ start: "00:50", end: "01:20" }],
            },
            {
              uri: a2,
              title: "Episode 2",
              extractionMode: "stt",
              sttProvider: "openai",
            },
          ]),
        });

        const ingestionService = new IngestionService(sourceRepo, syncRepo, registry, docRepo);
        const syncRes = await ingestionService.syncSource(createdSource.id);

        expect(syncRes.error).toBeUndefined();
        expect(syncRes.newCount).toBe(2);
        // Track 1 used subtitles, Track 2 used STT
        expect(sttCalls).toEqual([a2]);

        const persistedDocs = docRepo.listBySourceId(createdSource.id);
        expect(persistedDocs).toHaveLength(2);
        const ep1 = persistedDocs.find((d) => d.title === "Episode 1");
        const ep2 = persistedDocs.find((d) => d.title === "Episode 2");
        expect(ep1?.textContent).toContain("Core explanation inside range.");
        expect(ep1?.textContent).not.toContain("Clip before range.");
        expect(ep1?.startSeconds).toBe(60);
        expect(ep1?.endSeconds).toBe(72);
        expect(ep2?.startSeconds).toBe(0);
        expect(ep2?.endSeconds).toBe(8);

        // Verify delta hash helpers respond to config modifications
        const hashA = computeMediaItemConfigHash({ uri: a2, extractionMode: "stt", sttProvider: "openai" });
        const hashB = computeMediaItemConfigHash({ uri: a2, extractionMode: "stt", sttProvider: "gemini" });
        const hashC = computeMediaItemConfigHash({
          uri: a2,
          extractionMode: "stt",
          sttProvider: "openai",
          timestampRanges: [{ start: "01:00", end: "02:00" }],
        });
        expect(hashA).not.toBe(hashB);
        expect(hashA).not.toBe(hashC);

        expect(extractTimestampBoundsFromText("[01:05 - 01:20] A\n\n[02:10 - 02:30] B")).toEqual({
          startSeconds: 65,
          endSeconds: 150,
        });
        expect(
          filterCuesByTimestampRanges(
            [
              { startSeconds: 10, endSeconds: 20, text: "early" },
              { startSeconds: 50, endSeconds: 70, text: "overlap" },
            ],
            [{ start: "60", end: "90" }]
          )
        ).toEqual([{ startSeconds: 60, endSeconds: 70, text: "overlap" }]);
      } finally {
        db.close();
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
