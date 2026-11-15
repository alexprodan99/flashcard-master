import crypto from "node:crypto";
import {
  formatTimestamp,
  formatTimestampRange,
  parseTimestampToSeconds,
} from "./subtitle-parser.js";

export type SlicingMode = "outline" | "budget" | "timestamps" | "chapters" | "none";

export interface TimestampRangeInput {
  start: string | number;
  end: string | number;
}

export interface DocumentSlicingOptions {
  mode?: SlicingMode;
  pagesPerChunk?: number;
  wordsPerChunk?: number;
  minChunkWords?: number;
  minutesPerChunk?: number;
  timestampRanges?: TimestampRangeInput[];
}

export interface DocumentSliceInput {
  sourceId: string;
  title: string;
  textContent: string;
  rawContent?: string | null;
  url?: string | null;
  originUrl?: string | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
}

export interface SlicedSubdocument {
  id: string;
  sourceId: string;
  title: string;
  url: string | null;
  textContent: string;
  rawContent?: string | null;
  contentHash: string;
  wordCount: number;
  startPage?: number | null;
  endPage?: number | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
}

interface ParsedCueBlock {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

const YOUTUBE_URL_REGEX = /(?:youtube\.com\/(?:watch|shorts\/|live\/)|youtu\.be\/)/i;
const INLINE_BRACKET_TIMESTAMP_REGEX =
  /\[(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)(?:\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?))?\]/;

function parseFlexibleTimestamp(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  try {
    return parseTimestampToSeconds(trimmed);
  } catch {
    return null;
  }
}

function buildTimestampedUrl(
  baseUrl: string,
  startSeconds: number | null | undefined,
  endSeconds: number | null | undefined,
  seenUrls?: Map<string, number>,
  chapterAnchor?: string
): string | null {
  if (!baseUrl) return null;

  let url: string;
  if (typeof startSeconds === "number" && startSeconds >= 0 && YOUTUBE_URL_REGEX.test(baseUrl)) {
    const cleaned = baseUrl
      .replace(/([?&])t=\d+s?(?=&|$)/gi, "$1")
      .replace(/[?&]+$/, "")
      .replace(/\?&/, "?");
    const sep = cleaned.includes("?") ? "&" : "?";
    url = `${cleaned}${sep}t=${Math.floor(startSeconds)}s`;
  } else if (typeof startSeconds === "number" && startSeconds >= 0) {
    const startInt = Math.floor(startSeconds);
    const endInt =
      typeof endSeconds === "number" && endSeconds > startInt ? Math.ceil(endSeconds) : null;
    url = endInt !== null ? `${baseUrl}#t=${startInt},${endInt}` : `${baseUrl}#t=${startInt}`;
  } else if (chapterAnchor) {
    url = `${baseUrl}#section=${encodeURIComponent(chapterAnchor)}`;
  } else {
    url = baseUrl;
  }

  if (seenUrls) {
    if (seenUrls.has(url)) {
      const count = seenUrls.get(url)! + 1;
      seenUrls.set(url, count);
      url = url.includes("#") ? `${url}-${count}` : `${url}#slice-${count}`;
    } else {
      seenUrls.set(url, 1);
    }
  }

  return url;
}

