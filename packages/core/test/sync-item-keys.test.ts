import { describe, it, expect } from "vitest";
import {
  stripUrlFragment,
  normalizeHttpUrlKey,
  normalizeLocalFilePathKey,
  extractYouTubeVideoId,
  extractNotionHexId,
  parseSourceUrlsPure,
  buildKnownItemKeysForSource,
  createKnownItemMatcher,
  getItemSyncStatus,
} from "../src/services/sync-item-keys.js";

describe("sync-item-keys (Story 22.2)", () => {
  it("strips slice hash fragments from URLs and file paths", () => {
    expect(stripUrlFragment("file:///books/math/Calc.pdf#page=1-5")).toBe(
      "file:///books/math/Calc.pdf"
    );
    expect(stripUrlFragment("file:///media/talk.mp4#t=60,120")).toBe(
      "file:///media/talk.mp4"
    );
    expect(stripUrlFragment("https://example.com/post#section=Intro")).toBe(
      "https://example.com/post"
    );
    expect(stripUrlFragment("/notes/C# Guide.md")).toBe("/notes/C# Guide.md");
    expect(stripUrlFragment("file:///notes/C# Guide.md#part=2")).toBe("file:///notes/C# Guide.md");
    expect(stripUrlFragment("file:///books/doc.epub#text/ch01.xhtml")).toBe("file:///books/doc.epub");
  });

  it("extracts canonical 11-character YouTube video IDs from all supported URL formats", () => {
    expect(extractYouTubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60s")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=12")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(extractYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(extractYouTubeVideoId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(extractYouTubeVideoId("https://example.com/not-youtube")).toBeNull();
  });

  it("normalizes local paths consistently without cross-path basename collisions", () => {
    const dirA = normalizeLocalFilePathKey("file:///dirA/same.pdf#page=1-5");
    const dirB = normalizeLocalFilePathKey("/dirB/same.pdf");
    expect(dirA).toBe("/dirA/same.pdf");
    expect(dirB).toBe("/dirB/same.pdf");
    expect(dirA).not.toBe(dirB);

    const winDrive = normalizeLocalFilePathKey("file:///C:/Books/My%20Calc.pdf#page=1-3");
    const winRaw = normalizeLocalFilePathKey("C:\\Books\\My Calc.pdf");
    expect(winDrive).toBe(winRaw);

    if (process.platform === "win32") {
      expect(normalizeLocalFilePathKey("C:\\Books\\CaseTest.pdf")).toBe(
        normalizeLocalFilePathKey("c:\\books\\casetest.pdf")
      );
    }
  });

  it("builds fragment-stripped known item keys per source type", () => {
    const localKeys = buildKnownItemKeysForSource(
      { type: "local", uri: "/books" },
      [
        { url: "file:///books/Calc.pdf#page=1-5", title: "Calc.pdf - Pages 1-5" },
        { url: "file:///books/Calc.pdf#page=6-10", title: "Calc.pdf - Pages 6-10" },
      ]
    );
    const localMatcher = createKnownItemMatcher("local", localKeys);
    expect(localMatcher.hasLocalPath("/books/Calc.pdf")).toBe(true);
    expect(localMatcher.hasLocalPath("/other-folder/Calc.pdf")).toBe(false);

    const ytKeys = buildKnownItemKeysForSource(
      { type: "youtube", uri: "https://youtu.be/dQw4w9WgXcQ" },
      [{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s", title: "Lecture - 02:00" }]
    );
    const ytMatcher = createKnownItemMatcher("youtube", ytKeys);
    expect(ytMatcher.hasYouTubeUri("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(ytMatcher.hasYouTubeUri("dQw4w9WgXcQ")).toBe(true);
    expect(ytMatcher.hasYouTubeUri("https://www.youtube.com/watch?v=abcdefghijk")).toBe(false);

    const rssKeys = buildKnownItemKeysForSource(
      { type: "rss", uri: "https://blog.example.com/feed.xml" },
      [
        { url: "https://blog.example.com/feed.xml", title: "Linkless Post" },
        { url: "https://blog.example.com/post-1#part=1", title: "Post 1" },
      ]
    );
    expect(rssKeys.has(normalizeHttpUrlKey("https://blog.example.com/feed.xml"))).toBe(false);
    expect(rssKeys.has("https://blog.example.com/post-1")).toBe(true);

    const notionKeys = buildKnownItemKeysForSource(
      { type: "notion", uri: "1234567890abcdef1234567890abcdef" },
      [{ url: "https://www.notion.so/My-Page-1234567890abcdef1234567890abcdef#part=1", title: "My Page" }]
    );
    const notionMatcher = createKnownItemMatcher("notion", notionKeys);
    expect(notionMatcher.hasNotionPage("12345678-90ab-cdef-1234-567890abcdef")).toBe(true);
  });

  it("handles EPUB space/non-HTML fragments, Notion ?p= ID precedence, URL commas, and audio/video directory prefixes (Action Item 3)", () => {
    expect(stripUrlFragment("file:///books/My C# Book.epub#Chapter 1.xhtml")).toBe(
      "file:///books/My C# Book.epub"
    );
    expect(stripUrlFragment("/books/a.epub#toc_sec1")).toBe("/books/a.epub");
    expect(stripUrlFragment("/notes/C# Guide.html")).toBe("/notes/C# Guide.html");

    expect(
      extractNotionHexId(
        "https://www.notion.so/Workspace-DB-11111111111111111111111111111111?v=33333333333333333333333333333333&p=22222222222222222222222222222222"
      )
    ).toBe("22222222222222222222222222222222");

    expect(
      parseSourceUrlsPure("https://example.com/search?tags=a,b https://example.com/two", {
        filterHttpOnly: true,
      })
    ).toEqual(["https://example.com/search?tags=a,b", "https://example.com/two"]);

    expect(normalizeLocalFilePathKey("/media/albums/")).toBe("/media/albums");
    expect(getItemSyncStatus("/media/albums", "audio", ["/media/albums/track1.mp3"])).toBe("synced");
    expect(getItemSyncStatus("/media/videos/", "video", ["/media/videos/lecture.mp4"])).toBe("synced");
  });
});
