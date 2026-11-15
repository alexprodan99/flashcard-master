import crypto from "node:crypto";
import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fg from "fast-glob";
import {
  type CleanTextDocument,
  type IngestionOptions,
  type MediaSourceItem,
  type RawDocument,
  type SettingsService,
  type SpeechToTextPort,
  type SttProvider,
  type SubtitleCue,
  SubtitleParser,
  type TimestampRange,
  formatTimestampRange,
  parseMediaSourceItems,
  parseTimestampToSeconds,
} from "@flashcard-master/core";
import {
  AudioTrimmer,
  type CommandRunner,
  defaultCommandRunner,
  isCommandNotFoundError,
} from "../media/audio-trimmer.js";
import { createSttAdapterFromSettings } from "../stt/stt-factory.js";

export const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg", ".flac"] as const;
export const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".webm", ".mov"] as const;
export const SUBTITLE_EXTENSIONS = [".srt", ".vtt"] as const;

const BITMAP_SUBTITLE_CODECS = new Set([
  "dvd_subtitle",
  "dvdsub",
  "hdmv_pgs_subtitle",
  "pgssub",
  "dvb_subtitle",
  "xsub",
]);

export class MissingSubtitleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingSubtitleError";
  }
}

export type MediaResolutionStage =
  | "probing_subtitles"
  | "extracting_embedded_subtitles"
  | "trimming_audio"
  | "transcribing_stt"
  | "formatting_transcript";

export interface MediaTranscriptResolverOptions {
  settingsService?: SettingsService;
  sttPort?: SpeechToTextPort;
  sttFactory?: (provider?: SttProvider, settingsService?: SettingsService) => SpeechToTextPort;
  audioTrimmer?: AudioTrimmer;
  subtitleParser?: SubtitleParser;
  commandRunner?: CommandRunner;
  ffmpegPath?: string;
  ffprobePath?: string;
  tempDir?: string;
}

const TIMESTAMP_SPAN_REGEX =
  /\[(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]/g;

/**
 * Extracts overall `[startSeconds, endSeconds]` timeline bounds from coalesced `[MM:SS - MM:SS]` text.
 */
export function extractTimestampBoundsFromText(text: string): {
  startSeconds: number | null;
  endSeconds: number | null;
} {
  if (!text) {
    return { startSeconds: null, endSeconds: null };
  }

  let minStart: number | null = null;
  let maxEnd: number | null = null;

  for (const match of text.matchAll(TIMESTAMP_SPAN_REGEX)) {
    try {
      const start = parseTimestampToSeconds(match[1]);
      const end = parseTimestampToSeconds(match[2]);
      minStart = minStart === null ? start : Math.min(minStart, start);
      maxEnd = maxEnd === null ? end : Math.max(maxEnd, end);
    } catch {
      // Ignore malformed bracketed spans
    }
  }

  if (minStart === null || maxEnd === null) {
    return { startSeconds: null, endSeconds: null };
  }

  return {
    startSeconds: Math.max(0, Math.floor(minStart)),
    endSeconds: Math.max(0, Math.ceil(maxEnd)),
  };
}

/**
 * Computes a deterministic SHA-256 signature covering URI, subtitle/STT config, and timestamp ranges
 * so incremental delta sync invalidates automatically when any extraction setting changes.
 */
export function computeMediaItemConfigHash(item: MediaSourceItem, extraSeed = ""): string {
  const normalizedPayload = {
    uri: item.uri.replace(/\\/g, "/"),
    title: item.title || "",
    extractionMode: item.extractionMode || "auto",
    subtitlePath: item.subtitlePath ? item.subtitlePath.replace(/\\/g, "/") : "",
    sttProvider: item.sttProvider || "",
    timestampRanges: (item.timestampRanges || []).map((r) => ({
      start: r.start.trim(),
      end: r.end.trim(),
      label: r.label?.trim() || "",
    })),
    extraSeed,
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizedPayload))
    .digest("hex")
    .slice(0, 24);
}

/**
 * Filters subtitle/transcript cues to overlap only the requested custom timestamp ranges.
 */
export function filterCuesByTimestampRanges(
  cues: SubtitleCue[],
  ranges?: TimestampRange[]
): SubtitleCue[] {
  if (!ranges || ranges.length === 0 || cues.length === 0) {
    return cues;
  }

  const normalizedRanges = ranges
    .map((r) => {
      const start = parseTimestampToSeconds(r.start);
      const end = parseTimestampToSeconds(r.end);
      return { start, end };
    })
    .filter((r) => r.end > r.start);

  if (normalizedRanges.length === 0) {
    return cues;
  }

  const filtered: SubtitleCue[] = [];
  for (const cue of cues) {
    for (const range of normalizedRanges) {
      if (cue.endSeconds > range.start && cue.startSeconds < range.end) {
        filtered.push({
          startSeconds: Math.max(cue.startSeconds, range.start),
          endSeconds: Math.min(cue.endSeconds, range.end),
          text: cue.text,
        });
        break;
      }
    }
  }

  return filtered;
}