function parseTranscriptCueBlocks(text: string): ParsedCueBlock[] {
  if (!text || !text.trim()) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  interface DraftCue {
    startSeconds: number;
    explicitEndSeconds: number | null;
    parts: string[];
  }

  const drafts: DraftCue[] = [];
  let current: DraftCue | null = null;
  let inCodeBlock = false;

  const globalTimestampRegex =
    /\[(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)(?:\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?))?\]/g;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Skip metadata comments and markdown headings
    if (/^<!--[\s\S]*?-->$/.test(trimmed) || /^#{1,6}\s+/.test(trimmed)) {
      continue;
    }

    if (!trimmed) {
      continue;
    }

    const matches = Array.from(trimmed.matchAll(globalTimestampRegex));
    if (matches.length === 0) {
      if (current) {
        current.parts.push(trimmed);
      }
      continue;
    }

    // Preserve any leading text before the first marker on this line
    const firstIdx = matches[0].index ?? 0;
    if (firstIdx > 0 && current) {
      const prefix = trimmed.slice(0, firstIdx).trim();
      if (prefix) {
        current.parts.push(prefix);
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const startSeconds = parseFlexibleTimestamp(m[1]);
      if (startSeconds === null) continue;
      const explicitEndSeconds = m[2] ? parseFlexibleTimestamp(m[2]) : null;
      const sliceStart = m.index ?? 0;
      const sliceEnd = i + 1 < matches.length ? (matches[i + 1].index ?? trimmed.length) : trimmed.length;
      const segmentText = trimmed.slice(sliceStart, sliceEnd).trim();

      current = {
        startSeconds,
        explicitEndSeconds:
          explicitEndSeconds !== null ? Math.max(startSeconds, explicitEndSeconds) : null,
        parts: segmentText ? [segmentText] : [],
      };
      drafts.push(current);
    }
  }

  const cues: ParsedCueBlock[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const nextStart = i + 1 < drafts.length ? drafts[i + 1].startSeconds : d.startSeconds;
    const endSeconds =
      d.explicitEndSeconds !== null
        ? Math.max(d.startSeconds, d.explicitEndSeconds)
        : Math.max(d.startSeconds, nextStart);
    const joined = d.parts.join(" ").replace(/\s+/g, " ").trim();
    if (joined) {
      cues.push({
        startSeconds: d.startSeconds,
        endSeconds,
        text: joined,
      });
    }
  }

  return cues;
}

function computeWordCount(text: string): number {
  const stripped = text
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /\[\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?(?:\s*[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)?\]/g,
      " "
    )
    .trim();
  if (!stripped) return 0;
  const words = stripped.split(/\s+/).filter(Boolean);
  return words.length;
}

function computeDeterministicId(sourceId: string, urlOrTitle: string): string {
  return crypto
    .createHash("sha256")
    .update(`${sourceId}:${urlOrTitle}`)
    .digest("hex")
    .slice(0, 32);
}

function computeContentHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export class DocumentSlicingEngine {
  slice(input: DocumentSliceInput, options?: DocumentSlicingOptions): SlicedSubdocument[] {
    const mode: SlicingMode = options?.mode ?? "none";

    if (!input.textContent || input.textContent.trim().length === 0) {
      return [];
    }

    if (mode === "none") {
      return this.sliceFullDocument(input);
    }

    if (options?.timestampRanges && options.timestampRanges.length > 0) {
      return this.sliceByCustomTimestampRanges(input, options.timestampRanges);
    }

    if (mode === "timestamps") {
      return this.sliceByTimestampIntervals(input, options?.minutesPerChunk ?? 10);
    }

    if (mode === "chapters") {
      return this.sliceByChapters(input, options);
    }

    if (mode === "outline") {
      if (/<!--\s*chapter:/i.test(input.textContent)) {
        return this.sliceByChapters(input, options);
      }
      return this.sliceOutline(input, options);
    }

    if (mode === "budget") {
      return this.sliceBudget(input, options);
    }

    // Default / "none": Full document mode
    return this.sliceFullDocument(input);
  }

  sliceDocument(input: DocumentSliceInput, options?: DocumentSlicingOptions): SlicedSubdocument[] {
    return this.slice(input, options);
  }

  private buildSingleSlice(
    input: DocumentSliceInput,
    title: string,
    textContent: string,
    rawContent: string | null = null,
    startPage: number | null = null,
    endPage: number | null = null,
    startSeconds: number | null = null,
    endSeconds: number | null = null,
    urlOverride?: string | null
  ): SlicedSubdocument {
    let resolvedStartSeconds =
      startSeconds !== null && startSeconds !== undefined
        ? startSeconds
        : (input.startSeconds ?? null);
    let resolvedEndSeconds =
      endSeconds !== null && endSeconds !== undefined
        ? endSeconds
        : (input.endSeconds ?? null);

    if (resolvedStartSeconds === null && resolvedEndSeconds === null) {
      const cues = parseTranscriptCueBlocks(textContent);
      if (cues.length > 0) {
        resolvedStartSeconds = Math.floor(cues[0].startSeconds);
        resolvedEndSeconds = Math.ceil(cues[cues.length - 1].endSeconds);
      }
    }

    const docUrl = urlOverride !== undefined ? urlOverride : (input.originUrl || input.url || null);
    const id = computeDeterministicId(input.sourceId, docUrl || title);
    const wordCount = computeWordCount(textContent);
    const contentHash = computeContentHash(textContent);

    return {
      id,
      sourceId: input.sourceId,
      title,
      url: docUrl,
      textContent,
      rawContent,
      contentHash,
      wordCount,
      startPage,
      endPage,
      startSeconds: resolvedStartSeconds,
      endSeconds: resolvedEndSeconds,
    };
  }

  private sliceFullDocument(input: DocumentSliceInput): SlicedSubdocument[] {
    const pageMatches = Array.from(input.textContent.matchAll(/<!--\s*page:\s*(\d+)\s*-->/gi));
    let startPage: number | null = null;
    let endPage: number | null = null;

    if (pageMatches.length > 0) {
      const pageNumbers = pageMatches.map((m) => parseInt(m[1], 10)).filter((n) => !isNaN(n));
      if (pageNumbers.length > 0) {
        startPage = Math.min(...pageNumbers);
        endPage = Math.max(...pageNumbers);
      }
    }

    return [
      this.buildSingleSlice(
        input,
        input.title,
        input.textContent,
        input.rawContent || null,
        startPage,
        endPage,
        input.startSeconds ?? null,
        input.endSeconds ?? null
      ),
    ];
  }

  private sliceByCustomTimestampRanges(
    input: DocumentSliceInput,
    ranges: TimestampRangeInput[]
  ): SlicedSubdocument[] {
    const cues = parseTranscriptCueBlocks(input.textContent);
    if (cues.length === 0) {
      return this.sliceFullDocument(input);
    }

    const baseUrl = (input.originUrl || input.url || "").split("#")[0].trim();
    const seenUrls = new Map<string, number>();
    const subdocs: SlicedSubdocument[] = [];

    for (const range of ranges) {
      const rangeStart = parseFlexibleTimestamp(range.start);
      const rangeEnd = parseFlexibleTimestamp(range.end);
      if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) {
        continue;
      }

      const matched = cues.filter(
        (cue) =>
          cue.startSeconds < rangeEnd &&
          (cue.endSeconds > rangeStart || cue.startSeconds >= rangeStart)
      );

      if (matched.length === 0) {
        continue;
      }

      const textContent = matched.map((c) => c.text).join("\n\n").trim();
      const startSec = Math.floor(rangeStart);
      const endSec = Math.ceil(rangeEnd);
      const title = `${input.title} ${formatTimestampRange(startSec, endSec)}`;
      const url = buildTimestampedUrl(baseUrl, startSec, endSec, seenUrls);

      subdocs.push(
        this.buildSingleSlice(input, title, textContent, null, null, null, startSec, endSec, url)
      );
    }

    return subdocs;
  }

  private sliceByTimestampIntervals(
    input: DocumentSliceInput,
    minutesPerChunk: number
  ): SlicedSubdocument[] {
    const cues = parseTranscriptCueBlocks(input.textContent);
    if (cues.length === 0) {
      return this.sliceFullDocument(input);
    }

    const intervalSeconds = Math.max(1, minutesPerChunk) * 60;
    const baseUrl = (input.originUrl || input.url || "").split("#")[0].trim();
    const seenUrls = new Map<string, number>();
    const subdocs: SlicedSubdocument[] = [];

    let bucket: ParsedCueBlock[] = [];
    let bucketStart = cues[0].startSeconds;
    let targetEnd = bucketStart + intervalSeconds;

    const flushBucket = () => {
      if (bucket.length === 0) return;
      const firstCue = bucket[0];
      const lastCue = bucket[bucket.length - 1];
      const sliceStart = Math.floor(firstCue.startSeconds);
      const sliceEnd = Math.ceil(Math.max(lastCue.endSeconds, firstCue.startSeconds));
      const textContent = bucket.map((c) => c.text).join("\n\n").trim();
      const title = `${input.title} ${formatTimestampRange(sliceStart, sliceEnd)}`;
      const url = buildTimestampedUrl(baseUrl, sliceStart, sliceEnd, seenUrls);

      subdocs.push(
        this.buildSingleSlice(input, title, textContent, null, null, null, sliceStart, sliceEnd, url)
      );
    };

    for (const cue of cues) {
      if (bucket.length > 0 && cue.startSeconds >= targetEnd) {
        flushBucket();
        bucket = [cue];
        bucketStart = cue.startSeconds;
        targetEnd = bucketStart + intervalSeconds;
      } else {
        bucket.push(cue);
      }
    }

    flushBucket();
    return subdocs;
  }

  private sliceByChapters(
    input: DocumentSliceInput,
    options?: DocumentSlicingOptions
  ): SlicedSubdocument[] {
    const lines = input.textContent.split(/\r?\n/);
    let inCodeBlock = false;
    let hasExplicitChapterOrTimestampedHeading = false;

    interface ChapterSectionDraft {
      title: string;
      startSeconds: number | null;
      endSeconds: number | null;
      fromComment: boolean;
      hasBodyContent: boolean;
      lines: string[];
    }

    const sections: ChapterSectionDraft[] = [];
    let currentSection: ChapterSectionDraft | null = null;
    const preChapterLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
        inCodeBlock = !inCodeBlock;
      }

      const chapterCommentMatch = !inCodeBlock
        ? trimmed.match(/^<!--\s*chapter:\s*(.*?)\s*-->$/i)
        : null;

      if (chapterCommentMatch) {
        hasExplicitChapterOrTimestampedHeading = true;
        const attrs = chapterCommentMatch[1];
        const startAttr = attrs.match(/\bstart\s*=\s*["']?(\d+(?:\.\d+)?)["']?/i);
        const endAttr = attrs.match(/\bend\s*=\s*["']?(\d+(?:\.\d+)?)["']?/i);
        const titleAttr = attrs.match(/\btitle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);

        const parsedStart = startAttr ? Number(startAttr[1]) : null;
        const parsedEnd = endAttr ? Number(endAttr[1]) : null;
        const parsedTitle = (titleAttr?.[1] ?? titleAttr?.[2] ?? "").trim();

        if (currentSection) {
          sections.push(currentSection);
        }

        currentSection = {
          title: parsedTitle || `Chapter ${sections.length + 1}`,
          startSeconds:
            parsedStart !== null && Number.isFinite(parsedStart) ? Math.floor(parsedStart) : null,
          endSeconds:
            parsedEnd !== null && Number.isFinite(parsedEnd) ? Math.ceil(parsedEnd) : null,
          fromComment: true,
          hasBodyContent: false,
          lines: [line],
        };
        continue;
      }

      const headingMatch = !inCodeBlock ? line.match(/^\s{0,3}(#{1,6})\s+(.+)$/) : null;
      if (headingMatch) {
        const rawHeading = headingMatch[2].replace(/#+\s*$/, "").trim();
        const tsMatch = rawHeading.match(INLINE_BRACKET_TIMESTAMP_REGEX);
        const cleanHeading = rawHeading
          .replace(INLINE_BRACKET_TIMESTAMP_REGEX, "")
          .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "")
          .trim();

        const headingStart = tsMatch?.[1] ? parseFlexibleTimestamp(tsMatch[1]) : null;
        const headingEnd = tsMatch?.[2] ? parseFlexibleTimestamp(tsMatch[2]) : null;
        if (headingStart !== null) {
          hasExplicitChapterOrTimestampedHeading = true;
        }

        if (currentSection && currentSection.fromComment && !currentSection.hasBodyContent) {
          // Markdown heading immediately following HTML chapter comment belongs to that same chapter
          currentSection.lines.push(line);
          if (cleanHeading && /^Chapter \d+$/.test(currentSection.title)) {
            currentSection.title = cleanHeading;
          }
          if (currentSection.startSeconds === null && headingStart !== null) {
            currentSection.startSeconds = Math.floor(headingStart);
          }
          if (currentSection.endSeconds === null && headingEnd !== null) {
            currentSection.endSeconds = Math.ceil(headingEnd);
          }
          continue;
        }

        if (currentSection) {
          sections.push(currentSection);
        }

        currentSection = {
          title: cleanHeading || rawHeading,
          startSeconds: headingStart !== null ? Math.floor(headingStart) : null,
          endSeconds: headingEnd !== null ? Math.ceil(headingEnd) : null,
          fromComment: false,
          hasBodyContent: false,
          lines: [line],
        };
        continue;
      }

      if (!currentSection) {
        preChapterLines.push(line);
      } else {
        currentSection.lines.push(line);
        if (trimmed.length > 0 && !/^<!--/.test(trimmed)) {
          currentSection.hasBodyContent = true;
        }
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    if (sections.length === 0) {
      return this.sliceByTimestampIntervals(input, options?.minutesPerChunk ?? 10);
    }

    // Check if headings actually represent timestamped/media chapters
    const anySectionHasCues = sections.some(
      (sec) => parseTranscriptCueBlocks(sec.lines.join("\n")).length > 0
    );
    if (!hasExplicitChapterOrTimestampedHeading && !anySectionHasCues) {
      return this.sliceByTimestampIntervals(input, options?.minutesPerChunk ?? 10);
    }

    // Fill missing start/end timestamps from cue blocks inside each section
    const sectionCues = sections.map((sec) => parseTranscriptCueBlocks(sec.lines.join("\n")));
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const cues = sectionCues[i];
      if (sec.startSeconds === null && cues.length > 0) {
        sec.startSeconds = Math.floor(cues[0].startSeconds);
      }
    }

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const cues = sectionCues[i];
      if (sec.endSeconds === null) {
        const lastCueEnd = cues.length > 0 ? Math.ceil(cues[cues.length - 1].endSeconds) : null;
        const nextStart =
          i + 1 < sections.length ? sections[i + 1].startSeconds : null;

        if (lastCueEnd !== null && (sec.startSeconds === null || lastCueEnd > sec.startSeconds)) {
          sec.endSeconds = lastCueEnd;
        } else if (nextStart !== null && (sec.startSeconds === null || nextStart >= sec.startSeconds)) {
          sec.endSeconds = nextStart;
        } else if (input.endSeconds != null && (sec.startSeconds === null || input.endSeconds >= sec.startSeconds)) {
          sec.endSeconds = Math.ceil(input.endSeconds);
        } else if (sec.startSeconds !== null) {
          sec.endSeconds = sec.startSeconds;
        }
      }
    }

    // Handle pre-chapter lines if they contain spoken transcript cues
    const preText = preChapterLines.join("\n").trim();
    const preCues = parseTranscriptCueBlocks(preText);
    if (preCues.length > 0) {
      const preStart = Math.floor(preCues[0].startSeconds);
      const firstSecStart = sections[0].startSeconds;
      const preEnd =
        firstSecStart !== null && firstSecStart >= preStart
          ? firstSecStart
          : Math.ceil(preCues[preCues.length - 1].endSeconds);
      sections.unshift({
        title: "Introduction",
        startSeconds: preStart,
        endSeconds: preEnd,
        fromComment: false,
        hasBodyContent: true,
        lines: preChapterLines,
      });
    } else if (preText.replace(/<!--[\s\S]*?-->/g, "").trim().length > 0) {
      sections[0].lines = [...preChapterLines, ...sections[0].lines];
    }

    const baseUrl = (input.originUrl || input.url || "").split("#")[0].trim();
    const seenUrls = new Map<string, number>();

    return sections.map((sec) => {
      const textContent = sec.lines.join("\n").trim();
      let title = `${input.title} - ${sec.title}`;
      if (sec.startSeconds !== null) {
        if (sec.endSeconds !== null && sec.endSeconds > sec.startSeconds) {
          title = `${input.title} - ${sec.title} ${formatTimestampRange(sec.startSeconds, sec.endSeconds)}`;
        } else {
          title = `${input.title} - ${sec.title} [${formatTimestamp(sec.startSeconds)}]`;
        }
      }

      const url = buildTimestampedUrl(
        baseUrl,
        sec.startSeconds,
        sec.endSeconds,
        seenUrls,
        sec.title
      );

      return this.buildSingleSlice(
        input,
        title,
        textContent,
        null,
        null,
        null,
        sec.startSeconds,
        sec.endSeconds,
        url
      );
    });
  }

  private sliceBudget(input: DocumentSliceInput, options?: DocumentSlicingOptions): SlicedSubdocument[] {
    const pageMatches = Array.from(input.textContent.matchAll(/<!--\s*page:\s*(\d+)\s*-->/gi));

    if (pageMatches.length > 0) {
      return this.slicePageBudget(input, pageMatches, options);
    }

    return this.sliceWordBudget(input, options);
  }

  private slicePageBudget(
    input: DocumentSliceInput,
    pageMatches: RegExpMatchArray[],
    options?: DocumentSlicingOptions
  ): SlicedSubdocument[] {
    const pagesPerChunk =
      options?.pagesPerChunk && options.pagesPerChunk > 0 ? options.pagesPerChunk : 5;

    // Segment text into distinct pages
    interface PageSegment {
      pageNumber: number;
      text: string;
    }

    const pages: PageSegment[] = [];
    for (let i = 0; i < pageMatches.length; i++) {
      const match = pageMatches[i];
      const pageNum = parseInt(match[1], 10);
      const startIndex = match.index ?? 0;
      const endIndex =
        i + 1 < pageMatches.length ? (pageMatches[i + 1].index ?? input.textContent.length) : input.textContent.length;
      let text = input.textContent.slice(startIndex, endIndex);

      // If text exists before the first marker, attach to first page
      if (i === 0 && startIndex > 0) {
        const prefix = input.textContent.slice(0, startIndex);
        text = prefix + text;
      }

      pages.push({ pageNumber: pageNum, text });
    }

    const subdocs: SlicedSubdocument[] = [];
    const baseUrl = (input.originUrl || input.url || "").split("#")[0].trim();

    for (let i = 0; i < pages.length; i += pagesPerChunk) {
      const chunkPages = pages.slice(i, i + pagesPerChunk);
      const startPage = chunkPages[0].pageNumber;
      const endPage = chunkPages[chunkPages.length - 1].pageNumber;

      const title =
        startPage === endPage
          ? `${input.title} - Page ${startPage}`
          : `${input.title} - Pages ${startPage}-${endPage}`;

      const frag = startPage === endPage ? `#page=${startPage}` : `#page=${startPage}-${endPage}`;
      const url = baseUrl ? `${baseUrl}${frag}` : null;
      const textContent = chunkPages.map((p) => p.text).join("\n\n").trim();
      const wordCount = computeWordCount(textContent);
      const contentHash = computeContentHash(textContent);
      const id = computeDeterministicId(input.sourceId, url || title);

      subdocs.push({
        id,
        sourceId: input.sourceId,
        title,
        url,
        textContent,
        rawContent: null,
        contentHash,
        wordCount,
        startPage,
        endPage,
      });
    }

    return subdocs;
  }

  private sliceWordBudget(input: DocumentSliceInput, options?: DocumentSlicingOptions): SlicedSubdocument[] {
    const wordsPerChunk =
      options?.wordsPerChunk && options.wordsPerChunk > 0 ? options.wordsPerChunk : 1500;

    const paragraphs = input.textContent.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const chunks: string[] = [];
    let currentParagraphs: string[] = [];
    let currentWords = 0;

    for (const para of paragraphs) {
      const paraWords = para.split(/\s+/).filter(Boolean).length;
      if (currentWords > 0 && currentWords + paraWords > wordsPerChunk) {
        chunks.push(currentParagraphs.join("\n\n"));
        currentParagraphs = [];
        currentWords = 0;
      }

      if (paraWords > wordsPerChunk) {
        const words = para.split(/\s+/).filter(Boolean);
        for (let w = 0; w < words.length; w += wordsPerChunk) {
          const slice = words.slice(w, w + wordsPerChunk).join(" ");
          if (currentWords > 0 && currentWords + (words.length - w) > wordsPerChunk) {
            chunks.push(currentParagraphs.join("\n\n"));
            currentParagraphs = [];
            currentWords = 0;
          }
          currentParagraphs.push(slice);
          currentWords += slice.split(/\s+/).length;
          if (currentWords >= wordsPerChunk) {
            chunks.push(currentParagraphs.join("\n\n"));
            currentParagraphs = [];
            currentWords = 0;
          }
        }
      } else {
        currentParagraphs.push(para);
        currentWords += paraWords;
      }
    }

    if (currentParagraphs.length > 0) {
      chunks.push(currentParagraphs.join("\n\n"));
    }

    if (chunks.length === 0 && input.textContent.trim().length > 0) {
      chunks.push(input.textContent.trim());
    }

    const subdocs: SlicedSubdocument[] = [];
    const baseUrl = (input.originUrl || input.url || "").split("#")[0].trim();

    for (let idx = 0; idx < chunks.length; idx++) {
      const partNumber = idx + 1;
      const title = `${input.title} - Part ${partNumber}`;
      const frag = `#part=${partNumber}`;
      const url = baseUrl ? `${baseUrl}${frag}` : null;
      const textContent = chunks[idx];
      const wordCount = computeWordCount(textContent);
      const contentHash = computeContentHash(textContent);
      const id = computeDeterministicId(input.sourceId, url || title);

      subdocs.push({
        id,
        sourceId: input.sourceId,
        title,
        url,
        textContent,
        rawContent: null,
        contentHash,
        wordCount,
        startPage: null,
        endPage: null,
      });
    }

    return subdocs;
  }

  private sliceOutline(input: DocumentSliceInput, options?: DocumentSlicingOptions): SlicedSubdocument[] {
    const lines = input.textContent.split(/\r?\n/);
    let inCodeBlock = false;
    let currentPage: number | null = null;

    interface SectionDraft {
      heading: string;
      lines: string[];
      startPage: number | null;
      endPage: number | null;
      wordCount?: number;
    }

    const sections: SectionDraft[] = [];
    let currentSection: SectionDraft | null = null;
    let trailingBuffer: string[] = [];
    const preHeadingLines: string[] = [];

    for (const line of lines) {
      const pageMatch = line.match(/<!--\s*page:\s*(\d+)\s*-->/i);
      if (pageMatch) {
        currentPage = parseInt(pageMatch[1], 10);
      }

      const trimmed = line.trim();
      if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
        inCodeBlock = !inCodeBlock;
      }

      const headingMatch = !inCodeBlock ? line.match(/^\s{0,3}(#{1,6})\s+(.+)$/) : null;

      if (headingMatch) {
        const headingText = headingMatch[2].replace(/#+\s*$/, "").trim();
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          heading: headingText,
          lines: [...trailingBuffer, line],
          startPage: currentPage,
          endPage: currentPage,
        };
        trailingBuffer = [];
      } else {
        if (!currentSection) {
          preHeadingLines.push(line);
        } else {
          if (trimmed === "" || pageMatch) {
            trailingBuffer.push(line);
          } else {
            if (trailingBuffer.length > 0) {
              currentSection.lines.push(...trailingBuffer);
              trailingBuffer = [];
            }
            currentSection.lines.push(line);
            if (currentPage !== null) {
              currentSection.endPage = currentPage;
            }
          }
        }
      }
    }

    if (currentSection) {
      if (trailingBuffer.length > 0) {
        currentSection.lines.push(...trailingBuffer);
      }
      sections.push(currentSection);
    }

    // If zero headings found, gracefully fall back to budget mode
    if (sections.length === 0) {
      console.warn(
        `[DocumentSlicingEngine] Outline mode found 0 headings in document "${input.title}". Falling back to budget slicing.`
      );
      return this.sliceBudget(input, options);
    }

    // Attach pre-heading content to first section if present
    if (preHeadingLines.length > 0) {
      sections[0].lines = [...preHeadingLines, ...sections[0].lines];
    }

    // Recompute page spans based on page markers within each section
    for (const sec of sections) {
      const secText = sec.lines.join("\n");
      const pageMatches = Array.from(secText.matchAll(/<!--\s*page:\s*(\d+)\s*-->/gi));
      if (pageMatches.length > 0) {
        const nums = pageMatches.map((m) => parseInt(m[1], 10)).filter((n) => !isNaN(n));
        if (nums.length > 0) {
          sec.startPage = Math.min(...nums);
          sec.endPage = Math.max(...nums);
        }
      }
    }

    // Compute word counts for sections
    for (const sec of sections) {
      sec.wordCount = computeWordCount(sec.lines.join("\n"));
    }

    // Merge sections smaller than minChunkWords with adjacent section
    const minChunkWords = options?.minChunkWords;
    if (typeof minChunkWords === "number" && minChunkWords > 0) {
      let i = 0;
      while (i < sections.length && sections.length > 1) {
        if ((sections[i].wordCount ?? 0) < minChunkWords) {
          if (i + 1 < sections.length) {
            // Merge with next section
            const startPages = [sections[i].startPage, sections[i + 1].startPage].filter(
              (n): n is number => typeof n === "number"
            );
            const endPages = [sections[i].endPage, sections[i + 1].endPage].filter(
              (n): n is number => typeof n === "number"
            );
            sections[i + 1].lines = [...sections[i].lines, ...sections[i + 1].lines];
            sections[i + 1].startPage = startPages.length > 0 ? Math.min(...startPages) : null;
            sections[i + 1].endPage = endPages.length > 0 ? Math.max(...endPages) : null;
            sections[i + 1].wordCount = computeWordCount(sections[i + 1].lines.join("\n"));
            sections.splice(i, 1);
          } else if (i > 0) {
            // Merge last section with previous section
            const startPages = [sections[i - 1].startPage, sections[i].startPage].filter(
              (n): n is number => typeof n === "number"
            );
            const endPages = [sections[i - 1].endPage, sections[i].endPage].filter(
              (n): n is number => typeof n === "number"
            );
            sections[i - 1].lines = [...sections[i - 1].lines, ...sections[i].lines];
            sections[i - 1].startPage = startPages.length > 0 ? Math.min(...startPages) : null;
            sections[i - 1].endPage = endPages.length > 0 ? Math.max(...endPages) : null;
            sections[i - 1].wordCount = computeWordCount(sections[i - 1].lines.join("\n"));
            sections.splice(i, 1);
          } else {
            i++;
          }
        } else {
          i++;
        }
      }
    }

    const subdocs: SlicedSubdocument[] = [];
    const baseUrl = (input.originUrl || input.url || "").split("#")[0].trim();
    const seenUrls = new Map<string, number>();

    for (const sec of sections) {
      const title = `${input.title} - ${sec.heading}`;
      const pageParam =
        sec.startPage !== null && sec.startPage !== undefined ? `&page=${sec.startPage}` : "";
      const frag = `#section=${encodeURIComponent(sec.heading)}${pageParam}`;
      let url: string | null = baseUrl ? `${baseUrl}${frag}` : null;

      if (url) {
        if (seenUrls.has(url)) {
          const count = seenUrls.get(url)! + 1;
          seenUrls.set(url, count);
          url = `${url}-${count}`;
        } else {
          seenUrls.set(url, 1);
        }
      }

      const textContent = sec.lines.join("\n").trim();
      const wordCount = sec.wordCount ?? computeWordCount(textContent);
      const contentHash = computeContentHash(textContent);
      const id = computeDeterministicId(input.sourceId, url || title);

      subdocs.push({
        id,
        sourceId: input.sourceId,
        title,
        url,
        textContent,
        rawContent: null,
        contentHash,
        wordCount,
        startPage: sec.startPage,
        endPage: sec.endPage,
      });
    }

    return subdocs;
  }
}
