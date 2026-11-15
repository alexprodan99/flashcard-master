import { execFile } from "node:child_process";
import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import {
  type SpeechToTextPort,
  type SttTranscriptionInput,
  type SttTranscriptionResult,
  type TranscriptCue,
  type TimestampRange,
  parseTimestampToSeconds,
} from "@flashcard-master/core";

export interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number; signal?: AbortSignal }
) => Promise<CommandExecutionResult>;

export interface NormalizedTimestampRange {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  label?: string;
}

export interface TrimmedAudioSegment {
  filePath: string;
  startSeconds: number;
  endSeconds?: number;
  durationSeconds?: number;
  label?: string;
}

export interface TrimmedAudioBatch {
  segments: TrimmedAudioSegment[];
  cleanup: () => Promise<void>;
}

export interface AudioTrimmerOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
  tempDir?: string;
  maxChunkBytes?: number;
  defaultChunkDurationSeconds?: number;
  commandRunner?: CommandRunner;
}

const nodeRequire = createRequire(import.meta.url);

function resolveAsarUnpackedPath(candidate: string): string {
  if (/([\\/])app\.asar([\\/])/.test(candidate)) {
    const unpacked = candidate.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
    if (fsSync.existsSync(unpacked)) {
      return unpacked;
    }
  }
  return candidate;
}

function resolveBundledMediaBinary(options: {
  envVarName: "FFMPEG_PATH" | "FFPROBE_PATH";
  packageName: "ffmpeg-static" | "ffprobe-static";
  fallbackCommand: "ffmpeg" | "ffprobe";
}): string {
  const envOverride = process.env[options.envVarName]?.trim();
  if (envOverride) {
    return envOverride;
  }

  try {
    const loaded = nodeRequire(options.packageName) as string | { path?: string } | null | undefined;
    const rawPath = typeof loaded === "string" ? loaded : loaded?.path;
    if (typeof rawPath === "string" && rawPath.trim()) {
      const candidate = resolveAsarUnpackedPath(rawPath.trim());
      if (fsSync.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    // Fall back to system PATH binary if optional static binary is unavailable
  }

  return options.fallbackCommand;
}

/**
 * Resolves the bundled ffmpeg binary (or FFMPEG_PATH override / PATH fallback).
 */
export function resolveBundledFfmpegPath(): string {
  return resolveBundledMediaBinary({
    envVarName: "FFMPEG_PATH",
    packageName: "ffmpeg-static",
    fallbackCommand: "ffmpeg",
  });
}

/**
 * Resolves the bundled ffprobe binary (or FFPROBE_PATH override / PATH fallback).
 */
export function resolveBundledFfprobePath(): string {
  return resolveBundledMediaBinary({
    envVarName: "FFPROBE_PATH",
    packageName: "ffprobe-static",
    fallbackCommand: "ffprobe",
  });
}

export const defaultCommandRunner: CommandRunner = (command, args, options) => {
  const resolvedCommand =
    command === "ffmpeg"
      ? resolveBundledFfmpegPath()
      : command === "ffprobe"
        ? resolveBundledFfprobePath()
        : command;

  return new Promise((resolve, reject) => {
    execFile(
      resolvedCommand,
      args,
      {
        windowsHide: true,
        maxBuffer: 50 * 1024 * 1024,
        timeout: options?.timeoutMs,
        signal: options?.signal,
        encoding: "utf8",
      },
      (err, stdout, stderr) => {
        if (!err) {
          resolve({
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
            exitCode: 0,
          });
          return;
        }

        const errAny = err as NodeJS.ErrnoException & { code?: string | number };
        if (typeof errAny.code === "number") {
          resolve({
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
            exitCode: errAny.code,
          });
          return;
        }

        reject(err);
      }
    );
  });
};

export function isCommandNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "ENOENT" || code === 127) return true;
  const msg = String((err as { message?: unknown }).message ?? "").toLowerCase();
  return msg.includes("enoent") || msg.includes("not recognized") || msg.includes("command not found");
}

export function roundSttSeconds(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

const MIME_TYPE_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".mpeg": "audio/mpeg",
  ".mpga": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
};

