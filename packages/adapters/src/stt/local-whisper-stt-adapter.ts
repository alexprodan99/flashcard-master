import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as zlib from "node:zlib";
import JSZip from "jszip";
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
  cacheDir?: string;
  autoDownload?: boolean;
  platform?: NodeJS.Platform;
  arch?: string;
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

interface WhisperBinaryAssetSpec {
  archiveType: "zip" | "tar.gz";
  url: string;
  binaryNames: string[];
}

function resolveWhisperBinaryAsset(
  platform: NodeJS.Platform,
  arch: string
): WhisperBinaryAssetSpec | null {
  if (platform === "win32") {
    if (arch === "arm64") {
      return {
        archiveType: "zip",
        url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-win-cpu-arm64.zip",
        binaryNames: ["whisper-cli.exe", "main.exe"],
      };
    }
    return {
      archiveType: "zip",
      url: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip",
      binaryNames: ["whisper-cli.exe", "main.exe"],
    };
  }

  if (platform === "linux") {
    if (arch === "arm64") {
      return {
        archiveType: "tar.gz",
        url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-ubuntu-arm64.tar.gz",
        binaryNames: ["whisper-cli", "main"],
      };
    }
    if (arch === "x64") {
      return {
        archiveType: "tar.gz",
        url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-ubuntu-x64.tar.gz",
        binaryNames: ["whisper-cli", "main"],
      };
    }
    return null;
  }

  if (platform === "darwin") {
    if (arch === "arm64") {
      return {
        archiveType: "tar.gz",
        url: "https://registry.npmjs.org/@promer94/whisper-tauri-aarch64-apple-darwin/-/whisper-tauri-aarch64-apple-darwin-0.0.1.tgz",
        binaryNames: ["whisper-aarch64-apple-darwin", "whisper-cli", "main"],
      };
    }
    if (arch === "x64") {
      return {
        archiveType: "tar.gz",
        url: "https://registry.npmjs.org/@promer94/whisper-tauri-x86_64-apple-darwin/-/whisper-tauri-x86_64-apple-darwin-0.0.1.tgz",
        binaryNames: ["whisper-x86_64-apple-darwin", "whisper-cli", "main"],
      };
    }
    return null;
  }

  return null;
}

function normalizeGgmlModelName(model: string): string {
  const cleaned = model
    .trim()
    .replace(/^ggml-/i, "")
    .replace(/\.bin$/i, "")
    .replace(/[^a-z0-9._-]/gi, "");
  return cleaned || "base";
}

function isSharedLibraryOrLicense(baseName: string): boolean {
  const lower = baseName.toLowerCase();
  return (
    lower.endsWith(".dll") ||
    lower.endsWith(".dylib") ||
    lower.endsWith(".so") ||
    /\.so\.[0-9.]+$/.test(lower) ||
    lower === "license"
  );
}

function shouldKeepArchiveEntry(
  baseName: string,
  spec: WhisperBinaryAssetSpec
): { keep: boolean; isTargetBinary: boolean } {
  const lower = baseName.toLowerCase();
  const isTargetBinary = spec.binaryNames.some((n) => n.toLowerCase() === lower);
  if (isTargetBinary) {
    return { keep: true, isTargetBinary: true };
  }
  return { keep: isSharedLibraryOrLicense(baseName), isTargetBinary: false };
}

function parseTarOctalOrNull(slice: Uint8Array): number {
  const text = Buffer.from(slice).toString("utf8").replace(/\0.*$/, "").trim();
  if (!text) return 0;
  return parseInt(text, 8) || 0;
}

function readTarString(slice: Uint8Array): string {
  return Buffer.from(slice).toString("utf8").replace(/\0.*$/, "").trim();
}

