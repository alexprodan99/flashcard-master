import { describe, it, expect } from "vitest";
import {
  DataSourceTypeSchema,
  MediaSourceItemSchema,
  parseMediaSourceItems,
  SubtitleParser,
  parseTimestampToSeconds,
  formatTimestamp,
  formatTimestampRange,
} from "../src/index.js";

describe("Media Domain Schemas & parseMediaSourceItems", () => {
  it("accepts audio, video, and youtube in DataSourceTypeSchema", () => {
    expect(DataSourceTypeSchema.parse("audio")).toBe("audio");
    expect(DataSourceTypeSchema.parse("video")).toBe("video");
    expect(DataSourceTypeSchema.parse("youtube")).toBe("youtube");
  });

  it("parses structured MediaSourceItem JSON arrays with per-item extraction config", () => {
    const payload = JSON.stringify([
      {
        uri: "/media/lecture1.mp4",
        title: "Lecture 1",
        extractionMode: "subtitles",
        subtitlePath: "/media/lecture1.srt",
        timestampRanges: [{ start: "02:30", end: "14:00", label: "Intro & Core" }],
      },
      {
        uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        extractionMode: "stt",
        sttProvider: "openai",
      },
    ]);

    const items = parseMediaSourceItems(payload);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      uri: "/media/lecture1.mp4",
      title: "Lecture 1",
      extractionMode: "subtitles",
      subtitlePath: "/media/lecture1.srt",
      timestampRanges: [{ start: "02:30", end: "14:00", label: "Intro & Core" }],
    });
    expect(items[1]).toEqual({
      uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      extractionMode: "stt",
      sttProvider: "openai",
    });
  });

  it("parses a single JSON MediaSourceItem object and defaults extractionMode to auto", () => {
    const payload = JSON.stringify({
      uri: "/audio/podcast.mp3",
      sttProvider: "whisper-local",
    });

    const items = parseMediaSourceItems(payload);
    expect(items).toHaveLength(1);
    expect(items[0].extractionMode).toBe("auto");
    expect(items[0].sttProvider).toBe("whisper-local");
  });

  it("parses legacy bare string JSON arrays, multi-line local paths, and comma-separated URLs", () => {
    const legacyArray = parseMediaSourceItems('["/audio/ep1.mp3", "/audio/ep2.m4a"]');
    expect(legacyArray.map((i) => i.uri)).toEqual(["/audio/ep1.mp3", "/audio/ep2.m4a"]);
    expect(legacyArray.every((i) => i.extractionMode === "auto")).toBe(true);

    const localWithCommasAndBrackets = parseMediaSourceItems(
      "[Intro] Lecture 1, Part A.mp3\n/media/Lecture 2.mp4"
    );
    expect(localWithCommasAndBrackets.map((i) => i.uri)).toEqual([
      "[Intro] Lecture 1, Part A.mp3",
      "/media/Lecture 2.mp4",
    ]);

    const multiUrls = parseMediaSourceItems(
      "https://youtu.be/abc12345, https://www.youtube.com/watch?v=xyz98765"
    );
    expect(multiUrls.map((i) => i.uri)).toEqual([
      "https://youtu.be/abc12345",
      "https://www.youtube.com/watch?v=xyz98765",
    ]);

    expect(parseMediaSourceItems("   ")).toEqual([]);
    expect(MediaSourceItemSchema.parse({ uri: "test.wav" }).extractionMode).toBe("auto");
  });
});

describe("Timestamp Utilities", () => {
  it("parses SRT, VTT, MM:SS, HH:MM:SS, and numeric timestamps", () => {
    expect(parseTimestampToSeconds("00:04:12,500")).toBeCloseTo(252.5);
    expect(parseTimestampToSeconds("01:02:03.250")).toBeCloseTo(3723.25);
    expect(parseTimestampToSeconds("04:12.500")).toBeCloseTo(252.5);
    expect(parseTimestampToSeconds("12:30")).toBe(750);
    expect(parseTimestampToSeconds("90:00")).toBe(5400);
    expect(parseTimestampToSeconds("42.75")).toBeCloseTo(42.75);

    expect(() => parseTimestampToSeconds("")).toThrow();
    expect(() => parseTimestampToSeconds("invalid")).toThrow();
    expect(() => parseTimestampToSeconds("01:75:00")).toThrow();
    expect(() => parseTimestampToSeconds("01:65")).toThrow();
  });

  it("formats timestamps and consistent timestamp ranges", () => {
    expect(formatTimestamp(252)).toBe("04:12");
    expect(formatTimestamp(252, true)).toBe("00:04:12");
    expect(formatTimestamp(3665)).toBe("01:01:05");
    expect(formatTimestamp(-5)).toBe("00:00");

    expect(formatTimestampRange(252.2, 267.4)).toBe("[04:12 - 04:28]");
    expect(formatTimestampRange(3595, 3610)).toBe("[00:59:55 - 01:00:10]");
  });
});

