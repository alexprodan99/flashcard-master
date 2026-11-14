import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type SpeechToTextPort,
  type SttTranscriptionInput,
  type SttTranscriptionResult,
  type TranscriptCue,
  SubtitleParser,
  parseTimestampToSeconds,
} from "@flashcard-master/core";
import {
  AudioTrimmer,
  type CommandRunner,
  assertSttHttpResponse,
  buildFallbackSingleCue,
  defaultCommandRunner,
  isCommandNotFoundError,
  loadSttAudioBuffer,
  parseRawTranscriptCues,
  roundSttSeconds,
  withTimeoutSignal,
  wrapSttNetworkError,
} from "../media/audio-trimmer.js";

export type LocalWhisperModel = "tiny" | "base" | "small" | "medium" | "large-v3";

export interface LocalWhisperSttConfig {
  binaryPath?: string;
  endpoint?: string;
  model?: LocalWhisperModel | string;
  timeoutMs?: number;
  tempDir?: string;
  commandRunner?: CommandRunner;
  customFetch?: typeof fetch;
}

export interface LocalWhisperAvailability {
  available: boolean;
  mode: "http" | "cli";
  details?: string;
  error?: string;
}

const BRACKET_TIMESTAMP_LINE_RE = /^\[([0-9:.,]+)\s*-->\s*([0-9:.,]+)\]\s*(.+)$/;

function parseBracketTimestampStdout(stdout: string, offsetSeconds: number): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = BRACKET_TIMESTAMP_LINE_RE.exec(line.trim());
    if (!match) continue;
    const text = match[3].replace(/\s+/g, " ").trim();
    if (!text) continue;
    try {
      const start = parseTimestampToSeconds(match[1]);
      const end = Math.max(start, parseTimestampToSeconds(match[2]));
      cues.push({
        startSeconds: roundSttSeconds(start + offsetSeconds),
        endSeconds: roundSttSeconds(end + offsetSeconds),
        text,
      });
    } catch {
      // Ignore malformed line
    }
  }
  return cues;
}

export class LocalWhisperSttAdapter implements SpeechToTextPort {
  readonly provider = "whisper-local" as const;

  readonly binaryPath: string;
  readonly httpEndpoint?: string;
  readonly model: string;

  private readonly timeoutMs: number;
  private readonly tempDir: string;
  private readonly commandRunner: CommandRunner;
  private readonly fetchFn: typeof fetch;
  private readonly subtitleParser = new SubtitleParser();

  constructor(config: LocalWhisperSttConfig = {}) {
    const cleanEndpoint = config.endpoint?.trim() || "";
    const isHttp = /^https?:\/\//i.test(cleanEndpoint);

    this.httpEndpoint = isHttp ? cleanEndpoint.replace(/\/+$/, "") : undefined;
    this.binaryPath =
      config.binaryPath?.trim() ||
      (!isHttp && cleanEndpoint ? cleanEndpoint : "whisper");
    this.model = config.model?.trim() || "base";
    this.timeoutMs = config.timeoutMs ?? 600_000;
    this.tempDir = config.tempDir || os.tmpdir();
    this.commandRunner = config.commandRunner ?? defaultCommandRunner;
    this.fetchFn = config.customFetch ?? globalThis.fetch;
  }

  private buildMissingBinaryError(): Error {
    return new Error(
      `[whisper-local] Local Whisper binary "${this.binaryPath}" was not found. Install whisper (or whisper.cpp), configure a custom binary path or HTTP endpoint in Settings > Speech-to-Text, or select OpenAI/Gemini STT.`
    );
  }

