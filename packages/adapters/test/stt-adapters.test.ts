import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as zlib from "node:zlib";
import JSZip from "jszip";
import { describe, it, expect, vi } from "vitest";
import { SettingsService, type SettingsRepository } from "@flashcard-master/core";
import { AudioTrimmer } from "../src/media/audio-trimmer.js";
import { OpenAiSttAdapter } from "../src/stt/openai-stt-adapter.js";
import { GeminiSttAdapter } from "../src/stt/gemini-stt-adapter.js";
import { LocalWhisperSttAdapter } from "../src/stt/local-whisper-stt-adapter.js";
import { createSttAdapter, createSttAdapterFromSettings } from "../src/stt/stt-factory.js";

function createMemorySettingsRepo(initial: Record<string, string> = {}): SettingsRepository {
  const store = new Map(Object.entries(initial));
  return {
    get: (key) => store.get(key) ?? null,
    getWithMetadata: (key) =>
      store.has(key)
        ? { key, value: store.get(key)!, updatedAt: "2026-11-14T12:00:00Z" }
        : null,
    set: (key, value) => {
      store.set(key, value);
    },
    delete: (key) => store.delete(key),
    list: () => Object.fromEntries(store.entries()),
    getAll: () =>
      Array.from(store.entries()).map(([key, value]) => ({
        key,
        value,
        updatedAt: "2026-11-14T12:00:00Z",
      })),
  };
}