/**
 * Normalizes a timestamped media RawDocument into a CleanTextDocument while preserving `#cfg` hash salt
 * and `[startSeconds, endSeconds]` timeline bounds.
 */
export function extractCleanTextFromMediaRaw(raw: RawDocument): CleanTextDocument {
  let clean = (raw.rawContent || "").replace(/\r\n/g, "\n");
  clean = clean
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const cfgMatch = raw.guid?.match(/#cfg=([a-f0-9]+)$/i);
  const hashInput = cfgMatch ? `${clean}\n#cfg=${cfgMatch[1]}` : clean;
  const contentHash = crypto.createHash("sha256").update(hashInput, "utf8").digest("hex");

  let startSeconds = raw.startSeconds ?? null;
  let endSeconds = raw.endSeconds ?? null;
  if (startSeconds === null || endSeconds === null) {
    const bounds = extractTimestampBoundsFromText(clean);
    startSeconds = startSeconds ?? bounds.startSeconds;
    endSeconds = endSeconds ?? bounds.endSeconds;
  }

  return {
    id: raw.id,
    sourceId: raw.sourceId,
    title: raw.title,
    textContent: clean,
    rawContent: raw.rawContent,
    originUrl: raw.originUrl,
    contentHash,
    startSeconds,
    endSeconds,
  };
}

export class MediaTranscriptResolver {
  private readonly settingsService?: SettingsService;
  private readonly sttPort?: SpeechToTextPort;
  private readonly sttFactory: (
    provider?: SttProvider,
    settingsService?: SettingsService
  ) => SpeechToTextPort;
  private readonly audioTrimmer: AudioTrimmer;
  private readonly subtitleParser: SubtitleParser;
  private readonly commandRunner: CommandRunner;
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly tempDir: string;

  constructor(options: MediaTranscriptResolverOptions = {}) {
    this.settingsService = options.settingsService;
    this.sttPort = options.sttPort;
    this.sttFactory =
      options.sttFactory ??
      ((provider, settings) => createSttAdapterFromSettings(provider, settings));
    this.subtitleParser = options.subtitleParser ?? new SubtitleParser();
    this.commandRunner = options.commandRunner ?? defaultCommandRunner;
    this.ffmpegPath = options.ffmpegPath || "ffmpeg";
    this.ffprobePath = options.ffprobePath || "ffprobe";
    this.tempDir = options.tempDir || os.tmpdir();
    this.audioTrimmer =
      options.audioTrimmer ??
      new AudioTrimmer({
        ffmpegPath: this.ffmpegPath,
        ffprobePath: this.ffprobePath,
        tempDir: this.tempDir,
        commandRunner: this.commandRunner,
      });
  }

  async discoverItems(
    rawUri: string,
    allowedMediaExtensions: readonly string[]
  ): Promise<MediaSourceItem[]> {
    const parsedItems = parseMediaSourceItems(rawUri);
    const expanded: MediaSourceItem[] = [];

    for (const item of parsedItems) {
      if (fsSync.existsSync(item.uri)) {
        let stat: fsSync.Stats | null = null;
        try {
          stat = fsSync.statSync(item.uri);
        } catch {
          stat = null;
        }

        if (stat?.isDirectory()) {
          const allExts = [...allowedMediaExtensions, ...SUBTITLE_EXTENSIONS]
            .map((ext) => ext.replace(/^\./, ""))
            .join(",");
          const pattern = `**/*.{${allExts}}`;
          const files = await fg(pattern, {
            cwd: item.uri.replace(/\\/g, "/"),
            absolute: true,
            caseSensitiveMatch: false,
            ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
            onlyFiles: true,
          });
          files.sort();

          const allowedMediaSet = new Set(allowedMediaExtensions.map((e) => e.toLowerCase()));
          const subSet = new Set(SUBTITLE_EXTENSIONS.map((e) => e.toLowerCase()));

          const mediaKeys: Array<{ dirLower: string; baseLower: string }> = [];
          for (const filePath of files) {
            const ext = path.extname(filePath).toLowerCase();
            if (allowedMediaSet.has(ext)) {
              mediaKeys.push({
                dirLower: path.dirname(filePath).replace(/\\/g, "/").toLowerCase(),
                baseLower: path.basename(filePath, ext).toLowerCase(),
              });
            }
          }

          for (const filePath of files) {
            const ext = path.extname(filePath).toLowerCase();
            if (subSet.has(ext)) {
              const dirLower = path.dirname(filePath).replace(/\\/g, "/").toLowerCase();
              const subBaseLower = path.basename(filePath, ext).toLowerCase();
              const hasSiblingMedia = mediaKeys.some(
                (m) =>
                  m.dirLower === dirLower &&
                  (subBaseLower === m.baseLower || subBaseLower.startsWith(`${m.baseLower}.`))
              );
              if (hasSiblingMedia) {
                continue;
              }
            }

            expanded.push({
              uri: filePath,
              extractionMode: item.extractionMode,
              sttProvider: item.sttProvider,
              timestampRanges: item.timestampRanges,
            });
          }
          continue;
        }
      }

      expanded.push(item);
    }

    return expanded;
  }

  private findSidecarSubtitlePath(mediaPath: string): string | null {
    const dir = path.dirname(mediaPath);
    const ext = path.extname(mediaPath);
    const base = path.basename(mediaPath, ext);

    const directCandidates = [
      path.join(dir, `${base}.srt`),
      path.join(dir, `${base}.vtt`),
      path.join(dir, `${base}.en.srt`),
      path.join(dir, `${base}.en.vtt`),
    ];

    for (const candidate of directCandidates) {
      if (fsSync.existsSync(candidate)) {
        return candidate;
      }
    }

    // Fallback scan for any <base>.<lang>.(srt|vtt) sidecar in same directory
    try {
      const entries = fsSync.readdirSync(dir);
      const baseLower = `${base.toLowerCase()}.`;
      for (const entry of entries) {
        const entryLower = entry.toLowerCase();
        if (
          entryLower.startsWith(baseLower) &&
          (entryLower.endsWith(".srt") || entryLower.endsWith(".vtt"))
        ) {
          return path.join(dir, entry);
        }
      }
    } catch {
      // Ignore unreadable directory
    }

    return null;
  }

  private async tryExtractEmbeddedSubtitles(
    videoPath: string,
    signal?: AbortSignal
  ): Promise<SubtitleCue[] | null> {
    let streamSpecifier = "0:s:0";
    try {
      const probeRes = await this.commandRunner(
        this.ffprobePath,
        [
          "-v",
          "error",
          "-select_streams",
          "s",
          "-show_entries",
          "stream=index,codec_name:stream_tags=language,title",
          "-of",
          "json",
          videoPath,
        ],
        { timeoutMs: 15000, signal }
      );

      if (probeRes.exitCode !== 0) {
        return null;
      }

      const parsed = JSON.parse(probeRes.stdout || "{}") as {
        streams?: Array<{ index?: number; codec_name?: string }>;
      };
      const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
      if (streams.length === 0) {
        return null;
      }

      const textStreamPos = streams.findIndex(
        (s) => !s.codec_name || !BITMAP_SUBTITLE_CODECS.has(s.codec_name.toLowerCase())
      );
      if (textStreamPos === -1) {
        return null;
      }
      streamSpecifier = `0:s:${textStreamPos}`;
    } catch {
      return null;
    }

    const workDir = await fs.mkdtemp(path.join(this.tempDir, "fcm-sub-"));
    const tempSrtPath = path.join(workDir, "embedded.srt");

    try {
      const extractRes = await this.commandRunner(
        this.ffmpegPath,
        ["-y", "-i", videoPath, "-map", streamSpecifier, tempSrtPath],
        { timeoutMs: 30000, signal }
      );
      if (extractRes.exitCode !== 0 || !fsSync.existsSync(tempSrtPath)) {
        return null;
      }
      const rawSrt = await fs.readFile(tempSrtPath, "utf8");
      const cues = this.subtitleParser.parseCues(rawSrt, { format: "srt", filename: tempSrtPath });
      return cues.length > 0 ? cues : null;
    } catch {
      return null;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  private buildRawDocument(options: {
    sourceId: string;
    item: MediaSourceItem;
    title: string;
    cues: SubtitleCue[];
    fallbackText?: string;
    fileStat: fsSync.Stats;
  }): RawDocument {
    const normalizedPath = options.item.uri.replace(/\\/g, "/");
    const coalesced =
      options.cues.length > 0
        ? this.subtitleParser.coalesceCues(options.cues)
        : options.fallbackText?.trim()
          ? `${formatTimestampRange(0, 0)} ${options.fallbackText.trim()}`
          : "";

    let startSeconds: number | null = null;
    let endSeconds: number | null = null;
    if (options.cues.length > 0) {
      startSeconds = Math.max(0, Math.floor(options.cues[0].startSeconds));
      endSeconds = Math.max(
        startSeconds,
        Math.ceil(options.cues[options.cues.length - 1].endSeconds)
      );
    } else if (options.item.timestampRanges && options.item.timestampRanges.length > 0) {
      const bounds = extractTimestampBoundsFromText(coalesced);
      startSeconds = bounds.startSeconds;
      endSeconds = bounds.endSeconds;
    } else if (coalesced) {
      startSeconds = 0;
      endSeconds = 0;
    }

    const configHash = computeMediaItemConfigHash(
      options.item,
      `${Math.trunc(options.fileStat.mtimeMs)}:${options.fileStat.size}`
    );

    const docId = crypto
      .createHash("sha256")
      .update(`${options.sourceId}:${normalizedPath}`)
      .digest("hex")
      .slice(0, 32);

    return {
      id: docId,
      sourceId: options.sourceId,
      title: options.title,
      rawContent: coalesced,
      originUrl: `file://${normalizedPath}`,
      publishedAt: options.fileStat.mtime.toISOString(),
      guid: `${normalizedPath}#cfg=${configHash}`,
      startSeconds,
      endSeconds,
    };
  }

  async resolveItem(
    item: MediaSourceItem,
    options: {
      mediaKind: "audio" | "video";
      sourceId: string;
      onProgress?: (stage: MediaResolutionStage, message: string) => void;
      onLog?: IngestionOptions["onLog"];
      signal?: AbortSignal;
    }
  ): Promise<RawDocument | null> {
    const notify = (stage: MediaResolutionStage, message: string) => {
      options.onProgress?.(stage, message);
      options.onLog?.("info", message, { stage, uri: item.uri });
    };

    if (item.extractionMode === "subtitles" && item.subtitlePath && !fsSync.existsSync(item.subtitlePath)) {
      throw new MissingSubtitleError(
        `Subtitle file "${item.subtitlePath}" was not found for "${item.uri}".`
      );
    }

    if (!fsSync.existsSync(item.uri)) {
      const msg = `Media file does not exist: ${item.uri}`;
      options.onLog?.("warn", msg, { uri: item.uri });
      return null;
    }

    const fileStat = fsSync.statSync(item.uri);
    const ext = path.extname(item.uri).toLowerCase();
    const title = item.title?.trim() || path.basename(item.uri, ext) || "Untitled Media";

    // Standalone .srt / .vtt item
    if (ext === ".srt" || ext === ".vtt") {
      notify("probing_subtitles", `Parsing subtitle file "${path.basename(item.uri)}"...`);
      const content = await fs.readFile(item.uri, "utf8");
      const rawCues = this.subtitleParser.parseCues(content, { filename: item.uri });
      const filteredCues = filterCuesByTimestampRanges(rawCues, item.timestampRanges);
      notify("formatting_transcript", `Formatted ${filteredCues.length} subtitle cue(s) for "${title}".`);
      return this.buildRawDocument({
        sourceId: options.sourceId,
        item,
        title,
        cues: filteredCues,
        fileStat,
      });
    }

    // Tier 1 & Tier 2: Subtitle resolution (skipped when user explicitly forces 'stt')
    if (item.extractionMode === "subtitles" || item.extractionMode === "auto") {
      notify("probing_subtitles", `Probing external subtitles for "${path.basename(item.uri)}"...`);

      // Tier 1: Explicit subtitlePath or sibling sidecar .srt / .vtt
      let externalSubPath: string | null = null;
      if (item.subtitlePath) {
        if (!fsSync.existsSync(item.subtitlePath)) {
          throw new MissingSubtitleError(
            `Subtitle file "${item.subtitlePath}" was not found for "${item.uri}".`
          );
        }
        externalSubPath = item.subtitlePath;
      } else {
        externalSubPath = this.findSidecarSubtitlePath(item.uri);
      }

      if (externalSubPath) {
        const rawSub = await fs.readFile(externalSubPath, "utf8");
        const parsedCues = this.subtitleParser.parseCues(rawSub, { filename: externalSubPath });
        if (parsedCues.length > 0) {
          const filteredCues = filterCuesByTimestampRanges(parsedCues, item.timestampRanges);
          notify(
            "formatting_transcript",
            `Loaded ${filteredCues.length} subtitle cue(s) from "${path.basename(externalSubPath)}".`
          );
          return this.buildRawDocument({
            sourceId: options.sourceId,
            item,
            title,
            cues: filteredCues,
            fileStat,
          });
        }
      }

      // Tier 2: Embedded video subtitle track
      if (options.mediaKind === "video") {
        notify(
          "extracting_embedded_subtitles",
          `Checking embedded subtitle tracks in "${path.basename(item.uri)}"...`
        );
        const embeddedCues = await this.tryExtractEmbeddedSubtitles(item.uri, options.signal);
        if (embeddedCues && embeddedCues.length > 0) {
          const filteredCues = filterCuesByTimestampRanges(embeddedCues, item.timestampRanges);
          notify(
            "formatting_transcript",
            `Extracted ${filteredCues.length} embedded subtitle cue(s) from "${title}".`
          );
          return this.buildRawDocument({
            sourceId: options.sourceId,
            item,
            title,
            cues: filteredCues,
            fileStat,
          });
        }
      }

      if (item.extractionMode === "subtitles") {
        throw new MissingSubtitleError(
          `No .srt/.vtt subtitle file or embedded subtitle track found for "${path.basename(item.uri)}" when extractionMode is "subtitles".`
        );
      }
    }

    // Tier 3: Speech-to-Text (pre-trimmed when timestampRanges exist or video audio track needs extraction)
    const sttPort = this.sttPort ?? this.sttFactory(item.sttProvider, this.settingsService);
    const hasCustomRanges = Boolean(item.timestampRanges && item.timestampRanges.length > 0);

    let sttResult;
    if (hasCustomRanges || options.mediaKind === "video") {
      if (hasCustomRanges) {
        notify(
          "trimming_audio",
          `Trimming audio window(s) for "${title}" prior to ${sttPort.provider} STT...`
        );
      }
      notify(
        "transcribing_stt",
        `Transcribing "${title}" via ${sttPort.provider} Speech-to-Text...`
      );
      try {
        sttResult = await this.audioTrimmer.transcribeWithTrimming(sttPort, item.uri, {
          ranges: item.timestampRanges,
          signal: options.signal,
        });
      } catch (err) {
        const isFfmpegMissing =
          isCommandNotFoundError(err) ||
          (err instanceof Error && /ffmpeg.*(?:not found|enoent)/i.test(err.message));
        if (!hasCustomRanges && isFfmpegMissing) {
          options.onLog?.(
            "warn",
            `ffmpeg unavailable; falling back to direct ${sttPort.provider} STT upload for "${title}".`,
            { uri: item.uri }
          );
          sttResult = await sttPort.transcribe({
            audioPath: item.uri,
            signal: options.signal,
          });
        } else {
          throw err;
        }
      }
    } else {
      notify(
        "transcribing_stt",
        `Transcribing "${title}" via ${sttPort.provider} Speech-to-Text...`
      );
      sttResult = await sttPort.transcribe({
        audioPath: item.uri,
        signal: options.signal,
      });
    }

    notify("formatting_transcript", `Formatting transcript cues for "${title}"...`);
    return this.buildRawDocument({
      sourceId: options.sourceId,
      item,
      title,
      cues: sttResult.cues,
      fallbackText: sttResult.text,
      fileStat,
    });
  }

  async resolveSourceItems(
    sourceId: string,
    rawUri: string,
    options: {
      mediaKind: "audio" | "video";
      allowedExtensions: readonly string[];
      ingestionOptions?: IngestionOptions;
    }
  ): Promise<RawDocument[]> {
    const items = await this.discoverItems(rawUri, options.allowedExtensions);
    const docs: RawDocument[] = [];

    for (const item of items) {
      if (options.ingestionOptions?.signal?.aborted) {
        const abortErr = new Error("Task aborted by user");
        abortErr.name = "AbortError";
        throw abortErr;
      }

      try {
        const doc = await this.resolveItem(item, {
          mediaKind: options.mediaKind,
          sourceId,
          onLog: options.ingestionOptions?.onLog,
          signal: options.ingestionOptions?.signal,
        });
        if (doc) {
          docs.push(doc);
        }
      } catch (err: any) {
        if (
          err instanceof MissingSubtitleError ||
          err?.name === "AbortError" ||
          item.extractionMode === "stt" ||
          items.length === 1
        ) {
          throw err;
        }
        options.ingestionOptions?.onLog?.(
          "warn",
          `Skipping media item "${item.uri}": ${err?.message || String(err)}`,
          { uri: item.uri }
        );
      }
    }

    return docs;
  }

  extractCleanText(raw: RawDocument): CleanTextDocument {
    return extractCleanTextFromMediaRaw(raw);
  }
}