async function extractWhisperArchive(options: {
  archiveBuffer: Buffer;
  binDir: string;
  spec: WhisperBinaryAssetSpec;
  targetBinaryName: string;
}): Promise<void> {
  const { archiveBuffer, binDir, spec, targetBinaryName } = options;
  await fs.mkdir(binDir, { recursive: true });
  const primaryLower = spec.binaryNames[0]?.toLowerCase() ?? "";
  let primaryWritten = false;

  if (spec.archiveType === "zip") {
    const zip = await JSZip.loadAsync(archiveBuffer);
    for (const [entryName, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const baseName = path.posix.basename(entryName);
      if (!baseName) continue;
      const { keep, isTargetBinary } = shouldKeepArchiveEntry(baseName, spec);
      if (!keep) continue;

      const isPrimary = isTargetBinary && baseName.toLowerCase() === primaryLower;
      if (isTargetBinary && !isPrimary && primaryWritten) {
        continue;
      }

      const destName = isTargetBinary ? targetBinaryName : baseName;
      const destPath = path.join(binDir, destName);
      const data = await entry.async("nodebuffer");
      await fs.writeFile(destPath, data);
      if (isTargetBinary && !targetBinaryName.endsWith(".exe")) {
        await fs.chmod(destPath, 0o755);
      }
      if (isPrimary) {
        primaryWritten = true;
      }
    }
    return;
  }

  const tarBuffer = zlib.gunzipSync(archiveBuffer);
  const deferredSymlinks: Array<{ destName: string; targetName: string; isBinary: boolean }> = [];
  let paxLongPath: string | null = null;
  let gnuLongName: string | null = null;

  let offset = 0;
  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      break;
    }

    const rawName = readTarString(header.subarray(0, 100));
    const size = parseTarOctalOrNull(header.subarray(124, 136));
    const typeFlag = String.fromCharCode(header[156] || 48);
    const linkName = readTarString(header.subarray(157, 257));
    const prefix = readTarString(header.subarray(345, 500));

    offset += 512;
    const dataStart = offset;
    const dataEnd = Math.min(tarBuffer.length, dataStart + size);
    const payload = tarBuffer.subarray(dataStart, dataEnd);
    offset += Math.ceil(size / 512) * 512;

    if (typeFlag === "L") {
      gnuLongName = payload.toString("utf8").replace(/\0.*$/, "").trim();
      continue;
    }

    if (typeFlag === "x") {
      const paxText = payload.toString("utf8");
      const pathMatch = /(?:^|\n)\d+\s+path=([^\n]+)/.exec(paxText);
      if (pathMatch) {
        paxLongPath = pathMatch[1].trim();
      }
      continue;
    }

    const entryPath = paxLongPath ?? gnuLongName ?? (prefix ? `${prefix}/${rawName}` : rawName);
    paxLongPath = null;
    gnuLongName = null;

    const baseName = path.posix.basename(entryPath);
    if (!baseName) continue;
    const { keep, isTargetBinary } = shouldKeepArchiveEntry(baseName, spec);
    if (!keep) continue;

    const isPrimary = isTargetBinary && baseName.toLowerCase() === primaryLower;
    if (isTargetBinary && !isPrimary && primaryWritten) {
      continue;
    }

    const destName = isTargetBinary ? targetBinaryName : baseName;
    if (typeFlag === "2" && linkName) {
      deferredSymlinks.push({
        destName,
        targetName: path.posix.basename(linkName),
        isBinary: isTargetBinary,
      });
      continue;
    }

    if (typeFlag === "0" || typeFlag === "\0") {
      const destPath = path.join(binDir, destName);
      await fs.writeFile(destPath, payload);
      if ((isTargetBinary || baseName.includes(".so") || baseName.endsWith(".dylib")) && !targetBinaryName.endsWith(".exe")) {
        await fs.chmod(destPath, 0o755);
      }
      if (isPrimary) {
        primaryWritten = true;
      }
    }
  }

  // Resolve symlinks (with multi-pass copy fallback for chained libs like .so -> .so.0 -> .so.0.26.0)
  let pendingLinks = deferredSymlinks;
  for (let pass = 0; pass < 3 && pendingLinks.length > 0; pass += 1) {
    const nextPending: typeof deferredSymlinks = [];
    for (const link of pendingLinks) {
      const destPath = path.join(binDir, link.destName);
      const resolvedTarget = path.join(binDir, link.targetName);
      await fs.rm(destPath, { force: true }).catch(() => undefined);
      try {
        await fs.symlink(link.targetName, destPath);
      } catch {
        if (fsSync.existsSync(resolvedTarget)) {
          await fs.copyFile(resolvedTarget, destPath);
          if (link.isBinary && !targetBinaryName.endsWith(".exe")) {
            await fs.chmod(destPath, 0o755);
          }
        } else {
          nextPending.push(link);
        }
      }
    }
    pendingLinks = nextPending;
  }
}

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
  private static readonly inFlightDownloads = new Map<string, Promise<string>>();

  readonly provider = "whisper-local" as const;

  readonly binaryPath: string;
  readonly httpEndpoint?: string;
  readonly model: string;
  readonly cacheDir: string;
  readonly autoDownload: boolean;

  private readonly hasExplicitBinary: boolean;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly timeoutMs: number;
  private readonly tempDir: string;
  private readonly commandRunner: CommandRunner;
  private readonly fetchFn: typeof fetch;
  private readonly subtitleParser = new SubtitleParser();

  constructor(config: LocalWhisperSttConfig = {}) {
    const cleanEndpoint = config.endpoint?.trim() || "";
    const isHttp = /^https?:\/\//i.test(cleanEndpoint);

    this.httpEndpoint = isHttp ? cleanEndpoint.replace(/\/+$/, "") : undefined;
    this.hasExplicitBinary = Boolean(config.binaryPath?.trim() || (!isHttp && cleanEndpoint));
    this.binaryPath =
      config.binaryPath?.trim() ||
      (!isHttp && cleanEndpoint ? cleanEndpoint : "whisper");
    this.model = config.model?.trim() || "base";
    this.platform = config.platform ?? process.platform;
    this.arch = config.arch ?? process.arch;
    this.cacheDir =
      config.cacheDir?.trim() ||
      process.env.WHISPER_CACHE_DIR?.trim() ||
      path.join(os.homedir(), ".flashcard-master", "whisper");
    this.autoDownload = config.autoDownload ?? (!isHttp && !this.hasExplicitBinary && !config.commandRunner);
    this.timeoutMs = config.timeoutMs ?? 600_000;
    this.tempDir = config.tempDir || os.tmpdir();
    this.commandRunner = config.commandRunner ?? defaultCommandRunner;
    this.fetchFn = config.customFetch ?? globalThis.fetch;
  }

  private getTargetBinaryName(): string {
    return this.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  }

  private getCachedBinaryPath(): string {
    return path.join(this.cacheDir, "bin", this.getTargetBinaryName());
  }

  private getExistingManagedBinaryPath(): string | null {
    const cached = this.getCachedBinaryPath();
    if (fsSync.existsSync(cached)) {
      return cached;
    }
    if (this.platform === "darwin") {
      for (const candidate of ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"]) {
        if (fsSync.existsSync(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  private resolveCachedModelPath(): { modelPath: string; exists: boolean } {
    if (this.model.toLowerCase().endsWith(".bin") && fsSync.existsSync(this.model)) {
      return { modelPath: path.resolve(this.model), exists: true };
    }
    const normalized = normalizeGgmlModelName(this.model);
    const modelPath = path.join(this.cacheDir, "models", `ggml-${normalized}.bin`);
    return { modelPath, exists: fsSync.existsSync(modelPath) };
  }

  private runDeduplicatedDownload(key: string, fn: () => Promise<string>): Promise<string> {
    const existing = LocalWhisperSttAdapter.inFlightDownloads.get(key);
    if (existing) {
      return existing;
    }
    const promise = fn().finally(() => {
      LocalWhisperSttAdapter.inFlightDownloads.delete(key);
    });
    LocalWhisperSttAdapter.inFlightDownloads.set(key, promise);
    return promise;
  }

  async ensureWhisperCppBinary(signal?: AbortSignal): Promise<string> {
    const existing = this.getExistingManagedBinaryPath();
    if (existing) {
      return existing;
    }

    const spec = resolveWhisperBinaryAsset(this.platform, this.arch);
    if (!spec) {
      throw new Error(
        `[whisper-local] Automatic whisper.cpp binary download is not supported for ${this.platform}/${this.arch}. Configure a custom binary path or HTTP endpoint in Settings > Speech-to-Text.`
      );
    }

    const binDir = path.join(this.cacheDir, "bin");
    const targetBinaryName = this.getTargetBinaryName();
    const targetBinaryPath = path.join(binDir, targetBinaryName);

    return this.runDeduplicatedDownload(`bin:${targetBinaryPath}`, async () => {
      const doubleCheck = this.getExistingManagedBinaryPath();
      if (doubleCheck) {
        return doubleCheck;
      }

      const timeout = withTimeoutSignal(Math.max(this.timeoutMs, 120_000), signal);
      try {
        const response = await this.fetchFn(spec.url, { signal: timeout.signal });
        if (!response.ok) {
          throw new Error(
            `[whisper-local] Failed to download whisper.cpp binary (${response.status} ${response.statusText}) from ${spec.url}.`
          );
        }

        const archiveBuffer = Buffer.from(await response.arrayBuffer());
        await extractWhisperArchive({
          archiveBuffer,
          binDir,
          spec,
          targetBinaryName,
        });

        if (!fsSync.existsSync(targetBinaryPath)) {
          throw new Error(
            `[whisper-local] Downloaded whisper.cpp archive from ${spec.url} did not contain expected binary "${targetBinaryName}".`
          );
        }

        return targetBinaryPath;
      } finally {
        timeout.cleanup();
      }
    });
  }

  async ensureWhisperCppModel(signal?: AbortSignal): Promise<string> {
    const { modelPath, exists } = this.resolveCachedModelPath();
    if (exists) {
      return modelPath;
    }

    const normalized = normalizeGgmlModelName(this.model);
    const modelUrl = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${normalized}.bin`;

    return this.runDeduplicatedDownload(`model:${modelPath}`, async () => {
      if (fsSync.existsSync(modelPath)) {
        return modelPath;
      }

      await fs.mkdir(path.dirname(modelPath), { recursive: true });
      const partPath = `${modelPath}.part`;
      const timeout = withTimeoutSignal(Math.max(this.timeoutMs, 600_000), signal);

      try {
        const response = await this.fetchFn(modelUrl, { signal: timeout.signal });
        if (!response.ok) {
          throw new Error(
            `[whisper-local] Failed to download Whisper model "ggml-${normalized}.bin" (${response.status} ${response.statusText}) from ${modelUrl}.`
          );
        }

        if (response.body) {
          await pipeline(
            Readable.fromWeb(response.body as any),
            fsSync.createWriteStream(partPath),
            { signal: timeout.signal }
          );
        } else {
          const buf = Buffer.from(await response.arrayBuffer());
          await fs.writeFile(partPath, buf);
        }

        await fs.rename(partPath, modelPath);
        return modelPath;
      } catch (err) {
        await fs.rm(partPath, { force: true }).catch(() => undefined);
        throw err;
      } finally {
        timeout.cleanup();
      }
    });
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

    if (this.autoDownload && !this.hasExplicitBinary) {
      const cachedBinary = this.getExistingManagedBinaryPath();
      const { exists: modelExists, modelPath } = this.resolveCachedModelPath();
      const asset = resolveWhisperBinaryAsset(this.platform, this.arch);

      if (!cachedBinary && !asset) {
        return {
          available: false,
          mode: "cli",
          error: `[whisper-local] Automatic whisper.cpp binary download is not supported for ${this.platform}/${this.arch}.`,
        };
      }

      const binStatus = cachedBinary ? `binary cached (${cachedBinary})` : "binary will auto-download on first run";
      const modelStatus = modelExists
        ? `model cached (${path.basename(modelPath)})`
        : `model "${path.basename(modelPath)}" will auto-download on first run`;

      return {
        available: true,
        mode: "cli",
        details: `Managed whisper.cpp ready: ${binStatus}, ${modelStatus}`,
      };
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

      const resolvedBinary = this.autoDownload
        ? await this.ensureWhisperCppBinary(input.signal)
        : this.binaryPath;
      const binaryBase = path.basename(resolvedBinary).toLowerCase();
      const isWhisperCpp =
        this.autoDownload ||
        binaryBase.startsWith("whisper-cli") ||
        binaryBase.startsWith("whisper-cpp");

      let args: string[];
      if (isWhisperCpp) {
        const resolvedModel = this.autoDownload
          ? await this.ensureWhisperCppModel(input.signal)
          : this.model;

        let targetAudioPath = audioFilePath!;
        const wavPath = path.join(workDir, "input-16k.wav");
        try {
          const ffRes = await this.commandRunner(
            "ffmpeg",
            [
              "-y",
              "-i",
              audioFilePath!,
              "-vn",
              "-ac",
              "1",
              "-ar",
              "16000",
              "-c:a",
              "pcm_s16le",
              wavPath,
            ],
            {
              timeoutMs: this.timeoutMs,
              signal: input.signal,
            }
          );
          if (ffRes.exitCode === 0 && fsSync.existsSync(wavPath)) {
            targetAudioPath = wavPath;
          }
        } catch {
          // Fall back to original audio file if ffmpeg conversion is unavailable
        }

        args = [
          "-m",
          resolvedModel,
          "-f",
          targetAudioPath,
          "-oj",
          "-of",
          path.join(outDir, "transcript"),
          "-l",
          input.language?.trim() || "auto",
        ];

        if (input.prompt?.trim()) {
          args.push("--prompt", input.prompt.trim());
        }
      } else {
        args = [
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
      }

      let cmdResult;
      try {
        cmdResult = await this.commandRunner(resolvedBinary, args, {
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

