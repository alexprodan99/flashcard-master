import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { SpeechToTextPort } from "@flashcard-master/core";
import {
  AudioTrimmer,
  resolveBundledFfmpegPath,
  resolveBundledFfprobePath,
  type CommandRunner,
} from "../src/media/audio-trimmer.js";

describe("AudioTrimmer", () => {
  it("parses timestamp ranges and rejects invalid end <= start windows", () => {
    const trimmer = new AudioTrimmer();
    const parsed = trimmer.parseRanges([
      { start: "10:00", end: "20:00", label: "Core Proof" },
      { start: "01:02:03.500", end: "01:05:00", label: "Recap" },
    ]);

    expect(parsed).toEqual([
      { startSeconds: 600, endSeconds: 1200, durationSeconds: 600, label: "Core Proof" },
      { startSeconds: 3723.5, endSeconds: 3900, durationSeconds: 176.5, label: "Recap" },
    ]);

    expect(() => trimmer.parseRanges([{ start: "15:00", end: "10:00" }])).toThrow(/end must be strictly greater/i);
    expect(() => trimmer.parseRanges([{ start: "10:00", end: "10:00" }])).toThrow(/end must be strictly greater/i);
  });

  it("offsets transcript cues cleanly without mutating the source cues", () => {
    const original = [
      { startSeconds: 0.5, endSeconds: 4.25, text: "First sentence." },
      { startSeconds: 4.5, endSeconds: 9.0, text: "Second sentence." },
    ];
    const shifted = AudioTrimmer.offsetCues(original, 600);

    expect(shifted).toEqual([
      { startSeconds: 600.5, endSeconds: 604.25, text: "First sentence." },
      { startSeconds: 604.5, endSeconds: 609.0, text: "Second sentence." },
    ]);
    expect(original[0].startSeconds).toBe(0.5);
  });

  it("probes ffmpeg availability cleanly for both installed and missing binaries", async () => {
    const okTrimmer = new AudioTrimmer({
      commandRunner: async () => ({
        stdout: "ffmpeg version 7.0 Copyright (c) 2000-2024\nbuilt with gcc",
        stderr: "",
        exitCode: 0,
      }),
    });
    const ok = await okTrimmer.probeFfmpeg();
    expect(ok).toEqual({
      available: true,
      version: "ffmpeg version 7.0 Copyright (c) 2000-2024",
    });

    const missingTrimmer = new AudioTrimmer({
      commandRunner: async () => {
        const err = new Error("spawn ffmpeg ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      },
    });
    const missing = await missingTrimmer.probeFfmpeg();
    expect(missing.available).toBe(false);
    expect(missing.error).toContain("Install ffmpeg");
  });

  it("trims strictly to explicit timestamp ranges prior to STT and cleans up temp directory", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      const outPath = args[args.length - 1];
      await fs.writeFile(outPath, Buffer.from("trimmed-audio"));
      return { stdout: "", stderr: "", exitCode: 0 };
    };

    const trimmer = new AudioTrimmer({ commandRunner: runner });
    const batch = await trimmer.extractAndTrim("/media/lecture.mp4", [
      { start: "10:00", end: "20:00", label: "Part 1" },
      { start: "25:00", end: "30:00", label: "Part 2" },
    ]);

    expect(calls).toHaveLength(2);
    expect(calls[0].command).toBe("ffmpeg");
    expect(calls[0].args.slice(0, 12)).toEqual([
      "-y",
      "-ss",
      "600",
      "-to",
      "1200",
      "-i",
      "/media/lecture.mp4",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
    ]);
    expect(calls[1].args.slice(0, 8)).toEqual([
      "-y",
      "-ss",
      "1500",
      "-to",
      "1800",
      "-i",
      "/media/lecture.mp4",
      "-vn",
    ]);

    expect(batch.segments).toHaveLength(2);
    expect(batch.segments[0]).toMatchObject({
      startSeconds: 600,
      endSeconds: 1200,
      durationSeconds: 600,
      label: "Part 1",
    });
    expect(batch.segments[1]).toMatchObject({
      startSeconds: 1500,
      endSeconds: 1800,
      durationSeconds: 300,
      label: "Part 2",
    });

    const workDir = path.dirname(batch.segments[0].filePath);
    await batch.cleanup();
    await expect(fs.stat(workDir)).rejects.toThrow();
  });

  it("splits oversized segments exceeding maxChunkBytes into bounded sub-chunks with shifted offsets", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = async (_command, args) => {
      calls.push(args);
      const outPath = args[args.length - 1];
      // Make initial segment oversized (500 bytes > maxChunkBytes 200), sub-parts smaller (120 bytes)
      const isPart = path.basename(outPath).includes("-part-");
      await fs.writeFile(outPath, Buffer.alloc(isPart ? 120 : 500, 1));
      return { stdout: "", stderr: "", exitCode: 0 };
    };

    const trimmer = new AudioTrimmer({
      commandRunner: runner,
      maxChunkBytes: 200,
      defaultChunkDurationSeconds: 300,
    });

    const batch = await trimmer.extractAndTrim("/media/long.mp4", [
      { start: "00:00", end: "10:00", label: "Long Chapter" },
    ]);

    try {
      expect(batch.segments.length).toBeGreaterThan(1);
      expect(batch.segments[0].startSeconds).toBe(0);
      expect(batch.segments[batch.segments.length - 1].endSeconds).toBe(600);
      // Verify contiguous non-overlapping timeline
      for (let i = 1; i < batch.segments.length; i++) {
        expect(batch.segments[i].startSeconds).toBe(batch.segments[i - 1].endSeconds);
      }
      // Original unsplit file should have been removed after chunking
      const firstDir = path.dirname(batch.segments[0].filePath);
      const remainingFiles = await fs.readdir(firstDir);
      expect(remainingFiles.every((f) => f.includes("-part-"))).toBe(true);
    } finally {
      await batch.cleanup();
    }
  });

  it("chunks oversized full-media extractions without explicit ranges using ffprobe duration", async () => {
    const runner: CommandRunner = async (command, args) => {
      if (command === "ffprobe") {
        return { stdout: "600.0\n", stderr: "", exitCode: 0 };
      }
      const outPath = args[args.length - 1];
      const isPart = path.basename(outPath).includes("-part-");
      await fs.writeFile(outPath, Buffer.alloc(isPart ? 100 : 450, 2));
      return { stdout: "", stderr: "", exitCode: 0 };
    };

    const trimmer = new AudioTrimmer({
      commandRunner: runner,
      maxChunkBytes: 200,
      defaultChunkDurationSeconds: 300,
    });

    const batch = await trimmer.extractAndTrim("/media/full-podcast.mp3");
    try {
      expect(batch.segments.length).toBeGreaterThan(1);
      expect(batch.segments[0].startSeconds).toBe(0);
      expect(batch.segments[batch.segments.length - 1].endSeconds).toBe(600);
    } finally {
      await batch.cleanup();
    }
  });

  it("transcribes trimmed segments, offsets cues back to source timeline, and cleans up on errors", async () => {
    let createdWorkDir = "";
    const trimmer = new AudioTrimmer({
      tempDir: os.tmpdir(),
      commandRunner: async (_cmd, args) => {
        const outPath = args[args.length - 1];
        createdWorkDir = path.dirname(outPath);
        await fs.writeFile(outPath, Buffer.from("audio"));
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    const mockStt: SpeechToTextPort = {
      provider: "openai",
      async transcribe(input) {
        if (input.audioPath?.endsWith("segment-0.mp3")) {
          return {
            provider: "openai",
            language: "en",
            cues: [{ startSeconds: 0, endSeconds: 5.5, text: "First segment intro." }],
            text: "First segment intro.",
          };
        }
        return {
          provider: "openai",
          language: "en",
          cues: [{ startSeconds: 2.0, endSeconds: 8.25, text: "Second segment core." }],
          text: "Second segment core.",
        };
      },
    };

    const result = await trimmer.transcribeWithTrimming(mockStt, "/media/talk.mp3", {
      ranges: [
        { start: "10:00", end: "12:00" },
        { start: "25:00", end: "27:00" },
      ],
    });

    expect(result).toEqual({
      provider: "openai",
      language: "en",
      cues: [
        { startSeconds: 600, endSeconds: 605.5, text: "First segment intro." },
        { startSeconds: 1502, endSeconds: 1508.25, text: "Second segment core." },
      ],
      text: "First segment intro. Second segment core.",
      durationSeconds: 240,
    });
    await expect(fs.stat(createdWorkDir)).rejects.toThrow();

    // Error path must still clean up temp directory
    const failingStt: SpeechToTextPort = {
      provider: "openai",
      async transcribe() {
        throw new Error("Upstream STT failure");
      },
    };
    await expect(
      trimmer.transcribeWithTrimming(failingStt, "/media/talk.mp3", {
        ranges: [{ start: "00:00", end: "01:00" }],
      })
    ).rejects.toThrow("Upstream STT failure");
    await expect(fs.stat(createdWorkDir)).rejects.toThrow();
  });

  it("throws actionable diagnostic error when ffmpeg binary is missing", async () => {
    const trimmer = new AudioTrimmer({
      commandRunner: async () => ({
        stdout: "",
        stderr: "not found",
        exitCode: 127,
      }),
    });

    await expect(trimmer.extractAndTrim("/media/audio.mp3")).rejects.toThrow(
      /ffmpeg is required to extract and trim audio/i
    );
  });

  it("resolves bundled ffmpeg-static and ffprobe-static binaries on disk and probes ffmpeg successfully", async () => {
    const ffmpegPath = resolveBundledFfmpegPath();
    const ffprobePath = resolveBundledFfprobePath();

    expect(path.isAbsolute(ffmpegPath)).toBe(true);
    expect(path.isAbsolute(ffprobePath)).toBe(true);
    await expect(fs.stat(ffmpegPath)).resolves.toMatchObject({ size: expect.any(Number) });
    await expect(fs.stat(ffprobePath)).resolves.toMatchObject({ size: expect.any(Number) });

    const probe = await new AudioTrimmer().probeFfmpeg();
    expect(probe.available).toBe(true);
    expect(probe.version).toMatch(/ffmpeg version/i);
  });
});
