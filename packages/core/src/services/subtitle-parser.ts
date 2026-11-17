export type SubtitleFormat = "srt" | "vtt";

export interface SubtitleCue {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface CoalesceOptions {
  /** Maximum silent gap (seconds) before starting a new block. Default: 2.0 */
  maxGapSeconds?: number;
  /** Target maximum block duration (seconds). Default: 45 */
  maxBlockDurationSeconds?: number;
  /** Target maximum character length per block. Default: 420 */
  maxBlockChars?: number;
}

export interface ParseSubtitleOptions {
  format?: SubtitleFormat;
  filename?: string;
  coalesce?: CoalesceOptions;
}

export interface ParsedSubtitleResult {
  format: SubtitleFormat;
  cues: SubtitleCue[];
  textContent: string;
  startSeconds: number | null;
  endSeconds: number | null;
}

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Parses an SRT/VTT or plain numeric timestamp string (e.g. "01:02:03,450", "04:12.500", "04:12", "252")
 * into fractional seconds.
 */
export function parseTimestampToSeconds(raw: string): number {
  const cleaned = raw.trim().replace(",", ".");
  if (!cleaned) {
    throw new Error("Timestamp string cannot be empty.");
  }

  if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
    const val = Number(cleaned);
    if (!Number.isFinite(val) || val < 0) {
      throw new Error(`Invalid numeric timestamp: "${raw}"`);
    }
    return val;
  }

