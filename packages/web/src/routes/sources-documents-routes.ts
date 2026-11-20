import fs from "node:fs";
import path from "node:path";
import type { DiscoveredDocument } from "@flashcard-master/core";
import { DocumentExportService, YouTubeIngestionStrategy } from "@flashcard-master/adapters";
import { buildSourceSyncStatus } from "./sync-generate-routes.js";
import type { RouteContext } from "./route-context.js";

const ALLOWED_UPLOAD_EXTS = [
  ".md",
  ".markdown",
  ".txt",
  ".pdf",
  ".docx",
  ".epub",
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
  ".flac",
  ".mp4",
  ".mkv",
  ".webm",
  ".mov",
  ".srt",
  ".vtt",
];

function enrichDocumentsWithCardCount(
  docs: DiscoveredDocument[],
  cards: ReadonlyArray<{ documentTitle?: string | null; sourceOriginUrl?: string | null }>
) {
  return docs.map((doc) => {
    const cardCount = cards.filter(
      (c) =>
        (c.documentTitle && c.documentTitle.toLowerCase() === doc.title.toLowerCase()) ||
        (c.sourceOriginUrl && doc.url && c.sourceOriginUrl === doc.url)
    ).length;
    return {
      ...doc,
      textContent:
        doc.textContent && doc.textContent.length > 2000 ? doc.textContent.slice(0, 2000) : doc.textContent || "",
      cardCount,
    };
  });
}

/**
 * Handles `/api/sources/*` and `/api/documents/*` REST endpoints.
 */
export async function handleSourcesAndDocumentsRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, pathname, method, query, options, jobManager, workerExecutor, settingsService, mediaService, mediaDir, localFilesDir } =
    ctx;

  // 6. Sources CRUD Endpoints
  if (pathname === "/api/sources") {
    if (method === "GET") {
      ctx.sendJson(200, options.sourceRepo.list());
      return true;
    }

    if (method === "POST") {
      const body = await ctx.parseBody();
      const created = options.sourceRepo.create(body);
      ctx.sendJson(201, created);
      return true;
    }
  }

  // 6a. Local Source File Upload Endpoint: POST /api/sources/upload
  if (pathname === "/api/sources/upload" && method === "POST") {
    const contentType = req.headers["content-type"] || "";
    let filename: string | undefined;
    let fileBuffer: Buffer | undefined;

    if (contentType.includes("multipart/form-data")) {
      const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
      const boundary = boundaryMatch ? boundaryMatch[1].trim().replace(/^"|"$/g, "") : null;
      if (!boundary) {
        ctx.sendJson(400, { error: "Missing multipart boundary in Content-Type header" });
        return true;
      }
      const rawBody = await ctx.readRequestBodyBuffer();
      const parsed = ctx.parseMultipartFormData(rawBody, boundary);
      if (!parsed || !parsed.filename) {
        ctx.sendJson(400, { error: "No file provided in multipart upload" });
        return true;
      }
      filename = parsed.filename;
      fileBuffer = parsed.content;
    } else if (contentType.includes("application/json")) {
      const json = await ctx.parseBody();
      filename = json.filename;
      if (json.content !== undefined) {
        if (typeof json.content === "string") {
          const contentStr = json.content.trim();
          if (contentStr.startsWith("data:") && contentStr.includes(";base64,")) {
            const base64Data = contentStr.split(";base64,")[1];
            fileBuffer = Buffer.from(base64Data, "base64");
          } else if (
            json.encoding === "base64" ||
            json.isBase64 === true ||
            (/\.(pdf|docx|png|jpg|jpeg|gif|webp|zip|mp3|wav|m4a|ogg|flac|mp4|mkv|webm|mov)$/i.test(filename || "") &&
              /^[A-Za-z0-9+/=\r\n\s]+$/.test(contentStr) &&
              contentStr.replace(/[\r\n\s]/g, "").length % 4 === 0)
          ) {
            fileBuffer = Buffer.from(contentStr.replace(/[\r\n\s]/g, ""), "base64");
          } else {
            fileBuffer = Buffer.from(json.content, "utf-8");
          }
        } else if (Buffer.isBuffer(json.content)) {
          fileBuffer = json.content;
        }
      }
    } else {
      const rawBody = await ctx.readRequestBodyBuffer();
      const cdHeader = req.headers["content-disposition"] || "";
      const cdMatch = cdHeader.match(/filename=(?:"([^"]+)"|([^;\s\r\n]+))/i);
      const rawFilename =
        (req.headers["x-filename"] as string) ||
        (query.filename as string) ||
        (cdMatch ? cdMatch[1] || cdMatch[2] : undefined);

      if (rawFilename) {
        filename = rawFilename;
        fileBuffer = rawBody;
      }
    }

    if (!filename || fileBuffer === undefined) {
      ctx.sendJson(400, { error: "No file content or filename provided" });
      return true;
    }

    if (filename.includes("\0")) {
      ctx.sendJson(400, { error: "Invalid filename" });
      return true;
    }

    const splitParts = filename.split(/[/\\]/);
    const base = splitParts[splitParts.length - 1].trim();
    const safeFilename = path.basename(base).replace(/[/\\?%*:|"<>]/g, "_").trim();

    if (!safeFilename || safeFilename === "." || safeFilename === ".." || safeFilename.length === 0) {
      ctx.sendJson(400, { error: "Invalid filename" });
      return true;
    }

    const ext = path.extname(safeFilename).toLowerCase();
    if (ext === ".doc") {
      ctx.sendJson(400, {
        error: "Legacy pre-2007 Word (.doc) files are not supported. Please convert to .docx or .pdf before uploading.",
      });
      return true;
    }

    if (!ALLOWED_UPLOAD_EXTS.includes(ext)) {
      ctx.sendJson(400, {
        error: `Unsupported file type "${ext}". Supported document, media, and subtitle extensions: ${ALLOWED_UPLOAD_EXTS.join(", ")}.`,
      });
      return true;
    }

    if (
      fileBuffer.length >= 4 &&
      fileBuffer[0] === 0xd0 &&
      fileBuffer[1] === 0xcf &&
      fileBuffer[2] === 0x11 &&
      fileBuffer[3] === 0xe0
    ) {
      ctx.sendJson(400, {
        error: "Legacy binary Word (.doc) format detected via file signature. Please convert to .docx or .pdf before uploading.",
      });
      return true;
    }

    fs.mkdirSync(localFilesDir, { recursive: true });
    const resolvedDir = path.resolve(localFilesDir);
    const dirWithSep = resolvedDir.endsWith(path.sep) ? resolvedDir : `${resolvedDir}${path.sep}`;
    const checkInsideDir = (candidate: string) => {
      const rel = path.relative(resolvedDir, candidate);
      return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel) && candidate.startsWith(dirWithSep);
    };

    let storedFilename = safeFilename;
    let targetFilePath = path.resolve(resolvedDir, storedFilename);
    if (!checkInsideDir(targetFilePath)) {
      ctx.sendJson(400, { error: "Path traversal detected" });
      return true;
    }

    if (fs.existsSync(targetFilePath)) {
      const cryptoMod = await import("node:crypto");
      const newHash = cryptoMod.createHash("sha256").update(fileBuffer).digest("hex");
      const existingHash = cryptoMod.createHash("sha256").update(fs.readFileSync(targetFilePath)).digest("hex");
      if (existingHash !== newHash) {
        const parsedExt = path.extname(safeFilename);
        const stem = parsedExt ? safeFilename.slice(0, -parsedExt.length) : safeFilename;
        storedFilename = `${stem}-${newHash.slice(0, 8)}${parsedExt}`;
        targetFilePath = path.resolve(resolvedDir, storedFilename);
        if (!checkInsideDir(targetFilePath)) {
          ctx.sendJson(400, { error: "Path traversal detected" });
          return true;
        }
      }
    }

    fs.writeFileSync(targetFilePath, fileBuffer);

    ctx.sendJson(200, {
      path: targetFilePath,
      filename: storedFilename,
      size: fileBuffer.length,
    });
    return true;
  }

  // 6b. Discovered Documents Catalog for a Source: GET /api/sources/:id/documents
  const sourceDocsMatch = pathname.match(/^\/api\/sources\/([^/]+)\/documents$/);
  if (sourceDocsMatch && method === "GET") {
    const sourceId = ctx.decodeRouteParam(sourceDocsMatch[1]);
    const search = query.search as string | undefined;
    if (!options.documentRepo) {
      ctx.sendJson(200, { documents: [], total: 0 });
      return true;
    }
    const docs = options.documentRepo.listBySourceId(sourceId, { search });
    const allSourceCards = options.cardRepo.list({ sourceId });
    const enrichedDocs = enrichDocumentsWithCardCount(docs, allSourceCards);
    ctx.sendJson(200, { documents: enrichedDocs, total: enrichedDocs.length });
    return true;
  }

  // 6b-bis. Per-Source Sync Status & Item Breakdown: GET /api/sources/:id/sync-status
  const sourceSyncStatusMatch = pathname.match(/^\/api\/sources\/([^/]+)\/sync-status$/);
  if (sourceSyncStatusMatch && method === "GET") {
    const sourceId = ctx.decodeRouteParam(sourceSyncStatusMatch[1]);
    const source = options.sourceRepo.getById(sourceId);
    if (!source) {
      ctx.sendJson(404, { error: `Source "${sourceId}" not found` });
      return true;
    }
    ctx.sendJson(200, buildSourceSyncStatus(source, options.documentRepo, options.syncRepo));
    return true;
  }

  // 6c. All Discovered Documents Catalog: GET /api/documents
  if (pathname === "/api/documents" && method === "GET") {
    const search = query.search as string | undefined;
    const sourceId = query.sourceId as string | undefined;
    if (!options.documentRepo) {
      ctx.sendJson(200, { documents: [], total: 0 });
      return true;
    }
    const docs = sourceId
      ? options.documentRepo.listBySourceId(sourceId, { search })
      : options.documentRepo.listAll({ search });
    const allCards = options.cardRepo.list(sourceId ? { sourceId } : undefined);
    const enrichedDocs = enrichDocumentsWithCardCount(docs, allCards);
    ctx.sendJson(200, { documents: enrichedDocs, total: enrichedDocs.length });
    return true;
  }

  // 6d. Bulk Discovered Documents Delete: POST /api/documents/bulk-delete
  if (pathname === "/api/documents/bulk-delete" && (method === "POST" || method === "DELETE")) {
    if (!options.documentRepo) {
      ctx.sendJson(200, { success: true, deletedCount: 0 });
      return true;
    }
    const body = await ctx.parseBody();
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    const deletedCount = options.documentRepo.deleteMany(ids);
    ctx.sendJson(200, { success: true, deletedCount });
    return true;
  }

  // 6d. Discovered Documents Knowledge Base Export: POST or GET /api/documents/export
  if (pathname === "/api/documents/export" && (method === "POST" || method === "GET")) {
    if (!options.documentRepo) {
      ctx.sendJson(400, { error: "Document repository is not configured on this server." });
      return true;
    }

    let body: any = {};
    let sourceId: string | undefined;
    let ids: string[] | undefined;
    let format = "markdown";
    let mode = "merged";
    let includeTableOfContents = true;
    let includeCitations = true;
    let imageQuality: "compact" | "standard" | "high" = "compact";
    let grayscale = false;
    let coverImage: string | undefined;

    if (method === "POST") {
      body = await ctx.parseBody();
      sourceId = body?.sourceId;
      ids = Array.isArray(body?.ids) ? body.ids : undefined;
      if (body?.format) format = body.format;
      if (body?.mode) mode = body.mode;
      if (body?.includeTableOfContents !== undefined) includeTableOfContents = body.includeTableOfContents;
      if (body?.includeCitations !== undefined) includeCitations = body.includeCitations;
      if (body?.imageQuality) imageQuality = body.imageQuality;
      if (body?.grayscale !== undefined) grayscale = Boolean(body.grayscale);
      if (body?.coverImage) coverImage = body.coverImage;
    } else {
      sourceId = (query.sourceId as string) || (query.source as string) || undefined;
      if (query.ids) {
        ids = typeof query.ids === "string" ? query.ids.split(",") : Array.isArray(query.ids) ? query.ids : undefined;
      }
      if (query.format) format = query.format as string;
      if (query.mode) mode = query.mode as string;
      if (query.toc !== undefined) includeTableOfContents = query.toc !== "false" && query.toc !== "0";
      if (query.citations !== undefined) includeCitations = query.citations !== "false" && query.citations !== "0";
      if (query.quality || query.imageQuality) imageQuality = (query.quality || query.imageQuality) as any;
      if (query.grayscale !== undefined) grayscale = query.grayscale === "true" || query.grayscale === "1";
      if (query.coverImage) coverImage = query.coverImage as string;
    }

    if (format === "epub") {
      mode = "merged";
    }

    let targetDocs: DiscoveredDocument[] = [];
    let sourceName = "Knowledge Base";

    if (Array.isArray(ids) && ids.length > 0) {
      targetDocs = options.documentRepo.getByIds(ids);
      if (sourceId) {
        const src = options.sourceRepo.getById(sourceId);
        if (src) sourceName = src.name;
      } else if (targetDocs.length > 0 && targetDocs[0].sourceId) {
        const src = options.sourceRepo.getById(targetDocs[0].sourceId);
        if (src) sourceName = src.name;
      }
    } else if (sourceId && typeof sourceId === "string") {
      targetDocs = options.documentRepo.listBySourceId(sourceId);
      const src = options.sourceRepo.getById(sourceId);
      if (src) sourceName = src.name;
    } else {
      targetDocs = options.documentRepo.listAll();
    }

    if (targetDocs.length === 0) {
      const msg = sourceId
        ? `No documents found to export for source "${sourceName}". Please sync the data source first to ingest articles.`
        : "No documents found to export in the knowledge base.";
      ctx.sendJson(404, { error: msg });
      return true;
    }

    if (jobManager && (method === "POST" ? body?.async === true || query.async === "true" : query.async === "true")) {
      const job = await jobManager.enqueueJob(
        "export",
        `Export ${targetDocs.length} document(s) (${format.toUpperCase()})`,
        { format, documentCount: targetDocs.length, sourceName, mode },
        async (_j, jobCtx) => {
          return await workerExecutor.executeTask(
            {
              type: "export",
              payload: {
                exportKind: "documents",
                format,
                mode: mode as any,
                sourceName,
                documents: targetDocs,
                mediaDir,
                coverImage,
              },
            },
            jobCtx
          );
        },
        1
      );
      ctx.sendJson(202, {
        success: true,
        jobId: job.id,
        status: job.status,
        title: job.title,
      });
      return true;
    }

    const docExporter = new DocumentExportService(mediaService);
    const exportResult = await docExporter.export(targetDocs, {
      format: format as any,
      mode: mode as any,
      sourceName,
      includeTableOfContents: includeTableOfContents !== false,
      includeCitations: includeCitations !== false,
      imageQuality,
      grayscale,
      coverImage,
    });

    const contentBuffer = Buffer.isBuffer(exportResult.content)
      ? exportResult.content
      : Buffer.from(exportResult.content as string, "utf-8");

    res.writeHead(200, {
      "Content-Type": exportResult.mimeType,
      "Content-Disposition": `attachment; filename="${exportResult.filename}"`,
      "Content-Length": contentBuffer.length,
      ...ctx.buildCorsHeaders(),
    });
    res.end(contentBuffer);
    return true;
  }

  // 6e. Single Discovered Document: GET /api/documents/:id & DELETE /api/documents/:id
  if (
    pathname.startsWith("/api/documents/") &&
    pathname !== "/api/documents/export" &&
    pathname !== "/api/documents/bulk-delete"
  ) {
    const docId = ctx.decodeRouteParam(pathname.slice("/api/documents/".length));
    if (!options.documentRepo) {
      ctx.sendJson(404, { error: "Document not found" });
      return true;
    }

    if (method === "GET") {
      const doc = options.documentRepo.getById(docId);
      if (!doc) {
        ctx.sendJson(404, { error: `Document with ID ${docId} not found` });
        return true;
      }
      ctx.sendJson(200, { document: doc });
      return true;
    }

    if (method === "DELETE") {
      const deleted = options.documentRepo.deleteById(docId);
      ctx.sendJson(deleted ? 200 : 404, { success: deleted });
      return true;
    }
  }

  // 6c. Sources Tags Endpoint: GET /api/sources/tags
  if (pathname === "/api/sources/tags" && method === "GET") {
    const tags = (options.sourceRepo as any).listAllTags ? (options.sourceRepo as any).listAllTags() : [];
    ctx.sendJson(200, tags);
    return true;
  }

  // 6d. Lightweight YouTube Metadata & Duplicate Resolution Endpoint: POST /api/sources/youtube/resolve
  if (pathname === "/api/sources/youtube/resolve" && method === "POST") {
    let body: any;
    try {
      body = await ctx.parseBody();
    } catch {
      ctx.sendJson(400, { error: "Invalid JSON body" });
      return true;
    }
    if (!Array.isArray(body?.urls)) {
      ctx.sendJson(400, { error: "urls array is required" });
      return true;
    }
    if (body.urls.length > 50) {
      ctx.sendJson(400, { error: "Maximum 50 URLs can be resolved per request" });
      return true;
    }
    if (body.urls.some((u: unknown) => typeof u !== "string")) {
      ctx.sendJson(400, { error: "All entries in urls must be strings" });
      return true;
    }
    if (
      body.existingUrls !== undefined &&
      (!Array.isArray(body.existingUrls) || body.existingUrls.some((u: unknown) => typeof u !== "string"))
    ) {
      ctx.sendJson(400, { error: "existingUrls must be an array of strings" });
      return true;
    }
    const urls = body.urls.map((u: string) => u.trim()).filter(Boolean);
    const existingUrls = Array.isArray(body.existingUrls)
      ? body.existingUrls.map((u: string) => u.trim()).filter(Boolean)
      : undefined;

    let ytStrategy: YouTubeIngestionStrategy | undefined;
    if (options.strategyRegistry?.hasStrategy("youtube")) {
      const registered = options.strategyRegistry.getStrategy("youtube");
      if (registered && typeof (registered as any).resolveUrls === "function") {
        ytStrategy = registered as YouTubeIngestionStrategy;
      }
    }
    if (!ytStrategy) {
      ytStrategy = new YouTubeIngestionStrategy({ settingsService });
    }

    const abortController = new AbortController();
    const requestTimeout = setTimeout(() => abortController.abort(), 15_000);
    const handleClose = () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    };
    res.on("close", handleClose);

    try {
      const items = await ytStrategy.resolveUrls(urls, {
        existingUrls,
        signal: abortController.signal,
      });
      if (!res.writableEnded) {
        ctx.sendJson(200, { items });
      }
    } catch (err: any) {
      if (!res.writableEnded) {
        ctx.sendJson(500, { error: err.message || "Failed to resolve YouTube metadata" });
      }
    } finally {
      clearTimeout(requestTimeout);
      res.off("close", handleClose);
    }
    return true;
  }

  // 7. Single Source Update (PATCH) / Delete (DELETE): /api/sources/:id
  if (
    pathname.startsWith("/api/sources/") &&
    pathname !== "/api/sources/upload" &&
    pathname !== "/api/sources/tags" &&
    pathname !== "/api/sources/youtube/resolve"
  ) {
    const id = ctx.decodeRouteParam(pathname.slice("/api/sources/".length));

    if (method === "DELETE") {
      try {
        const deleted = options.sourceRepo.delete(id);
        ctx.sendJson(deleted ? 200 : 404, { success: deleted });
      } catch (err: any) {
        ctx.sendJson(typeof err?.statusCode === "number" ? err.statusCode : 500, { error: err.message || "Failed to delete source" });
      }
      return true;
    }

    if (method === "PATCH" || method === "PUT") {
      try {
        const body = await ctx.parseBody();
        const updated = options.sourceRepo.update(id, body);
        ctx.sendJson(updated ? 200 : 404, updated || { error: "Source not found" });
      } catch (err: any) {
        ctx.sendJson(typeof err?.statusCode === "number" ? err.statusCode : 500, { error: err.message || "Failed to update source" });
      }
      return true;
    }
  }

  return false;
}
