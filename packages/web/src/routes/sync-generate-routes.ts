import path from "node:path";
import {
  buildKnownItemKeysForSource,
  CardGenerationService,
  createKnownItemMatcher,
  extractYouTubeVideoId,
  normalizeHttpUrlKey,
  normalizeLocalFilePathKey,
  parseMediaSourceItems,
  splitUriTokensPure,
  stripUrlFragment,
  SyncModeSchema,
  type CardDepthMode,
  type DataSource,
  type DifficultyLevel,
  type DocumentRepository,
  type DocumentSlicingOptions,
  type PersonaType,
  type SyncMode,
  type SyncStateRepository,
} from "@flashcard-master/core";
import { createLLMAdapter } from "@flashcard-master/adapters";
import type { RouteContext } from "./route-context.js";

export function parseSyncRequestOptions(
  body: any,
  query: Record<string, any>
): { slicing?: DocumentSlicingOptions; syncMode: SyncMode } {
  let rawSlicing: unknown = body?.slicing;
  if (rawSlicing === undefined && typeof query?.slicing === "string" && query.slicing.trim() !== "") {
    rawSlicing = query.slicing;
  }
  let slicing: DocumentSlicingOptions | undefined;
  if (typeof rawSlicing === "string") {
    const trimmed = rawSlicing.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          const err = new Error("Invalid slicing configuration: expected object");
          (err as any).statusCode = 400;
          throw err;
        }
        slicing = parsed as DocumentSlicingOptions;
      } catch (err: any) {
        if (err?.statusCode === 400) throw err;
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          const badJson = new Error("Invalid JSON in slicing configuration") as Error & { statusCode?: number };
          badJson.statusCode = 400;
          throw badJson;
        }
        if (!["outline", "budget", "timestamps", "chapters", "none"].includes(trimmed)) {
          const badMode = new Error(`Invalid slicing mode "${trimmed}"`) as Error & { statusCode?: number };
          badMode.statusCode = 400;
          throw badMode;
        }
        slicing = { mode: trimmed as any };
      }
    }
  } else if (rawSlicing !== undefined) {
    if (typeof rawSlicing !== "object" || rawSlicing === null || Array.isArray(rawSlicing)) {
      const err = new Error("Invalid slicing configuration: expected object");
      (err as any).statusCode = 400;
      throw err;
    }
    slicing = rawSlicing as DocumentSlicingOptions;
  }

  const rawSyncMode = body?.syncMode !== undefined ? body.syncMode : query?.syncMode;
  let syncMode: SyncMode = "new-only";
  if (rawSyncMode !== undefined) {
    const parsed = SyncModeSchema.safeParse(rawSyncMode);
    if (!parsed.success) {
      const err = new Error(`Invalid syncMode "${String(rawSyncMode)}". Expected "new-only" or "full".`);
      (err as any).statusCode = 400;
      throw err;
    }
    syncMode = parsed.data;
  }

  return { slicing, syncMode };
}