export function resolveAudioMimeType(filenameOrPath?: string, explicitMimeType?: string): string {
  if (explicitMimeType && explicitMimeType.trim().length > 0) {
    return explicitMimeType.trim();
  }
  if (filenameOrPath) {
    const ext = path.extname(filenameOrPath).toLowerCase();
    if (ext && MIME_TYPE_BY_EXT[ext]) {
      return MIME_TYPE_BY_EXT[ext];
    }
  }
  return "audio/mpeg";
}

export async function loadSttAudioBuffer(
  input: SttTranscriptionInput
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  let buffer: Buffer;
  if (input.audioBuffer) {
    buffer = input.audioBuffer;
  } else if (input.audioPath) {
    buffer = await fs.readFile(input.audioPath);
  } else {
    throw new Error("Either audioPath or audioBuffer must be provided for Speech-to-Text transcription.");
  }

  const filename =
    input.filename?.trim() ||
    (input.audioPath ? path.basename(input.audioPath) : "audio.mp3");
  const mimeType = resolveAudioMimeType(filename, input.mimeType);

  return { buffer, filename, mimeType };
}

export function withTimeoutSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal
): { signal: AbortSignal; didTimeout: () => boolean; cleanup: () => void } {
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort(new Error(`Request timed out after ${timeoutMs}ms.`));
        }, timeoutMs)
      : null;

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
    },
  };
}

function parseFlexibleTime(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.max(0, val);
  }
  if (typeof val === "string" && val.trim().length > 0) {
    try {
      return parseTimestampToSeconds(val.trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function parseRawTranscriptCues(
  rawSegments: unknown,
  offsetSeconds = 0
): TranscriptCue[] {
  if (!Array.isArray(rawSegments)) {
    return [];
  }

  const cues: TranscriptCue[] = [];
  for (const item of rawSegments) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.replace(/\s+/g, " ").trim() : "";
    if (!text) continue;

    let start = parseFlexibleTime(record.startSeconds ?? record.start);
    let end = parseFlexibleTime(record.endSeconds ?? record.end);

    if (start === null && record.offsets && typeof record.offsets === "object") {
      const offsets = record.offsets as Record<string, unknown>;
      if (typeof offsets.from === "number") start = Math.max(0, offsets.from / 1000);
      if (typeof offsets.to === "number") end = Math.max(0, offsets.to / 1000);
    }
    if (start === null && record.timestamps && typeof record.timestamps === "object") {
      const timestamps = record.timestamps as Record<string, unknown>;
      start = parseFlexibleTime(timestamps.from);
      end = parseFlexibleTime(timestamps.to);
    }

    if (start === null) continue;
    const resolvedEnd = Math.max(start, end ?? start);
    cues.push({
      startSeconds: roundSttSeconds(start + offsetSeconds),
      endSeconds: roundSttSeconds(resolvedEnd + offsetSeconds),
      text,
    });
  }

  return cues;
}

export function isLocalHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1"
    );
  } catch {
    return url.includes("localhost") || url.includes("127.0.0.1");
  }
}

export async function assertSttHttpResponse(
  providerLabel: string,
  response: Response,
  authHint?: string
): Promise<void> {
  if (response.ok) return;
  const bodyText = await response.text().catch(() => "");
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `[${providerLabel}] Authentication failed (HTTP ${response.status}): ${authHint || bodyText || "Invalid or missing API key."}`
    );
  }
  if (response.status === 429) {
    throw new Error(
      `[${providerLabel}] Rate limit exceeded (HTTP 429): ${bodyText || "Too many requests."}`
    );
  }
  throw new Error(
    `[${providerLabel}] Request failed (HTTP ${response.status}): ${bodyText || response.statusText || "Unknown error"}`
  );
}

export function wrapSttNetworkError(
  providerLabel: string,
  err: unknown,
  didTimeout: boolean,
  timeoutMs: number
): Error {
  if (err instanceof Error && err.message.startsWith(`[${providerLabel}]`)) {
    return err;
  }
  if (didTimeout || (err instanceof Error && err.name === "AbortError")) {
    return new Error(
      `[${providerLabel}] Transcription request ${didTimeout ? `timed out after ${timeoutMs}ms` : "was aborted"}.`
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return new Error(`[${providerLabel}] Network or response error: ${message}`);
}

export function buildFallbackSingleCue(
  text: string,
  offsetSeconds = 0,
  durationSeconds?: number
): TranscriptCue[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const start = roundSttSeconds(Math.max(0, offsetSeconds));
  const end = roundSttSeconds(
    durationSeconds && durationSeconds > 0 ? start + durationSeconds : start
  );
  return [{ startSeconds: start, endSeconds: end, text: clean }];
}

async function safeStatSize(filePath: string): Promise<number | null> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return null;
  }
}

