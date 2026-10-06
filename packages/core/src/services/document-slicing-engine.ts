import crypto from "node:crypto";

export type SlicingMode = "outline" | "budget" | "none";

export interface DocumentSlicingOptions {
  mode?: SlicingMode;
  pagesPerChunk?: number;
  wordsPerChunk?: number;
  minChunkWords?: number;
}

export interface DocumentSliceInput {
  sourceId: string;
  title: string;
  textContent: string;
  rawContent?: string | null;
  url?: string | null;
  originUrl?: string | null;
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
}

function computeWordCount(text: string): number {
  const stripped = text.replace(/<!--[\s\S]*?-->/g, " ").trim();
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

    if (mode === "outline") {
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

    const docUrl = input.originUrl || input.url || null;
    const title = input.title;
    const id = computeDeterministicId(input.sourceId, docUrl || title);
    const wordCount = computeWordCount(input.textContent);
    const contentHash = computeContentHash(input.textContent);

    return [
      {
        id,
        sourceId: input.sourceId,
        title,
        url: docUrl,
        textContent: input.textContent,
        rawContent: input.rawContent || null,
        contentHash,
        wordCount,
        startPage,
        endPage,
      },
    ];
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