export function buildSourceSyncStatus(
  source: DataSource,
  documentRepo?: DocumentRepository,
  syncRepo?: SyncStateRepository
) {
  const docs = documentRepo ? documentRepo.listBySourceId(source.id) : [];
  const syncState = syncRepo ? syncRepo.get(source.id) : undefined;
  const knownKeysSet = buildKnownItemKeysForSource(source, docs);
  const matcher = createKnownItemMatcher(source.type, knownKeysSet);

  const items: Array<{ key: string; uri: string; label: string; status: "synced" | "new" }> = [];

  if (source.type === "web") {
    for (const uri of splitUriTokensPure(source.uri, true)) {
      items.push({
        key: normalizeHttpUrlKey(uri) || uri,
        uri,
        label: uri,
        status: matcher.hasHttpUrl(uri) ? "synced" : "new",
      });
    }
  } else if (source.type === "audio" || source.type === "video" || source.type === "youtube") {
    for (const mediaItem of parseMediaSourceItems(source.uri)) {
      const isYt = source.type === "youtube";
      const isHttp = /^https?:\/\//i.test(mediaItem.uri);
      const synced = isYt
        ? matcher.hasYouTubeUri(mediaItem.uri)
        : isHttp
          ? matcher.hasHttpUrl(mediaItem.uri)
          : matcher.hasLocalDirectory(mediaItem.uri);
      const key = isYt
        ? extractYouTubeVideoId(mediaItem.uri) || normalizeHttpUrlKey(mediaItem.uri) || mediaItem.uri
        : isHttp
          ? normalizeHttpUrlKey(mediaItem.uri) || mediaItem.uri
          : normalizeLocalFilePathKey(mediaItem.uri) || mediaItem.uri;
      const label =
        mediaItem.title?.trim() ||
        (isYt || isHttp ? mediaItem.uri : path.basename(mediaItem.uri) || mediaItem.uri);
      items.push({
        key,
        uri: mediaItem.uri,
        label,
        status: synced ? "synced" : "new",
      });
    }
  } else if (source.type === "local") {
    for (const entry of splitUriTokensPure(source.uri)) {
      const normEntry = normalizeLocalFilePathKey(entry) || entry;
      const synced = matcher.hasLocalDirectory(entry);
      items.push({
        key: normEntry,
        uri: entry,
        label: path.basename(entry) || entry,
        status: synced ? "synced" : "new",
      });
    }
  } else if (source.type === "notion") {
    for (const entry of splitUriTokensPure(source.uri)) {
      const key = normalizeHttpUrlKey(entry) || entry;
      items.push({
        key,
        uri: entry,
        label: entry,
        status: matcher.hasNotionPage(entry, entry) || docs.length > 0 ? "synced" : "new",
      });
    }
  } else {
    for (const entry of splitUriTokensPure(source.uri)) {
      const key = normalizeHttpUrlKey(entry) || entry;
      items.push({
        key,
        uri: entry,
        label: entry,
        status: matcher.hasHttpUrl(entry) || docs.length > 0 ? "synced" : "new",
      });
    }
  }

  const syncedGroupMap = new Map<string, { key: string; uri: string; label: string; sliceCount: number }>();
  for (const doc of docs) {
    const rawUrl = (doc.url || "").trim();
    const baseUri = stripUrlFragment(rawUrl) || doc.title || doc.id;
    const groupKey = rawUrl
      ? source.type === "youtube"
        ? extractYouTubeVideoId(baseUri) || normalizeHttpUrlKey(baseUri) || baseUri
        : source.type === "local" || source.type === "audio" || source.type === "video"
          ? /^https?:\/\//i.test(baseUri)
            ? normalizeHttpUrlKey(baseUri)
            : normalizeLocalFilePathKey(baseUri) || baseUri
          : normalizeHttpUrlKey(baseUri) || baseUri
      : (doc.title || doc.id).replace(/\s+\((?:Part|Slice|Pages|Chunk)[^)]*\)$/i, "").trim();
    const cleanTitle = (doc.title || baseUri)
      .replace(/\s+\((?:Part|Slice|Pages|Chunk)[^)]*\)$/i, "")
      .replace(/\s+\[(?:Part\s+[^\]]+|\d{1,2}:\d{2}[^\]]*)\]$/i, "")
      .trim();
    const existing = syncedGroupMap.get(groupKey);
    if (existing) {
      existing.sliceCount += 1;
    } else {
      syncedGroupMap.set(groupKey, {
        key: groupKey,
        uri: baseUri,
        label: cleanTitle || baseUri,
        sliceCount: 1,
      });
    }
  }

  return {
    sourceId: source.id,
    sourceType: source.type,
    syncedDocumentCount: docs.length,
    hasSyncedDocuments: docs.length > 0,
    lastSyncedAt:
      (syncState?.lastSyncedAt as unknown) instanceof Date
        ? (syncState!.lastSyncedAt as unknown as Date).toISOString()
        : syncState?.lastSyncedAt || null,
    knownKeys: Array.from(knownKeysSet),
    items,
    syncedItems: Array.from(syncedGroupMap.values()),
  };
}