  async probeAvailability(): Promise<LocalWhisperAvailability> {
    if (this.httpEndpoint) {
      const root = this.httpEndpoint
        .replace(/\/v1\/audio\/transcriptions$/i, "")
        .replace(/\/inference$/i, "");

      const timeout = withTimeoutSignal(5000);
      try {
        let res = await this.fetchFn(`${root}/health`, { signal: timeout.signal });
        if (res.status === 404) {
          res = await this.fetchFn(`${root}/v1/models`, { signal: timeout.signal });
        }
        if (res.ok) {
          return {
            available: true,
            mode: "http",
            details: `Local Whisper HTTP endpoint reachable at ${this.httpEndpoint}`,
          };
        }
        return {
          available: false,
          mode: "http",
          error: `Local Whisper HTTP server at ${this.httpEndpoint} returned HTTP ${res.status}`,
        };
      } catch (err) {
        return {
          available: false,
          mode: "http",
          error: `Cannot reach local Whisper HTTP server at ${this.httpEndpoint}: ${err instanceof Error ? err.message : String(err)}`,
        };
      } finally {
        timeout.cleanup();
      }
    }

    try {
      const res = await this.commandRunner(this.binaryPath, ["--help"], { timeoutMs: 5000 });
      if (res.exitCode === 0) {
        const firstLine =
          (res.stdout || res.stderr).split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ||
          `CLI available (${this.binaryPath})`;
        return {
          available: true,
          mode: "cli",
          details: firstLine,
        };
      }
      if (res.exitCode === 127) {
        return {
          available: false,
          mode: "cli",
          error: this.buildMissingBinaryError().message,
        };
      }
      return {
        available: false,
        mode: "cli",
        error: res.stderr.trim() || res.stdout.trim() || `Whisper CLI exited with status ${res.exitCode}`,
      };
    } catch (err) {
      if (isCommandNotFoundError(err)) {
        return {
          available: false,
          mode: "cli",
          error: this.buildMissingBinaryError().message,
        };
      }
      return {
        available: false,
        mode: "cli",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private parseWhisperJsonPayload(
    payload: Record<string, any>,
    offsetSeconds: number,
    fallbackLanguage?: string
  ): SttTranscriptionResult {
    const rawSegments = Array.isArray(payload.segments)
      ? payload.segments
      : Array.isArray(payload.transcription)
        ? payload.transcription
        : [];

    const rawText = typeof payload.text === "string" ? payload.text.replace(/\s+/g, " ").trim() : "";
    const duration =
      typeof payload.duration === "number" && Number.isFinite(payload.duration)
        ? roundSttSeconds(payload.duration)
        : undefined;

    let cues = parseRawTranscriptCues(rawSegments, offsetSeconds);
    if (cues.length === 0 && rawText) {
      cues = buildFallbackSingleCue(rawText, offsetSeconds, duration);
    }

    const text = rawText || cues.map((c) => c.text).join(" ").trim();
    const language =
      (typeof payload.language === "string" && payload.language.trim()) ||
      (typeof payload.result?.language === "string" && payload.result.language.trim()) ||
      fallbackLanguage;

    const resolvedDuration =
      duration ??
      (cues.length > 0 ? roundSttSeconds(Math.max(0, cues[cues.length - 1].endSeconds - offsetSeconds)) : undefined);

    return {
      provider: this.provider,
      cues,
      text,
      language,
      durationSeconds: resolvedDuration && resolvedDuration > 0 ? resolvedDuration : undefined,
    };
  }

  private parseSubtitleContent(
    content: string,
    offsetSeconds: number,
    filename?: string,
    language?: string
  ): SttTranscriptionResult {
    const bracketCues = parseBracketTimestampStdout(content, offsetSeconds);
    if (bracketCues.length > 0) {
      const duration = roundSttSeconds(
        Math.max(0, bracketCues[bracketCues.length - 1].endSeconds - offsetSeconds)
      );
      return {
        provider: this.provider,
        cues: bracketCues,
        text: bracketCues.map((c) => c.text).join(" ").trim(),
        language,
        durationSeconds: duration > 0 ? duration : undefined,
      };
    }

    const parsed = this.subtitleParser.parse(content, { filename });
    const shifted = AudioTrimmer.offsetCues(parsed.cues, offsetSeconds);
    const duration =
      shifted.length > 0
        ? roundSttSeconds(Math.max(0, shifted[shifted.length - 1].endSeconds - offsetSeconds))
        : undefined;

    return {
      provider: this.provider,
      cues: shifted,
      text: shifted.map((c) => c.text).join(" ").trim(),
      language,
      durationSeconds: duration && duration > 0 ? duration : undefined,
    };
  }

  private async transcribeViaHttp(input: SttTranscriptionInput): Promise<SttTranscriptionResult> {
    const { buffer, filename, mimeType } = await loadSttAudioBuffer(input);
    const offset = input.timestampOffsetSeconds ?? 0;

    const url = /\/(transcriptions|inference)$/i.test(this.httpEndpoint!)
      ? this.httpEndpoint!
      : `${this.httpEndpoint}/v1/audio/transcriptions`;

    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
    formData.append("model", this.model);
    formData.append("response_format", "verbose_json");

    if (input.language?.trim()) {
      formData.append("language", input.language.trim());
    }
    if (input.prompt?.trim()) {
      formData.append("prompt", input.prompt.trim());
    }

    const timeout = withTimeoutSignal(this.timeoutMs, input.signal);

    try {
      const response = await this.fetchFn(url, {
        method: "POST",
        signal: timeout.signal,
        body: formData,
      });

      await assertSttHttpResponse(
        "whisper-local",
        response,
        "Local Whisper server rejected request."
      );

      const bodyText = await response.text();
      if (!bodyText.trim()) {
        return {
          provider: this.provider,
          cues: [],
          text: "",
          language: input.language,
        };
      }

      try {
        const json = JSON.parse(bodyText) as Record<string, any>;
        return this.parseWhisperJsonPayload(json, offset, input.language);
      } catch {
        if (bodyText.includes("-->") || bodyText.trimStart().startsWith("WEBVTT")) {
          return this.parseSubtitleContent(bodyText, offset, undefined, input.language);
        }
        const cues = buildFallbackSingleCue(bodyText, offset);
        return {
          provider: this.provider,
          cues,
          text: bodyText.replace(/\s+/g, " ").trim(),
          language: input.language,
        };
      }
    } catch (err) {
      throw wrapSttNetworkError("whisper-local", err, timeout.didTimeout(), this.timeoutMs);
    } finally {
      timeout.cleanup();
    }
  }

  private async transcribeViaCli(input: SttTranscriptionInput): Promise<SttTranscriptionResult> {
    if (!input.audioPath && !input.audioBuffer) {
      throw new Error(
        "Either audioPath or audioBuffer must be provided for Speech-to-Text transcription."
      );
    }

    const offset = input.timestampOffsetSeconds ?? 0;
    const workDir = await fs.mkdtemp(path.join(this.tempDir, "fcm-whisper-"));
    const outDir = path.join(workDir, "out");

    try {
      await fs.mkdir(outDir, { recursive: true });

      let audioFilePath = input.audioPath;
      if (!audioFilePath && input.audioBuffer) {
        const safeName = input.filename?.trim() || "audio.wav";
        audioFilePath = path.join(workDir, safeName);
        await fs.writeFile(audioFilePath, input.audioBuffer);
      }

      const args = [
        audioFilePath!,
        "--model",
        this.model,
        "--output_dir",
        outDir,
        "--output_format",
        "json",
      ];

      if (input.language?.trim()) {
        args.push("--language", input.language.trim());
      }
      if (input.prompt?.trim()) {
        args.push("--initial_prompt", input.prompt.trim());
      }

      let cmdResult;
      try {
        cmdResult = await this.commandRunner(this.binaryPath, args, {
          timeoutMs: this.timeoutMs,
          signal: input.signal,
        });
      } catch (err) {
        if (isCommandNotFoundError(err)) {
          throw this.buildMissingBinaryError();
        }
        throw new Error(
          `[whisper-local] Whisper CLI failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      if (cmdResult.exitCode === 127) {
        throw this.buildMissingBinaryError();
      }

      if (cmdResult.exitCode !== 0) {
        const detail = cmdResult.stderr.trim() || cmdResult.stdout.trim() || `exit code ${cmdResult.exitCode}`;
        throw new Error(`[whisper-local] Whisper CLI exited with code ${cmdResult.exitCode}: ${detail}`);
      }

      const outFiles = await fs.readdir(outDir).catch(() => []);
      const jsonFile = outFiles.find((f) => f.toLowerCase().endsWith(".json"));
      if (jsonFile) {
        const rawJson = await fs.readFile(path.join(outDir, jsonFile), "utf8");
        const parsed = JSON.parse(rawJson) as Record<string, any>;
        return this.parseWhisperJsonPayload(parsed, offset, input.language);
      }

      const subFile = outFiles.find((f) => {
        const low = f.toLowerCase();
        return low.endsWith(".srt") || low.endsWith(".vtt");
      });
      if (subFile) {
        const rawSub = await fs.readFile(path.join(outDir, subFile), "utf8");
        return this.parseSubtitleContent(rawSub, offset, subFile, input.language);
      }

      const stdout = cmdResult.stdout.trim();
      if (stdout) {
        if (stdout.startsWith("{") || stdout.startsWith("[")) {
          try {
            const parsed = JSON.parse(stdout) as Record<string, any>;
            return this.parseWhisperJsonPayload(parsed, offset, input.language);
          } catch {
            // Fall through to timestamp/plain text parsing
          }
        }
        if (stdout.includes("-->") || stdout.startsWith("WEBVTT")) {
          return this.parseSubtitleContent(stdout, offset, undefined, input.language);
        }
        const cues = buildFallbackSingleCue(stdout, offset);
        return {
          provider: this.provider,
          cues,
          text: stdout.replace(/\s+/g, " ").trim(),
          language: input.language,
        };
      }

      return {
        provider: this.provider,
        cues: [],
        text: "",
        language: input.language,
      };
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  async transcribe(input: SttTranscriptionInput): Promise<SttTranscriptionResult> {
    if (this.httpEndpoint) {
      return this.transcribeViaHttp(input);
    }
    return this.transcribeViaCli(input);
  }
}