  const parts = cleaned.split(":");
  if (parts.length !== 2 && parts.length !== 3) {
    throw new Error(`Invalid timestamp format: "${raw}"`);
  }
  if (parts.some((p) => p.trim().length === 0 || !/^\d+(?:\.\d+)?$/.test(p.trim()))) {
    throw new Error(`Invalid timestamp component in "${raw}"`);
  }

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`Invalid timestamp component in "${raw}"`);
  }

  if (parts.length === 2) {
    const [minutes, seconds] = nums;
    if (seconds >= 60) {
      throw new Error(`Seconds must be < 60 in timestamp "${raw}"`);
    }
    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = nums;
  if (minutes >= 60 || seconds >= 60) {
    throw new Error(`Minutes and seconds must be < 60 in timestamp "${raw}"`);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Formats seconds into `MM:SS` or `HH:MM:SS` (when >= 1 hour or `forceHours` is true).
 */
export function formatTimestamp(seconds: number, forceHours = false): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  if (forceHours || hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Formats a `[MM:SS - MM:SS]` (or `[HH:MM:SS - HH:MM:SS]`) bracketed timestamp range marker.
 */
export function formatTimestampRange(startSeconds: number, endSeconds: number): string {
  const start = Math.max(0, Math.floor(Number.isFinite(startSeconds) ? startSeconds : 0));
  const end = Math.max(start, Math.ceil(Number.isFinite(endSeconds) ? endSeconds : start));
  const forceHours = start >= 3600 || end >= 3600;
  return `[${formatTimestamp(start, forceHours)} - ${formatTimestamp(end, forceHours)}]`;
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi, (match) => {
    return ENTITY_MAP[match.toLowerCase()] ?? match;
  });
}

function cleanCueLine(line: string): string {
  // Strip SSA/ASS override tags like {\an8} and HTML/VTT inline tags like <c>, <v Speaker>, <00:01:02.000>, <i>
  const noTags = line
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/<[^>]*>/g, "");
  return decodeHtmlEntities(noTags).replace(/\s+/g, " ").trim();
}

function isVttMetadataBlock(block: string, isFirstBlock: boolean): boolean {
  const trimmed = block.trim();
  if (!trimmed) return true;
  if (isFirstBlock && /^WEBVTT(?:\s|$|-)/i.test(trimmed)) return true;
  if (/^(NOTE|STYLE|REGION)(?:\s|$)/i.test(trimmed)) return true;
  return false;
}

/**
 * Parses `.srt` (SubRip) and `.vtt` (WebVTT) subtitle files into timestamped cues
 * and coalesces fragmented caption lines into readable transcript blocks.
 */
export class SubtitleParser {
  detectFormat(content: string, filename?: string): SubtitleFormat {
    if (filename) {
      const lower = filename.toLowerCase();
      if (lower.endsWith(".vtt")) return "vtt";
      if (lower.endsWith(".srt")) return "srt";
    }

    const stripped = content.replace(/^\uFEFF/, "").trimStart();
    if (/^WEBVTT(?:\s|$|-)/i.test(stripped)) {
      return "vtt";
    }
    return "srt";
  }

  parseCues(content: string, options: { format?: SubtitleFormat; filename?: string } = {}): SubtitleCue[] {
    if (!content || typeof content !== "string") {
      return [];
    }

    const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
    if (!normalized) {
      return [];
    }

    const format = options.format ?? this.detectFormat(normalized, options.filename);
    const blocks = normalized.split(/\n{2,}/);
    const cues: SubtitleCue[] = [];
    let prevRawLines: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (format === "vtt" && isVttMetadataBlock(block, i === 0)) {
        continue;
      }

      const lines = block.split("\n");
      const timingIdx = lines.findIndex((line) => line.includes("-->"));
      if (timingIdx === -1) {
        continue;
      }

      const timingLine = lines[timingIdx];
      const arrowIdx = timingLine.indexOf("-->");
      const rawStart = timingLine.slice(0, arrowIdx).trim();
      const rawEndAndSettings = timingLine.slice(arrowIdx + 3).trim();
      // VTT cue settings appear after whitespace following the end timestamp
      const rawEnd = rawEndAndSettings.split(/\s+/)[0] || "";

      let startSeconds: number;
      let endSeconds: number;
      try {
        startSeconds = parseTimestampToSeconds(rawStart);
        endSeconds = Math.max(startSeconds, parseTimestampToSeconds(rawEnd));
      } catch {
        continue;
      }

      const rawTextLines = lines
        .slice(timingIdx + 1)
        .map(cleanCueLine)
        .filter((l) => l.length > 0);

      if (rawTextLines.length === 0) {
        continue;
      }

      const dedupedLines = this.stripRollingOverlap(prevRawLines, rawTextLines);
      prevRawLines = rawTextLines;

      if (dedupedLines.length === 0) {
        // Exact rolling/flash duplicate of previous cue: extend previous cue's end time
        if (cues.length > 0) {
          cues[cues.length - 1].endSeconds = Math.max(cues[cues.length - 1].endSeconds, endSeconds);
        }
        continue;
      }

      const text = dedupedLines.join(" ").replace(/\s+/g, " ").trim();
      if (!text) {
        continue;
      }

      // Guard against identical consecutive single-line repetitions
      const prevCue = cues[cues.length - 1];
      if (prevCue && prevCue.text === text) {
        prevCue.endSeconds = Math.max(prevCue.endSeconds, endSeconds);
        continue;
      }

      cues.push({ startSeconds, endSeconds, text });
    }

    return cues;
  }

  private stripRollingOverlap(prevLines: string[], currLines: string[]): string[] {
    if (prevLines.length === 0 || currLines.length === 0) {
      return currLines;
    }

    const maxOverlap = Math.min(prevLines.length, currLines.length);
    for (let overlap = maxOverlap; overlap >= 1; overlap--) {
      const prevTail = prevLines.slice(prevLines.length - overlap);
      const currHead = currLines.slice(0, overlap);
      if (prevTail.every((line, idx) => line === currHead[idx])) {
        return currLines.slice(overlap);
      }
    }

    return currLines;
  }

  coalesceCues(cues: SubtitleCue[], options: CoalesceOptions = {}): string {
    if (!cues || cues.length === 0) {
      return "";
    }

    const maxGapSeconds = options.maxGapSeconds ?? 2.0;
    const maxBlockDurationSeconds = options.maxBlockDurationSeconds ?? 45;
    const maxBlockChars = options.maxBlockChars ?? 420;

    const blocks: string[] = [];
    let blockStart = cues[0].startSeconds;
    let blockEnd = cues[0].endSeconds;
    let currentParts: string[] = [cues[0].text];
    let currentTextLen = cues[0].text.length;

    const flush = () => {
      const joined = currentParts.join(" ").replace(/\s+/g, " ").trim();
      if (joined) {
        blocks.push(`${formatTimestampRange(blockStart, blockEnd)} ${joined}`);
      }
    };

    for (let i = 1; i < cues.length; i++) {
      const cue = cues[i];
      const gap = cue.startSeconds - blockEnd;
      const blockDuration = blockEnd - blockStart;
      const candidateDuration = cue.endSeconds - blockStart;
      const candidateChars = currentTextLen + 1 + cue.text.length;
      const lastPart = currentParts[currentParts.length - 1];
      const endsSentence = /[.!?]["')\]]*$/.test(lastPart);

      const shouldSplitOnSentence =
        endsSentence &&
        (candidateDuration > maxBlockDurationSeconds ||
          candidateChars > maxBlockChars ||
          (blockDuration >= 15 && currentTextLen >= 160));
      const exceedsHardCap =
        candidateDuration > maxBlockDurationSeconds * 1.5 || candidateChars > maxBlockChars * 1.5;

      if (gap > maxGapSeconds || shouldSplitOnSentence || exceedsHardCap) {
        flush();
        blockStart = cue.startSeconds;
        blockEnd = cue.endSeconds;
        currentParts = [cue.text];
        currentTextLen = cue.text.length;
      } else {
        blockEnd = Math.max(blockEnd, cue.endSeconds);
        currentParts.push(cue.text);
        currentTextLen = candidateChars;
      }
    }

    flush();
    return blocks.join("\n\n");
  }

  parse(content: string, options: ParseSubtitleOptions = {}): ParsedSubtitleResult {
    const format = options.format ?? this.detectFormat(content, options.filename);
    const cues = this.parseCues(content, { format, filename: options.filename });
    const textContent = this.coalesceCues(cues, options.coalesce);
    const startSeconds = cues.length > 0 ? Math.floor(cues[0].startSeconds) : null;
    const endSeconds = cues.length > 0 ? Math.ceil(cues[cues.length - 1].endSeconds) : null;

    return {
      format,
      cues,
      textContent,
      startSeconds,
      endSeconds,
    };
  }
}