/**
 * Handles `/api/sync/:id`, `/api/sync`, and `/api/generate` routes.
 */
export async function handleSyncAndGenerateRoutes(ctx: RouteContext): Promise<boolean> {
  const { pathname, method, query, options, jobManager, workerExecutor, settingsService, mediaDir, localFilesDir } = ctx;

  // 4. Single Source Sync Endpoint: POST /api/sync/:id
  const syncSourceMatch = pathname.match(/^\/api\/sync\/([^/]+)$/);
  if (syncSourceMatch && method === "POST") {
    const sourceId = ctx.decodeRouteParam(syncSourceMatch[1]);
    const source = options.sourceRepo.getById(sourceId);
    if (!source) {
      ctx.sendJson(404, { error: `Source "${sourceId}" not found` });
      return true;
    }

    const body = await ctx.parseJsonBodyStrict();
    const { slicing, syncMode } = parseSyncRequestOptions(body, query);

    if (jobManager && query.sync !== "true") {
      const job = await jobManager.enqueueJob(
        "sync_source",
        `Sync source: ${source.name}`,
        { sourceId, sourceName: source.name, slicing, syncMode },
        async (_j, jobCtx) => {
          const explicitTimeout =
            typeof (slicing as any)?.timeoutMs === "number" && (slicing as any).timeoutMs >= 0
              ? (slicing as any).timeoutMs
              : undefined;
          const syncTimeoutMs =
            explicitTimeout !== undefined ? explicitTimeout : options.defaultTaskTimeoutMs ?? 1_800_000;
          return await workerExecutor.executeTask(
            {
              type: "sync_source",
              payload: {
                sources: [source],
                slicing,
                syncMode,
                timeoutMs: syncTimeoutMs,
                mediaDir,
                localFilesDir,
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

    if (options.ingestionService) {
      const syncRes = await options.ingestionService.syncSource(sourceId, { slicing, syncMode });
      ctx.sendJson(syncRes.error && syncRes.totalFetched === 0 ? 404 : 200, syncRes);
    } else {
      ctx.sendJson(200, { sourceId, newCount: 0, totalFetched: 0 });
    }
    return true;
  }

  // 5. Bulk Sync Endpoint: POST /api/sync
  if (pathname === "/api/sync" && method === "POST") {
    const activeSources = options.sourceRepo.list().filter((s) => s.isActive);
    const body = await ctx.parseJsonBodyStrict();
    const { slicing, syncMode } = parseSyncRequestOptions(body, query);

    if (jobManager && query.sync !== "true") {
      const job = await jobManager.enqueueJob(
        "sync_all",
        `Sync all sources (${activeSources.length} active)`,
        { sourceCount: activeSources.length, slicing, syncMode },
        async (_j, jobCtx) => {
          const explicitTimeout =
            typeof (slicing as any)?.timeoutMs === "number" && (slicing as any).timeoutMs >= 0
              ? (slicing as any).timeoutMs
              : undefined;
          const syncTimeoutMs =
            explicitTimeout !== undefined
              ? explicitTimeout
              : Math.max(options.defaultTaskTimeoutMs ?? 1_800_000, (activeSources.length || 1) * 10 * 60 * 1000);
          return await workerExecutor.executeTask(
            {
              type: "sync_all",
              payload: {
                sources: activeSources,
                slicing,
                syncMode,
                timeoutMs: syncTimeoutMs,
                mediaDir,
                localFilesDir,
              },
            },
            jobCtx
          );
        },
        activeSources.length || 1
      );
      ctx.sendJson(202, {
        success: true,
        jobId: job.id,
        status: job.status,
        title: job.title,
      });
      return true;
    }

    if (options.ingestionService) {
      const syncResults = await options.ingestionService.syncAllActive({ slicing, syncMode });
      ctx.sendJson(200, syncResults);
    } else {
      ctx.sendJson(200, []);
    }
    return true;
  }

  // 6. Generation Endpoint: POST /api/generate
  if (pathname === "/api/generate" && method === "POST") {
    const body = await ctx.parseBody();
    const provider =
      typeof body.provider === "string" && body.provider.trim().length > 0
        ? body.provider.trim().toLowerCase()
        : "ollama";
    const model = body.model || undefined;

    const rawKey = typeof body.apiKey === "string" && body.apiKey.trim().length > 0 ? body.apiKey.trim() : undefined;
    const apiKey = rawKey || settingsService.getSecret(provider as any) || undefined;

    const rawEndpoint =
      typeof body.endpoint === "string" && body.endpoint.trim().length > 0 ? body.endpoint.trim() : undefined;
    const baseUrl = rawEndpoint || settingsService.getEndpoint(provider as any) || undefined;

    const isLocalOpenAI =
      provider === "openai" &&
      typeof baseUrl === "string" &&
      (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1") || baseUrl.includes("::1"));
    if (["openai", "anthropic", "gemini"].includes(provider) && !apiKey && !isLocalOpenAI) {
      ctx.sendJson(400, {
        error: `No API key configured for ${provider}. Please provide an API key or configure it in Settings.`,
      });
      return true;
    }

    const persona = (body.persona as PersonaType) || "socratic-mentor";
    const difficulty = (body.difficulty as DifficultyLevel) || "intermediate";
    const depthMode = (body.depthMode as CardDepthMode) || "atomic";
    const chunkMultiplier = typeof body.chunkMultiplier === "number" ? body.chunkMultiplier : 1;
    const fullDocument = body.fullDocument === true || chunkMultiplier === 0;
    const targetDeckOverride = body.targetDeck || undefined;
    const limit = typeof body.limit === "number" ? body.limit : 5;
    const enforceGrounding = body.enforceGrounding !== false;

    if (Array.isArray(body.documentIds) && body.documentIds.length === 0) {
      ctx.sendJson(400, { error: "No documents selected for generation." });
      return true;
    }

    if (jobManager && query.sync !== "true") {
      const documents: Array<{
        id: string;
        sourceId: string;
        title: string;
        textContent: string;
        originUrl?: string;
        startPage?: number | null;
        endPage?: number | null;
        startSeconds?: number | null;
        endSeconds?: number | null;
      }> = [];

      if (Array.isArray(body.documentIds)) {
        if (!options.documentRepo) {
          ctx.sendJson(400, { error: "Document repository is unavailable to resolve documentIds." });
          return true;
        }
        if (options.documentRepo) {
          for (const docId of body.documentIds) {
            const doc = options.documentRepo.getById(docId);
            if (doc) {
              documents.push({
                id: doc.id,
                sourceId: doc.sourceId,
                title: doc.title,
                textContent: doc.textContent,
                originUrl: doc.url || undefined,
                startPage: doc.startPage ?? null,
                endPage: doc.endPage ?? null,
                startSeconds: doc.startSeconds ?? null,
                endSeconds: doc.endSeconds ?? null,
              });
            }
          }
          if (documents.length === 0) {
            ctx.sendJson(400, {
              error: "Selected documents were not found (they may have been replaced by a re-sync).",
            });
            return true;
          }
        }
      } else {
        let sources: any[] = [];
        if (Array.isArray(body.sourceIds) && body.sourceIds.length > 0) {
          sources = body.sourceIds.map((id: string) => options.sourceRepo.getById(id)).filter(Boolean);
        } else if (body.sourceId) {
          const s = options.sourceRepo.getById(body.sourceId);
          if (s) sources = [s];
        } else {
          sources = options.sourceRepo.list().filter((s) => s.isActive);
        }

        if (options.documentRepo) {
          for (const s of sources) {
            const docs = options.documentRepo.listBySourceId(s.id);
            for (const doc of docs) {
              documents.push({
                id: doc.id,
                sourceId: doc.sourceId,
                title: doc.title,
                textContent: doc.textContent,
                originUrl: doc.url || undefined,
                startPage: doc.startPage ?? null,
                endPage: doc.endPage ?? null,
                startSeconds: doc.startSeconds ?? null,
                endSeconds: doc.endSeconds ?? null,
              });
            }
          }
        }
      }

      const docCount = documents.length || 1;
      const singleDocTitle = documents.length === 1 ? documents[0].title : undefined;
      const jobTitle = singleDocTitle
        ? `Synthesize flashcards: "${singleDocTitle}"`
        : `Synthesize flashcards (${docCount} doc${docCount === 1 ? "" : "s"})`;

      const job = await jobManager.enqueueJob(
        "generation",
        jobTitle,
        {
          documentCount: documents.length,
          documentIds: documents.map((d) => d.id),
          sourceIds: Array.from(new Set(documents.map((d) => d.sourceId))),
          documentTitle: singleDocTitle,
          provider,
          model,
          persona,
          difficulty,
          targetDeck: targetDeckOverride,
        },
        async (_j, jobCtx) => {
          const explicitTimeout =
            typeof body?.timeoutMs === "number" && body.timeoutMs >= 0 ? body.timeoutMs : undefined;
          const dynamicTimeoutMs =
            explicitTimeout !== undefined
              ? explicitTimeout
              : Math.max(options.defaultTaskTimeoutMs ?? 3_600_000, docCount * 3 * 60 * 1000);
          return await workerExecutor.executeTask(
            {
              type: "generation",
              payload: {
                documents,
                provider,
                model,
                apiKey,
                endpoint: baseUrl,
                persona,
                difficulty,
                depthMode,
                chunkMultiplier,
                fullDocument,
                limit,
                targetDeckOverride,
                enforceGrounding,
                timeoutMs: dynamicTimeoutMs,
              },
            },
            jobCtx
          );
        },
        docCount
      );

      ctx.sendJson(202, {
        success: true,
        jobId: job.id,
        status: job.status,
        title: job.title,
      });
      return true;
    }

    try {
      const createLLMFn = options.createLLMAdapterFn || createLLMAdapter;
      const llm = createLLMFn({
        provider,
        model,
        apiKey,
        baseUrl,
        timeoutMs: typeof body?.timeoutMs === "number" && body.timeoutMs > 0 ? body.timeoutMs : undefined,
      });
      const genService = new CardGenerationService(llm, undefined, options.promptBuilder, options.groundingGuard);

      const createdCards: any[] = [];
      let totalDrafts = 0;
      let totalDuplicates = 0;

      if (Array.isArray(body.documentIds) && body.documentIds.length > 0 && options.documentRepo) {
        let foundDocs = 0;
        for (const docId of body.documentIds) {
          const doc = options.documentRepo.getById(docId);
          if (!doc) continue;
          foundDocs += 1;
          const parentSource = options.sourceRepo.getById(doc.sourceId);
          const cleanDoc = {
            id: doc.id,
            sourceId: doc.sourceId,
            title: doc.title,
            textContent: doc.textContent,
            originUrl: doc.url || undefined,
            contentHash: doc.contentHash || "",
            startPage: doc.startPage ?? null,
            endPage: doc.endPage ?? null,
            startSeconds: doc.startSeconds ?? null,
            endSeconds: doc.endSeconds ?? null,
          };
          const drafts = await genService.generateFromDocument(cleanDoc, {
            difficulty,
            persona,
            depthMode,
            targetCountPerChunk: limit,
            chunkOptions: { chunkMultiplier, fullDocument },
            enforceGrounding,
          });
          totalDrafts += drafts.length;

          const targetDeck = targetDeckOverride || "Default";
          const existingCards = options.cardRepo.list({ targetDeck });
          const dedupResult = options.dedupService
            ? options.dedupService.filterUnique(drafts, existingCards)
            : { unique: drafts, duplicates: [] };

          totalDuplicates += dedupResult.duplicates.length;

          for (const draft of dedupResult.unique as any[]) {
            const card = options.cardRepo.create({
              sourceId: doc.sourceId,
              question: draft.question,
              answer: draft.answer,
              sourceQuote: draft.sourceQuote,
              sourceOriginUrl:
                draft.originUrl ||
                doc.url ||
                (parentSource?.type === "web" ||
                parentSource?.type === "rss" ||
                parentSource?.type === "sitemap" ||
                parentSource?.type === "llms-txt"
                  ? parentSource.uri
                  : null),
              documentTitle: draft.documentTitle || doc.title,
              keywords: draft.keywords || [],
              sourceLocator: draft.sourceLocator || "",
              difficulty: draft.difficulty,
              personaUsed: persona,
              targetDeck,
              tags: parentSource?.tags || [],
            });
            createdCards.push(card);
          }
        }
        if (foundDocs === 0) {
          ctx.sendJson(400, {
            error: "Selected documents were not found (they may have been replaced by a re-sync).",
          });
          return true;
        }
      } else {
        let sources: any[] = [];
        if (Array.isArray(body.sourceIds) && body.sourceIds.length > 0) {
          sources = body.sourceIds.map((id: string) => options.sourceRepo.getById(id)).filter(Boolean);
        } else if (body.sourceId) {
          const s = options.sourceRepo.getById(body.sourceId);
          if (s) sources = [s];
        } else {
          sources = options.sourceRepo.list().filter((s) => s.isActive);
        }

        if (sources.length === 0) {
          ctx.sendJson(400, { error: "No active data sources found to generate cards from." });
          return true;
        }

        for (const s of sources) {
          if (!s) continue;
          const strategy = options.strategyRegistry ? options.strategyRegistry.getStrategy(s.type) : undefined;
          if (!strategy) continue;
          const rawDocs = await strategy.fetch(s);
          for (const raw of rawDocs) {
            const cleanDoc = strategy.extractCleanText(raw);
            const drafts = await genService.generateFromDocument(cleanDoc, {
              difficulty,
              persona,
              targetCountPerChunk: limit,
              enforceGrounding,
            });
            totalDrafts += drafts.length;

            const targetDeck = targetDeckOverride || "Default";
            const existingCards = options.cardRepo.list({ targetDeck });
            const dedupResult = options.dedupService
              ? options.dedupService.filterUnique(drafts, existingCards)
              : { unique: drafts, duplicates: [] };

            totalDuplicates += dedupResult.duplicates.length;

            for (const draft of dedupResult.unique as any[]) {
              const card = options.cardRepo.create({
                sourceId: s.id,
                question: draft.question,
                answer: draft.answer,
                sourceQuote: draft.sourceQuote,
                sourceOriginUrl:
                  draft.originUrl ||
                  (s.type === "web" || s.type === "rss" || s.type === "sitemap" || s.type === "llms-txt"
                    ? s.uri
                    : null),
                documentTitle: draft.documentTitle || s.name,
                keywords: draft.keywords || [],
                sourceLocator: draft.sourceLocator || "",
                difficulty: draft.difficulty,
                personaUsed: persona,
                targetDeck,
                tags: s.tags || [],
              });
              createdCards.push(card);
            }
          }
        }
      }

      ctx.sendJson(200, {
        success: true,
        cardsCreated: createdCards.length,
        totalDraftsGenerated: totalDrafts,
        duplicatesSkipped: totalDuplicates,
        newCards: createdCards,
      });
    } catch (err: any) {
      ctx.sendJson(500, { error: err.message || "Failed to generate cards" });
    }
    return true;
  }

  return false;
}