describe("SubtitleParser", () => {
  const parser = new SubtitleParser();

  it("parses SRT files with BOM, CRLF, HTML/SSA tags, and HTML entities", () => {
    const srt =
      "\uFEFF1\r\n" +
      "00:00:01,000 --> 00:00:04,200\r\n" +
      "{\\an8}<i>Welcome</i> to Distributed &amp; Parallel Systems.\r\n\r\n" +
      "2\r\n" +
      "00:00:04,500 --> 00:00:08,800\r\n" +
      "Today we&#39;ll examine <b>consensus</b> protocols.\r\n";

    const result = parser.parse(srt, { filename: "lecture.srt" });
    expect(result.format).toBe("srt");
    expect(result.cues).toHaveLength(2);
    expect(result.cues[0]).toEqual({
      startSeconds: 1,
      endSeconds: 4.2,
      text: "Welcome to Distributed & Parallel Systems.",
    });
    expect(result.cues[1]).toEqual({
      startSeconds: 4.5,
      endSeconds: 8.8,
      text: "Today we'll examine consensus protocols.",
    });
    expect(result.startSeconds).toBe(1);
    expect(result.endSeconds).toBe(9);
    expect(result.textContent).toBe(
      "[00:01 - 00:09] Welcome to Distributed & Parallel Systems. Today we'll examine consensus protocols."
    );
  });

  it("parses VTT files ignoring WEBVTT headers, STYLE/NOTE/REGION blocks, cue settings, and inline tags", () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

STYLE
::cue { color: white; }

NOTE This comment should be ignored

REGION
id:bottom

1
00:01.000 --> 00:03.500 align:start position:0%
<v Prof. Alice>Let's start with<00:00:02.000><c> Raft</c></v>

00:03.600 --> 00:06.200
leader election basics.
`;

    const result = parser.parse(vtt);
    expect(result.format).toBe("vtt");
    expect(result.cues).toHaveLength(2);
    expect(result.cues[0].text).toBe("Let's start with Raft");
    expect(result.cues[1].text).toBe("leader election basics.");
    expect(result.textContent).toBe("[00:01 - 00:07] Let's start with Raft leader election basics.");
  });

  it("deduplicates rolling multi-line captions and consecutive duplicate cues", () => {
    const rollingVtt = `WEBVTT

00:00:00.000 --> 00:00:02.000
Welcome to the course
on database internals

00:00:02.000 --> 00:00:02.050
Welcome to the course
on database internals

00:00:02.050 --> 00:00:04.500
on database internals
where we study B-trees.
`;

    const result = parser.parse(rollingVtt);
    expect(result.cues).toHaveLength(2);
    expect(result.cues[0]).toEqual({
      startSeconds: 0,
      endSeconds: 2.05,
      text: "Welcome to the course on database internals",
    });
    expect(result.cues[1]).toEqual({
      startSeconds: 2.05,
      endSeconds: 4.5,
      text: "where we study B-trees.",
    });
  });

  it("splits coalesced blocks on silent gaps, sentence boundaries, and unpunctuated hard limits", () => {
    const cues = [
      { startSeconds: 0, endSeconds: 10, text: "First sentence explains memory hierarchy." },
      { startSeconds: 10.5, endSeconds: 22, text: "Second sentence covers L1 cache latency." },
      { startSeconds: 22.2, endSeconds: 30, text: "Third sentence starts a new topic." },
      { startSeconds: 35, endSeconds: 42, text: "After a 5 second pause we discuss virtual memory." },
    ];

    const coalesced = parser.coalesceCues(cues, {
      maxGapSeconds: 2.0,
      maxBlockDurationSeconds: 25,
      maxBlockChars: 120,
    });

    const blocks = coalesced.split("\n\n");
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBe(
      "[00:00 - 00:22] First sentence explains memory hierarchy. Second sentence covers L1 cache latency."
    );
    expect(blocks[1]).toBe("[00:22 - 00:30] Third sentence starts a new topic.");
    expect(blocks[2]).toBe("[00:35 - 00:42] After a 5 second pause we discuss virtual memory.");
  });

  it("returns empty cues and null bounds for empty or malformed content", () => {
    const res = parser.parse("   ");
    expect(res.cues).toEqual([]);
    expect(res.textContent).toBe("");
    expect(res.startSeconds).toBeNull();
    expect(res.endSeconds).toBeNull();
  });

  it("rejects empty colon segments in parseTimestampToSeconds", () => {
    expect(() => parseTimestampToSeconds(":30")).toThrow();
    expect(() => parseTimestampToSeconds("::")).toThrow();
    expect(() => parseTimestampToSeconds("1::30")).toThrow();
  });
});