function parseDurationFromFfmpegStderr(stderr: string): number | null {
  const match = /Duration:\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)/i.exec(stderr);
  if (!match) return null;
  try {
    const parsed = parseTimestampToSeconds(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export class AudioTrimmer {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly tempDir: string;
  private readonly maxChunkBytes: number;
  private readonly defaultChunkDurationSeconds: number;
  private readonly commandRunner: CommandRunner;

  constructor(options: AudioTrimmerOptions = {}) {
    this.ffmpegPath = options.ffmpegPath || "ffmpeg";
    this.ffprobePath = options.ffprobePath || "ffprobe";
    this.tempDir = options.tempDir || os.tmpdir();
    this.maxChunkBytes = options.maxChunkBytes ?? 24 * 1024 * 1024;
    this.defaultChunkDurationSeconds = options.defaultChunkDurationSeconds ?? 600;
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
  }

  /**
   * Shifts all cue timestamps forward by `offsetSeconds` to restore original media timeline coordinates.
   */
  static offsetCues(cues: TranscriptCue[], offsetSeconds: number): TranscriptCue[] {
    if (!offsetSeconds) {
      return cues.map((c) => ({ ...c }));
    }
    return cues.map((cue) => ({
      ...cue,
      startSeconds: Math.max(0, roundSttSeconds(cue.startSeconds + offsetSeconds)),
      endSeconds: Math.max(0, roundSttSeconds(cue.endSeconds + offsetSeconds)),
    }));
  }

  parseRanges(ranges: TimestampRange[]): NormalizedTimestampRange[] {
    return ranges.map((range, idx) => {
      const startSeconds = parseTimestampToSeconds(range.start);
      const endSeconds = parseTimestampToSeconds(range.end);
      if (endSeconds <= startSeconds) {
        throw new Error(
          `Invalid timestamp range #${idx + 1} ("${range.start}" - "${range.end}"): end must be strictly greater than start.`
        );
      }
      return {
        startSeconds: roundSttSeconds(startSeconds),
        endSeconds: roundSttSeconds(endSeconds),
        durationSeconds: roundSttSeconds(endSeconds - startSeconds),
        label: range.label,
      };
    });
  }

  async probeFfmpeg(): Promise<{ available: boolean; version?: string; error?: string }> {
    try {
      const result = await this.commandRunner(this.ffmpegPath, ["-version"], { timeoutMs: 10000 });
      if (result.exitCode === 0) {
        const firstLine = result.stdout.split(/\r?\n/)[0]?.trim() || "ffmpeg available";
        return { available: true, version: firstLine };
      }
      if (result.exitCode === 127) {
        return {
          available: false,
          error: `ffmpeg binary not found at "${this.ffmpegPath}". Install ffmpeg and ensure it is in your PATH.`,
        };
      }
      return {
        available: false,
        error: result.stderr.trim() || `ffmpeg exited with status ${result.exitCode}`,
      };
    } catch (err) {
      if (isCommandNotFoundError(err)) {
        return {
          available: false,
          error: `ffmpeg binary not found at "${this.ffmpegPath}". Install ffmpeg and ensure it is in your PATH.`,
        };
      }
      return {
        available: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async probeDurationSeconds(mediaPath: string, signal?: AbortSignal): Promise<number | null> {
    try {
      const probeRes = await this.commandRunner(
        this.ffprobePath,
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          mediaPath,
        ],
        { timeoutMs: 15000, signal }
      );
      if (probeRes.exitCode === 0) {
        const val = parseFloat(probeRes.stdout.trim());
        if (Number.isFinite(val) && val > 0) {
          return roundSttSeconds(val);
        }
      }
    } catch {
      // Fall back to ffmpeg stderr inspection below
    }

    try {
      const ffmpegRes = await this.commandRunner(this.ffmpegPath, ["-i", mediaPath], {
        timeoutMs: 15000,
        signal,
      });
      return parseDurationFromFfmpegStderr(ffmpegRes.stderr);
    } catch {
      return null;
    }
  }

  private async runFfmpeg(args: string[], signal?: AbortSignal): Promise<void> {
    let result: CommandExecutionResult;
    try {
      result = await this.commandRunner(this.ffmpegPath, args, { signal });
    } catch (err) {
      if (isCommandNotFoundError(err)) {
        throw new Error(
          `ffmpeg is required to extract and trim audio for Speech-to-Text, but was not found at "${this.ffmpegPath}". Please install ffmpeg and try again.`
        );
      }
      throw err;
    }

    if (result.exitCode === 127) {
      throw new Error(
        `ffmpeg is required to extract and trim audio for Speech-to-Text, but was not found at "${this.ffmpegPath}". Please install ffmpeg and try again.`
      );
    }

    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
      throw new Error(`ffmpeg audio extraction failed: ${detail}`);
    }
  }

  private async splitOversizedWindow(
    inputPath: string,
    workDir: string,
    filePrefix: string,
    windowStart: number,
    windowEnd: number,
    observedBytes: number,
    maxChunkBytes: number,
    baseChunkDurationSeconds: number,
    label?: string,
    signal?: AbortSignal
  ): Promise<TrimmedAudioSegment[]> {
    const windowDuration = windowEnd - windowStart;
    // Scale sub-window duration proportionally with a 10% safety headroom so chunks stay under maxChunkBytes
    const proportionalDuration = Math.floor((windowDuration * maxChunkBytes * 0.9) / observedBytes);
    const stepSeconds = Math.max(5, Math.min(baseChunkDurationSeconds, proportionalDuration || baseChunkDurationSeconds));

    const segments: TrimmedAudioSegment[] = [];
    let cursor = windowStart;
    let partIndex = 0;

    while (cursor < windowEnd - 0.001) {
      const chunkEnd = roundSttSeconds(Math.min(windowEnd, cursor + stepSeconds));
      const partPath = path.join(workDir, `${filePrefix}-part-${partIndex}.mp3`);
      await this.runFfmpeg(
        [
          "-y",
          "-ss",
          String(cursor),
          "-to",
          String(chunkEnd),
          "-i",
          inputPath,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "16000",
          partPath,
        ],
        signal
      );

      segments.push({
        filePath: partPath,
        startSeconds: roundSttSeconds(cursor),
        endSeconds: chunkEnd,
        durationSeconds: roundSttSeconds(chunkEnd - cursor),
        label,
      });

      cursor = chunkEnd;
      partIndex += 1;
    }

    return segments;
  }

  /**
   * Extracts mono 16kHz audio from `inputPath`. When `ranges` are provided, trims strictly to each
   * timestamp window before STT invocation, splitting any segment exceeding `maxChunkBytes`.
   */
  async extractAndTrim(
    inputPath: string,
    ranges?: TimestampRange[],
    options?: { maxChunkBytes?: number; chunkDurationSeconds?: number; signal?: AbortSignal }
  ): Promise<TrimmedAudioBatch> {
    const workDir = await fs.mkdtemp(path.join(this.tempDir, "fcm-audio-"));
    const cleanup = async () => {
      await fs.rm(workDir, { recursive: true, force: true });
    };

    const maxChunkBytes = options?.maxChunkBytes ?? this.maxChunkBytes;
    const chunkDurationSeconds = options?.chunkDurationSeconds ?? this.defaultChunkDurationSeconds;
    const segments: TrimmedAudioSegment[] = [];

    try {
      if (ranges && ranges.length > 0) {
        const normalized = this.parseRanges(ranges);
        for (let i = 0; i < normalized.length; i++) {
          const range = normalized[i];
          const segmentPath = path.join(workDir, `segment-${i}.mp3`);
          await this.runFfmpeg(
            [
              "-y",
              "-ss",
              String(range.startSeconds),
              "-to",
              String(range.endSeconds),
              "-i",
              inputPath,
              "-vn",
              "-ac",
              "1",
              "-ar",
              "16000",
              segmentPath,
            ],
            options?.signal
          );

          const size = await safeStatSize(segmentPath);
          if (size !== null && maxChunkBytes > 0 && size > maxChunkBytes) {
            const subSegments = await this.splitOversizedWindow(
              inputPath,
              workDir,
              `segment-${i}`,
              range.startSeconds,
              range.endSeconds,
              size,
              maxChunkBytes,
              chunkDurationSeconds,
              range.label,
              options?.signal
            );
            segments.push(...subSegments);
            await fs.rm(segmentPath, { force: true });
          } else {
            segments.push({
              filePath: segmentPath,
              startSeconds: range.startSeconds,
              endSeconds: range.endSeconds,
              durationSeconds: range.durationSeconds,
              label: range.label,
            });
          }
        }
      } else {
        const segmentPath = path.join(workDir, "segment-0.mp3");
        await this.runFfmpeg(
          ["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", segmentPath],
          options?.signal
        );

        const size = await safeStatSize(segmentPath);
        if (size !== null && maxChunkBytes > 0 && size > maxChunkBytes) {
          const probedDuration =
            (await this.probeDurationSeconds(segmentPath, options?.signal)) ??
            (await this.probeDurationSeconds(inputPath, options?.signal));
          const totalDuration =
            probedDuration ?? Math.ceil(size / maxChunkBytes) * chunkDurationSeconds;

          const subSegments = await this.splitOversizedWindow(
            inputPath,
            workDir,
            "segment-0",
            0,
            totalDuration,
            size,
            maxChunkBytes,
            chunkDurationSeconds,
            undefined,
            options?.signal
          );
          segments.push(...subSegments);
          await fs.rm(segmentPath, { force: true });
        } else {
          const probedDuration =
            size !== null
              ? (await this.probeDurationSeconds(segmentPath, options?.signal)) ?? undefined
              : undefined;
          segments.push({
            filePath: segmentPath,
            startSeconds: 0,
            endSeconds: probedDuration,
            durationSeconds: probedDuration,
          });
        }
      }

      return { segments, cleanup };
    } catch (err) {
      await cleanup();
      throw err;
    }
  }

  /**
   * Trims/chunks `inputPath`, invokes `sttPort.transcribe()` per segment, shifts timestamps back to
   * original media coordinates, and guarantees temporary directory cleanup in `finally`.
   */
  async transcribeWithTrimming(
    sttPort: SpeechToTextPort,
    inputPath: string,
    options?: {
      ranges?: TimestampRange[];
      language?: string;
      prompt?: string;
      maxChunkBytes?: number;
      chunkDurationSeconds?: number;
      signal?: AbortSignal;
    }
  ): Promise<SttTranscriptionResult> {
    const batch = await this.extractAndTrim(inputPath, options?.ranges, {
      maxChunkBytes: options?.maxChunkBytes,
      chunkDurationSeconds: options?.chunkDurationSeconds,
      signal: options?.signal,
    });

    try {
      const mergedCues: TranscriptCue[] = [];
      const textParts: string[] = [];
      let detectedLanguage: string | undefined;
      let totalDuration = 0;

      for (const segment of batch.segments) {
        const result = await sttPort.transcribe({
          audioPath: segment.filePath,
          language: options?.language,
          prompt: options?.prompt,
          signal: options?.signal,
        });

        const shifted = AudioTrimmer.offsetCues(result.cues, segment.startSeconds);
        mergedCues.push(...shifted);

        const cleanText = result.text.trim();
        if (cleanText) {
          textParts.push(cleanText);
        }
        if (!detectedLanguage && result.language) {
          detectedLanguage = result.language;
        }

        const segDuration =
          segment.durationSeconds ??
          result.durationSeconds ??
          (result.cues.length > 0 ? result.cues[result.cues.length - 1].endSeconds : 0);
        totalDuration += segDuration;
      }

      return {
        provider: sttPort.provider,
        cues: mergedCues,
        text: textParts.join(" ").replace(/\s+/g, " ").trim(),
        language: detectedLanguage,
        durationSeconds: totalDuration > 0 ? roundSttSeconds(totalDuration) : undefined,
      };
    } finally {
      await batch.cleanup();
    }
  }
}