describe("STT Adapters", () => {
  describe("OpenAiSttAdapter", () => {
    it("submits hardcoded whisper-1 verbose_json request and parses segment timestamps", async () => {
      let capturedUrl = "";
      let capturedAuth = "";
      let capturedForm: FormData | undefined;

      const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedAuth = (init?.headers as Record<string, string>)?.Authorization || "";
        capturedForm = init?.body as FormData;
        return new Response(
          JSON.stringify({
            language: "english",
            duration: 14.5,
            text: "Spaced repetition improves retention. Active recall beats passive review.",
            segments: [
              { start: 0.0, end: 6.2, text: "Spaced repetition improves retention." },
              { start: 6.5, end: 14.5, text: "Active recall beats passive review." },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const adapter = new OpenAiSttAdapter({
        apiKey: "sk-openai-test",
        customFetch: mockFetch as typeof fetch,
      });

      const res = await adapter.transcribe({
        audioBuffer: Buffer.from("fake-mp3-bytes"),
        filename: "clip.mp3",
        language: "en",
        timestampOffsetSeconds: 120,
      });

      expect(adapter.model).toBe("whisper-1");
      expect(capturedUrl).toBe("https://api.openai.com/v1/audio/transcriptions");
      expect(capturedAuth).toBe("Bearer sk-openai-test");
      expect(capturedForm?.get("model")).toBe("whisper-1");
      expect(capturedForm?.get("response_format")).toBe("verbose_json");
      expect(capturedForm?.get("timestamp_granularities[]")).toBe("segment");
      expect(capturedForm?.get("language")).toBe("en");

      expect(res).toEqual({
        provider: "openai",
        language: "english",
        durationSeconds: 14.5,
        text: "Spaced repetition improves retention. Active recall beats passive review.",
        cues: [
          { startSeconds: 120, endSeconds: 126.2, text: "Spaced repetition improves retention." },
          { startSeconds: 126.5, endSeconds: 134.5, text: "Active recall beats passive review." },
        ],
      });
    });

    it("merges pre-chunked segments via transcribeSegments with segment startSeconds offsets", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-openai-seg-"));
      try {
        const seg0 = path.join(tmpDir, "seg0.mp3");
        const seg1 = path.join(tmpDir, "seg1.mp3");
        await fs.writeFile(seg0, Buffer.from("part0"));
        await fs.writeFile(seg1, Buffer.from("part1"));

        let callCount = 0;
        const mockFetch = async () => {
          callCount += 1;
          return new Response(
            JSON.stringify({
              language: "en",
              duration: 5,
              text: `Part ${callCount}`,
              segments: [{ start: 1.0, end: 4.0, text: `Part ${callCount}` }],
            }),
            { status: 200 }
          );
        };

        const adapter = new OpenAiSttAdapter({
          apiKey: "sk-test",
          customFetch: mockFetch as typeof fetch,
        });

        const merged = await adapter.transcribeSegments([
          { filePath: seg0, startSeconds: 0, durationSeconds: 60 },
          { filePath: seg1, startSeconds: 60, durationSeconds: 60 },
        ]);

        expect(merged.cues).toEqual([
          { startSeconds: 1, endSeconds: 4, text: "Part 1" },
          { startSeconds: 61, endSeconds: 64, text: "Part 2" },
        ]);
        expect(merged.text).toBe("Part 1 Part 2");
        expect(merged.durationSeconds).toBe(120);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("delegates oversized audioPath files to AudioTrimmer", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-openai-big-"));
      try {
        const bigPath = path.join(tmpDir, "huge.mp3");
        await fs.writeFile(bigPath, Buffer.alloc(500, 7));

        const trimmer = new AudioTrimmer({
          tempDir: tmpDir,
          maxChunkBytes: 200,
          commandRunner: async (_cmd, args) => {
            const outPath = args[args.length - 1];
            const isPart = path.basename(outPath).includes("-part-");
            await fs.writeFile(outPath, Buffer.alloc(isPart ? 100 : 500, 1));
            return { stdout: "", stderr: "", exitCode: 0 };
          },
        });

        const trimSpy = vi.spyOn(trimmer, "transcribeWithTrimming");
        const adapter = new OpenAiSttAdapter({
          apiKey: "sk-test",
          maxFileBytes: 200,
          audioTrimmer: trimmer,
          customFetch: async () =>
            new Response(
              JSON.stringify({
                language: "en",
                text: "Chunk text",
                segments: [{ start: 0, end: 2, text: "Chunk text" }],
              }),
              { status: 200 }
            ),
        });

        const res = await adapter.transcribe({ audioPath: bigPath });
        expect(trimSpy).toHaveBeenCalledTimes(1);
        expect(res.cues.length).toBeGreaterThan(1);
        expect(res.cues[0].startSeconds).toBe(0);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("throws clear diagnostics when API key is missing or HTTP requests fail", async () => {
      const noKey = new OpenAiSttAdapter();
      await expect(
        noKey.transcribe({ audioBuffer: Buffer.from("x") })
      ).rejects.toThrow(/OpenAI API key is required/i);

      const authErr = new OpenAiSttAdapter({
        apiKey: "sk-bad",
        customFetch: async () => new Response("Unauthorized", { status: 401 }),
      });
      await expect(
        authErr.transcribe({ audioBuffer: Buffer.from("x") })
      ).rejects.toThrow(/\[openai-stt\].*Authentication failed/i);

      const rateErr = new OpenAiSttAdapter({
        apiKey: "sk-rate",
        customFetch: async () => new Response("Slow down", { status: 429 }),
      });
      await expect(
        rateErr.transcribe({ audioBuffer: Buffer.from("x") })
      ).rejects.toThrow(/\[openai-stt\].*Rate limit/i);
    });
  });

  describe("GeminiSttAdapter", () => {
    it("calls gemini-3.6-flash inline audio with structured schema and filters thought parts", async () => {
      let capturedUrl = "";
      let capturedBody: any;

      const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: "STOP",
                content: {
                  parts: [
                    { thought: true, text: "internal reasoning about timestamps" },
                    {
                      text: JSON.stringify({
                        language: "en",
                        segments: [
                          { startSeconds: 0.5, endSeconds: 4.0, text: "Welcome to systems design." },
                          { startSeconds: "00:05.000", endSeconds: "00:09.500", text: "Let's cover replication." },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        );
      };

      const adapter = new GeminiSttAdapter({
        apiKey: "gem-test-key",
        customFetch: mockFetch as typeof fetch,
      });

      const res = await adapter.transcribe({
        audioBuffer: Buffer.from("gemini-audio"),
        filename: "lesson.m4a",
        timestampOffsetSeconds: 300,
      });

      expect(adapter.model).toBe("gemini-3.6-flash");
      expect(capturedUrl).toContain("/models/gemini-3.6-flash:generateContent?key=gem-test-key");
      expect(capturedBody.contents[0].parts[1]).toEqual({
        inlineData: {
          mimeType: "audio/mp4",
          data: Buffer.from("gemini-audio").toString("base64"),
        },
      });
      expect(capturedBody.generationConfig.responseMimeType).toBe("application/json");
      expect(res).toEqual({
        provider: "gemini",
        language: "en",
        durationSeconds: 9.5,
        text: "Welcome to systems design. Let's cover replication.",
        cues: [
          { startSeconds: 300.5, endSeconds: 304, text: "Welcome to systems design." },
          { startSeconds: 305, endSeconds: 309.5, text: "Let's cover replication." },
        ],
      });
    });

    it("uploads oversized audio via Gemini File API and cleans up remote file in finally", async () => {
      const requests: Array<{ method: string; url: string }> = [];
      let generatePayload: any;

      const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || "GET";
        requests.push({ method, url: u });

        if (u.includes("/upload/v1beta/files")) {
          return new Response(
            JSON.stringify({
              file: {
                name: "files/temp-audio-42",
                uri: "https://generativelanguage.googleapis.com/v1beta/files/temp-audio-42",
              },
            }),
            { status: 200 }
          );
        }
        if (method === "DELETE") {
          return new Response("{}", { status: 200 });
        }

        generatePayload = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        segments: [{ startSeconds: 0, endSeconds: 3, text: "Uploaded audio text." }],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        );
      };

      const adapter = new GeminiSttAdapter({
        apiKey: "gem-key",
        inlineLimitBytes: 10,
        customFetch: mockFetch as typeof fetch,
      });

      const res = await adapter.transcribe({
        audioBuffer: Buffer.alloc(64, 9),
        filename: "large.wav",
      });

      expect(requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
        "POST /upload/v1beta/files",
        "POST /v1beta/models/gemini-3.6-flash:generateContent",
        "DELETE /v1beta/files/temp-audio-42",
      ]);
      expect(generatePayload.contents[0].parts[1]).toEqual({
        fileData: {
          mimeType: "audio/wav",
          fileUri: "https://generativelanguage.googleapis.com/v1beta/files/temp-audio-42",
        },
      });
      expect(res.text).toBe("Uploaded audio text.");
    });

    it("throws descriptive errors for missing Gemini key or blocked responses", async () => {
      const noKey = new GeminiSttAdapter();
      await expect(
        noKey.transcribe({ audioBuffer: Buffer.from("a") })
      ).rejects.toThrow(/Gemini API key is required/i);

      const blocked = new GeminiSttAdapter({
        apiKey: "gem-key",
        customFetch: async () =>
          new Response(
            JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] }),
            { status: 200 }
          ),
      });
      await expect(
        blocked.transcribe({ audioBuffer: Buffer.from("a") })
      ).rejects.toThrow(/SAFETY/);
    });
  });

  describe("LocalWhisperSttAdapter", () => {
    it("executes local whisper CLI, parses JSON segments, offsets timestamps, and cleans temp dir", async () => {
      let capturedArgs: string[] = [];
      let capturedOutDir = "";

      const adapter = new LocalWhisperSttAdapter({
        binaryPath: "/usr/local/bin/whisper",
        model: "small",
        commandRunner: async (_cmd, args) => {
          capturedArgs = args;
          const outDirIdx = args.indexOf("--output_dir");
          capturedOutDir = args[outDirIdx + 1];
          await fs.writeFile(
            path.join(capturedOutDir, "audio.json"),
            JSON.stringify({
              language: "en",
              segments: [
                { start: 0.0, end: 3.5, text: "Local whisper runs offline." },
                { start: 3.5, end: 7.0, text: "No audio leaves the device." },
              ],
            })
          );
          return { stdout: "", stderr: "", exitCode: 0 };
        },
      });

      const res = await adapter.transcribe({
        audioPath: "/recordings/voice-note.mp3",
        language: "en",
        timestampOffsetSeconds: 60,
      });

      expect(capturedArgs).toContain("--model");
      expect(capturedArgs).toContain("small");
      expect(capturedArgs).toContain("--output_format");
      expect(capturedArgs).toContain("json");
      expect(res).toEqual({
        provider: "whisper-local",
        language: "en",
        durationSeconds: 7,
        text: "Local whisper runs offline. No audio leaves the device.",
        cues: [
          { startSeconds: 60, endSeconds: 63.5, text: "Local whisper runs offline." },
          { startSeconds: 63.5, endSeconds: 67, text: "No audio leaves the device." },
        ],
      });
      // Out dir parent temp folder must be cleaned up
      await expect(fs.stat(path.dirname(capturedOutDir))).rejects.toThrow();
    });

    it("parses whisper.cpp stdout bracket timestamps and whisper.cpp millisecond offsets JSON", async () => {
      const stdoutAdapter = new LocalWhisperSttAdapter({
        commandRunner: async () => ({
          stdout: "[00:00:01.000 --> 00:00:04.500]  Consensus requires a quorum.\n",
          stderr: "",
          exitCode: 0,
        }),
      });

      const stdoutRes = await stdoutAdapter.transcribe({
        audioBuffer: Buffer.from("wav-bytes"),
      });
      expect(stdoutRes.cues).toEqual([
        { startSeconds: 1, endSeconds: 4.5, text: "Consensus requires a quorum." },
      ]);

      const jsonOffsetAdapter = new LocalWhisperSttAdapter({
        commandRunner: async (_cmd, args) => {
          const outDir = args[args.indexOf("--output_dir") + 1];
          await fs.writeFile(
            path.join(outDir, "cpp.json"),
            JSON.stringify({
              result: { language: "en" },
              transcription: [
                { offsets: { from: 1500, to: 4200 }, text: " B-Trees balance disk I/O." },
              ],
            })
          );
          return { stdout: "", stderr: "", exitCode: 0 };
        },
      });

      const cppRes = await jsonOffsetAdapter.transcribe({ audioPath: "/tmp/clip.wav" });
      expect(cppRes.cues).toEqual([
        { startSeconds: 1.5, endSeconds: 4.2, text: "B-Trees balance disk I/O." },
      ]);
      expect(cppRes.language).toBe("en");
    });

    it("parses .srt output files from CLI and WebVTT responses from HTTP endpoints", async () => {
      const srtCliAdapter = new LocalWhisperSttAdapter({
        commandRunner: async (_cmd, args) => {
          const outDir = args[args.indexOf("--output_dir") + 1];
          await fs.writeFile(
            path.join(outDir, "transcript.srt"),
            "1\n00:00:01,000 --> 00:00:04,000\nSubtitles parsed cleanly.\n"
          );
          return { stdout: "", stderr: "", exitCode: 0 };
        },
      });

      const srtRes = await srtCliAdapter.transcribe({
        audioPath: "/tmp/clip.mp3",
        timestampOffsetSeconds: 10,
      });
      expect(srtRes.cues).toEqual([
        { startSeconds: 11, endSeconds: 14, text: "Subtitles parsed cleanly." },
      ]);

      const vttHttpAdapter = new LocalWhisperSttAdapter({
        endpoint: "http://127.0.0.1:8080/inference",
        customFetch: async () =>
          new Response("WEBVTT\n\n00:00:02.000 --> 00:00:05.000\nHTTP WebVTT output.\n", {
            status: 200,
          }),
      });

      const vttRes = await vttHttpAdapter.transcribe({ audioBuffer: Buffer.from("x") });
      expect(vttRes.cues).toEqual([
        { startSeconds: 2, endSeconds: 5, text: "HTTP WebVTT output." },
      ]);
      expect(vttRes.text).toBe("HTTP WebVTT output.");
    });

    it("transcribes and probes health via local Whisper HTTP server mode", async () => {
      const visited: string[] = [];
      const mockFetch = async (url: string | URL | Request) => {
        const u = String(url);
        visited.push(u);
        if (u.endsWith("/health")) {
          return new Response("ok", { status: 200 });
        }
        return new Response(
          JSON.stringify({
            language: "en",
            duration: 4.2,
            segments: [{ start: 0, end: 4.2, text: "HTTP whisper response." }],
          }),
          { status: 200 }
        );
      };

      const adapter = new LocalWhisperSttAdapter({
        endpoint: "http://127.0.0.1:8080",
        model: "base",
        customFetch: mockFetch as typeof fetch,
      });

      const probe = await adapter.probeAvailability();
      expect(probe.available).toBe(true);
      expect(probe.mode).toBe("http");

      const res = await adapter.transcribe({
        audioBuffer: Buffer.from("audio"),
        filename: "note.wav",
      });
      expect(visited).toEqual([
        "http://127.0.0.1:8080/health",
        "http://127.0.0.1:8080/v1/audio/transcriptions",
      ]);
      expect(res.text).toBe("HTTP whisper response.");
    });

    it("returns clear diagnostics when local whisper binary is missing", async () => {
      const adapter = new LocalWhisperSttAdapter({
        binaryPath: "missing-whisper-bin",
        commandRunner: async () => {
          const err = new Error("spawn missing-whisper-bin ENOENT") as NodeJS.ErrnoException;
          err.code = "ENOENT";
          throw err;
        },
      });

      const probe = await adapter.probeAvailability();
      expect(probe.available).toBe(false);
      expect(probe.mode).toBe("cli");
      expect(probe.error).toContain("missing-whisper-bin");

      await expect(
        adapter.transcribe({ audioPath: "/tmp/note.mp3" })
      ).rejects.toThrow(/\[whisper-local\].*was not found/i);
    });

    it("auto-downloads Windows whisper.cpp zip binary + ggml-tiny.bin model, converts via ffmpeg, and parses transcript.json", async () => {
      const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-whisper-win-"));
      try {
        const zip = new JSZip();
        zip.file("Release/whisper-cli.exe", Buffer.from("whisper-cli-exe-bytes"));
        zip.file("Release/main.exe", Buffer.from("legacy-main-exe-bytes"));
        zip.file("Release/whisper.dll", Buffer.from("whisper-dll-bytes"));
        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
        const modelBuffer = Buffer.from("ggml-tiny-weights");

        const requestedUrls: string[] = [];
        const mockFetch = async (url: string | URL | Request) => {
          const u = String(url);
          requestedUrls.push(u);
          if (u.endsWith(".zip")) {
            return new Response(new Uint8Array(zipBuffer), { status: 200 });
          }
          if (u.endsWith("ggml-tiny.bin")) {
            return new Response(new Uint8Array(modelBuffer), { status: 200 });
          }
          return new Response("Not Found", { status: 404 });
        };

        const executedCommands: Array<{ cmd: string; args: string[] }> = [];
        const runner = async (cmd: string, args: string[]) => {
          executedCommands.push({ cmd, args });
          if (cmd === "ffmpeg") {
            const wavPath = args[args.length - 1];
            await fs.writeFile(wavPath, Buffer.from("pcm-16k-wav"));
            return { stdout: "", stderr: "", exitCode: 0 };
          }
          const ofPrefix = args[args.indexOf("-of") + 1];
          await fs.writeFile(
            `${ofPrefix}.json`,
            JSON.stringify({
              result: { language: "en" },
              transcription: [
                { offsets: { from: 0, to: 4200 }, text: " Bundled whisper-cli auto-downloaded cleanly." },
              ],
            })
          );
          return { stdout: "", stderr: "", exitCode: 0 };
        };

        const adapter = new LocalWhisperSttAdapter({
          cacheDir,
          model: "tiny",
          autoDownload: true,
          platform: "win32",
          arch: "x64",
          commandRunner: runner,
          customFetch: mockFetch as typeof fetch,
        });

        const initialProbe = await adapter.probeAvailability();
        expect(initialProbe).toEqual({
          available: true,
          mode: "cli",
          details: expect.stringContaining("will auto-download on first run"),
        });

        const res = await adapter.transcribe({
          audioPath: "/videos/lecture.mp4",
          language: "en",
          timestampOffsetSeconds: 10,
        });

        expect(requestedUrls).toEqual([
          "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip",
          "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
        ]);

        const expectedBin = path.join(cacheDir, "bin", "whisper-cli.exe");
        const expectedDll = path.join(cacheDir, "bin", "whisper.dll");
        const expectedModel = path.join(cacheDir, "models", "ggml-tiny.bin");
        expect(await fs.readFile(expectedBin, "utf8")).toBe("whisper-cli-exe-bytes");
        expect(await fs.readFile(expectedDll, "utf8")).toBe("whisper-dll-bytes");
        expect(await fs.readFile(expectedModel, "utf8")).toBe("ggml-tiny-weights");

        expect(executedCommands[0].cmd).toBe("ffmpeg");
        expect(executedCommands[1].cmd).toBe(expectedBin);
        expect(executedCommands[1].args).toContain("-m");
        expect(executedCommands[1].args).toContain(expectedModel);
        expect(executedCommands[1].args).toContain("-oj");
        expect(executedCommands[1].args[executedCommands[1].args.indexOf("-f") + 1]).toMatch(/input-16k\.wav$/);

        expect(res).toEqual({
          provider: "whisper-local",
          language: "en",
          durationSeconds: 4.2,
          text: "Bundled whisper-cli auto-downloaded cleanly.",
          cues: [
            { startSeconds: 10, endSeconds: 14.2, text: "Bundled whisper-cli auto-downloaded cleanly." },
          ],
        });

        const cachedProbe = await adapter.probeAvailability();
        expect(cachedProbe).toEqual({
          available: true,
          mode: "cli",
          details: expect.stringContaining("binary cached"),
        });
      } finally {
        await fs.rm(cacheDir, { recursive: true, force: true });
      }
    });

    it("auto-downloads and extracts .tgz and .tar.gz whisper.cpp archives for darwin and linux", async () => {
      function buildTarBuffer(entries: Array<{ name: string; content?: Buffer; linkname?: string; type?: string }>): Buffer {
        const blocks: Buffer[] = [];
        for (const entry of entries) {
          const header = Buffer.alloc(512, 0);
          header.write(entry.name, 0, Math.min(entry.name.length, 100), "utf8");
          header.write("0000755\0", 100, 8, "ascii");
          header.write("0000000\0", 108, 8, "ascii");
          header.write("0000000\0", 116, 8, "ascii");
          const size = entry.content ? entry.content.length : 0;
          header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
          header.write("00000000000\0", 136, 12, "ascii");
          header.fill(0x20, 148, 156);
          const typeChar = entry.type ?? "0";
          header[156] = typeChar.charCodeAt(0);
          if (entry.linkname) {
            header.write(entry.linkname, 157, Math.min(entry.linkname.length, 100), "utf8");
          }
          header.write("ustar\0", 257, 6, "ascii");
          header.write("00", 263, 2, "ascii");
          let sum = 0;
          for (let i = 0; i < 512; i += 1) sum += header[i];
          header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
          blocks.push(header);
          if (entry.content && entry.content.length > 0) {
            const pad = Math.ceil(entry.content.length / 512) * 512;
            const dataBlock = Buffer.alloc(pad, 0);
            entry.content.copy(dataBlock);
            blocks.push(dataBlock);
          }
        }
        blocks.push(Buffer.alloc(1024, 0));
        return Buffer.concat(blocks);
      }

      const darwinCache = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-whisper-mac-"));
      const linuxCache = await fs.mkdtemp(path.join(os.tmpdir(), "fcm-whisper-lin-"));

      try {
        const darwinTarGz = zlib.gzipSync(
          buildTarBuffer([
            { name: "package/whisper-aarch64-apple-darwin", content: Buffer.from("macho-arm64-bin") },
          ])
        );
        const darwinAdapter = new LocalWhisperSttAdapter({
          cacheDir: darwinCache,
          autoDownload: true,
          platform: "darwin",
          arch: "arm64",
          customFetch: (async () =>
            new Response(new Uint8Array(darwinTarGz), { status: 200 })) as typeof fetch,
        });

        const macBin = await darwinAdapter.ensureWhisperCppBinary();
        expect(macBin).toBe(path.join(darwinCache, "bin", "whisper-cli"));
        expect(await fs.readFile(macBin, "utf8")).toBe("macho-arm64-bin");

        const linuxTarGz = zlib.gzipSync(
          buildTarBuffer([
            { name: "whisper-bin-ubuntu-x64/whisper-cli", content: Buffer.from("elf-x64-bin") },
            { name: "whisper-bin-ubuntu-x64/libwhisper.so.1.9.5", content: Buffer.from("libwhisper-so") },
            { name: "whisper-bin-ubuntu-x64/libwhisper.so.1", type: "2", linkname: "libwhisper.so.1.9.5" },
          ])
        );
        const linuxAdapter = new LocalWhisperSttAdapter({
          cacheDir: linuxCache,
          autoDownload: true,
          platform: "linux",
          arch: "x64",
          customFetch: (async () =>
            new Response(new Uint8Array(linuxTarGz), { status: 200 })) as typeof fetch,
        });

        const linBin = await linuxAdapter.ensureWhisperCppBinary();
        expect(linBin).toBe(path.join(linuxCache, "bin", "whisper-cli"));
        expect(await fs.readFile(linBin, "utf8")).toBe("elf-x64-bin");
        expect(await fs.readFile(path.join(linuxCache, "bin", "libwhisper.so.1.9.5"), "utf8")).toBe("libwhisper-so");
        expect(await fs.readFile(path.join(linuxCache, "bin", "libwhisper.so.1"), "utf8")).toBe("libwhisper-so");
      } finally {
        await fs.rm(darwinCache, { recursive: true, force: true });
        await fs.rm(linuxCache, { recursive: true, force: true });
      }
    });
  });

  describe("createSttAdapter & createSttAdapterFromSettings", () => {
    it("resolves adapters directly and from SettingsService credentials without key duplication", () => {
      const repo = createMemorySettingsRepo({
        openai_api_key: "sk-settings-openai",
        gemini_api_key: "gem-settings-key",
        local_whisper_model: "medium",
        local_whisper_endpoint: "http://localhost:9000",
      });
      const settingsService = new SettingsService(repo, {});

      const openai = createSttAdapterFromSettings("openai", settingsService);
      expect(openai).toBeInstanceOf(OpenAiSttAdapter);
      expect(openai.provider).toBe("openai");

      const gemini = createSttAdapterFromSettings("gemini", settingsService);
      expect(gemini).toBeInstanceOf(GeminiSttAdapter);
      expect(gemini.provider).toBe("gemini");

      const localWhisper = createSttAdapterFromSettings(
        "whisper-local",
        settingsService
      ) as LocalWhisperSttAdapter;
      expect(localWhisper).toBeInstanceOf(LocalWhisperSttAdapter);
      expect(localWhisper.model).toBe("medium");
      expect(localWhisper.httpEndpoint).toBe("http://localhost:9000");

      const explicit = createSttAdapter({ provider: "whisper-local", localWhisperModel: "large-v3" });
      expect((explicit as LocalWhisperSttAdapter).model).toBe("large-v3");
    });

    it("falls back to gemini when default_stt_provider and openai_api_key are unset but gemini_api_key is configured", () => {
      const repo = createMemorySettingsRepo({
        gemini_api_key: "gem-only-key",
      });
      const settingsService = new SettingsService(repo, {});

      const adapter = createSttAdapterFromSettings(undefined, settingsService, {}, {});
      expect(adapter).toBeInstanceOf(GeminiSttAdapter);
      expect(adapter.provider).toBe("gemini");
    });
  });
});
