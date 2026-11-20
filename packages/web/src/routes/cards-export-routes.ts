import type { CardFilter } from "@flashcard-master/core";
import { EpubFlashcardExporter } from "@flashcard-master/adapters";
import type { ExportFormat } from "../server.js";
import type { RouteContext } from "./route-context.js";

/**
 * Handles `/api/cards*`, `/api/decks*`, `/api/tags`, `/api/ankiconnect/*`, and `/api/export*` routes.
 */
export async function handleCardsAndExportRoutes(ctx: RouteContext): Promise<boolean> {
  const { res, pathname, method, query, options, settingsService, mediaService, ankiConnectAdapter } = ctx;

  // 8. Canonical Bulk Card Delete Endpoint: POST /api/cards/bulk-delete
  if (pathname === "/api/cards/bulk-delete" && (method === "POST" || method === "DELETE")) {
    const body = await ctx.parseBody();
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const deletedCount = options.cardRepo.deleteMany(ids);
    ctx.sendJson(200, { success: true, deletedCount });
    return true;
  }

  // 8b. Single Card Update (PATCH) / Delete (DELETE) / Get (GET): /api/cards/:id
  const singleCardMatch = pathname.match(/^\/api\/cards\/([^/]+)$/);
  if (singleCardMatch) {
    const id = ctx.decodeRouteParam(singleCardMatch[1]);

    if (method === "GET") {
      const card = options.cardRepo.getById(id);
      ctx.sendJson(card ? 200 : 404, card || { error: "Card not found" });
      return true;
    }

    if (method === "DELETE") {
      const deleted = options.cardRepo.delete(id);
      ctx.sendJson(deleted ? 200 : 404, { success: deleted });
      return true;
    }

    if (method === "PATCH" || method === "PUT") {
      const body = await ctx.parseBody();
      const updated = options.cardRepo.update(id, body);
      ctx.sendJson(updated ? 200 : 404, updated || { error: "Card not found" });
      return true;
    }
  }

  // 9. Cards List Endpoint: /api/cards
  if (pathname === "/api/cards" && method === "GET") {
    const filter: CardFilter = {
      targetDeck: (query.deck || query.targetDeck) as string,
      tag: query.tag as string,
      difficulty: query.difficulty as any,
      sourceId: query.sourceId as string,
      search: (query.search || query.q) as string,
      createdAfter: (query.createdAfter || query.after) as string | undefined,
      createdBefore: (query.createdBefore || query.before) as string | undefined,
      shuffle: query.shuffle === "true" || query.shuffle === "1",
    };

    if (query.limit !== undefined || query.offset !== undefined || query.cursor !== undefined) {
      const limit = query.limit !== undefined ? Math.max(1, parseInt(query.limit as string, 10) || 25) : 25;
      const cursor = query.cursor ? String(query.cursor) : undefined;
      const offset = query.offset !== undefined ? Math.max(0, parseInt(query.offset as string, 10) || 0) : undefined;
      try {
        const paginated = options.cardRepo.listPaginated({ ...filter, limit, cursor, offset });
        ctx.sendJson(200, paginated);
      } catch (err: any) {
        if (err.message && err.message.includes("Invalid pagination cursor")) {
          ctx.sendJson(400, { error: err.message });
          return true;
        }
        throw err;
      }
      return true;
    }

    const cards = options.cardRepo.list(filter);
    ctx.sendJson(200, cards);
    return true;
  }

  // 10. Decks Endpoint
  if (pathname === "/api/decks" && method === "GET") {
    ctx.sendJson(200, options.cardRepo.listDecks());
    return true;
  }

  // 10a. Clone Deck Endpoint: POST /api/decks/clone
  if (pathname === "/api/decks/clone" && method === "POST") {
    const body = await ctx.parseBody();
    const sourceDeck = typeof body?.sourceDeck === "string" ? body.sourceDeck.trim() : "";
    const targetDeck = typeof body?.targetDeck === "string" ? body.targetDeck.trim() : "";

    if (!sourceDeck) {
      ctx.sendJson(400, { error: "Source deck name is required." });
      return true;
    }
    if (!targetDeck) {
      ctx.sendJson(400, { error: "Target deck name is required." });
      return true;
    }
    if (sourceDeck.toLowerCase() === targetDeck.toLowerCase()) {
      ctx.sendJson(400, { error: "Target deck name must be different from source deck name." });
      return true;
    }

    try {
      const clonedCount = options.cardRepo.cloneDeck(sourceDeck, targetDeck);
      ctx.sendJson(200, { success: true, clonedCount, sourceDeck, targetDeck });
    } catch (err: any) {
      ctx.sendJson(400, { error: err.message || "Failed to clone deck." });
    }
    return true;
  }

  // 10b. Split Deck Endpoint: POST /api/decks/split
  if (pathname === "/api/decks/split" && method === "POST") {
    const body = await ctx.parseBody();
    const sourceDeck = typeof body?.sourceDeck === "string" ? body.sourceDeck.trim() : "";
    const batchSize = parseInt(body?.batchSize, 10);
    const customPrefix = typeof body?.customPrefix === "string" ? body.customPrefix.trim() : undefined;

    if (!sourceDeck) {
      ctx.sendJson(400, { error: "Source deck name is required." });
      return true;
    }
    if (!Number.isInteger(batchSize) || batchSize < 2) {
      ctx.sendJson(400, { error: "Batch size must be an integer of 2 or greater." });
      return true;
    }

    try {
      const result = options.cardRepo.splitDeck(sourceDeck, batchSize, customPrefix);
      ctx.sendJson(200, { success: true, ...result, sourceDeck });
    } catch (err: any) {
      ctx.sendJson(400, { error: err.message || "Failed to split deck." });
    }
    return true;
  }

  // 10c. Move Cards Endpoint: POST /api/decks/move-cards
  if (pathname === "/api/decks/move-cards" && method === "POST") {
    const body = await ctx.parseBody();
    const targetDeck = typeof body?.targetDeck === "string" ? body.targetDeck.trim() : "";
    const cardIds = Array.isArray(body?.cardIds) ? body.cardIds : [];

    if (!targetDeck) {
      ctx.sendJson(400, { error: "Target deck name is required." });
      return true;
    }
    if (cardIds.length === 0) {
      ctx.sendJson(400, { error: "At least one card ID is required to move." });
      return true;
    }

    try {
      const movedCount = options.cardRepo.moveCards(cardIds, targetDeck);
      ctx.sendJson(200, { success: true, movedCount, targetDeck });
    } catch (err: any) {
      ctx.sendJson(400, { error: err.message || "Failed to move cards." });
    }
    return true;
  }

  // 11. Tags Endpoint
  if (pathname === "/api/tags" && method === "GET") {
    const tags = options.cardRepo.listTags ? options.cardRepo.listTags() : [];
    ctx.sendJson(200, tags);
    return true;
  }

  // 12. AnkiConnect Status Endpoint: GET /api/ankiconnect/status
  if (pathname === "/api/ankiconnect/status" && method === "GET") {
    const health = await ankiConnectAdapter.checkHealth();
    ctx.sendJson(200, health);
    return true;
  }

  // 13. AnkiConnect Sync Endpoint: POST /api/ankiconnect/sync
  if (pathname === "/api/ankiconnect/sync" && method === "POST") {
    const body = await ctx.parseBody();
    const filter: CardFilter = {
      targetDeck: body.targetDeck || undefined,
      tag: body.tag || undefined,
      createdAfter: (body.createdAfter || body.after) as string | undefined,
      createdBefore: (body.createdBefore || body.before) as string | undefined,
      limit: typeof body.limit === "number" ? body.limit : body.limit ? parseInt(body.limit, 10) : undefined,
      shuffle: typeof body.shuffle === "boolean" ? body.shuffle : body.shuffle === "true" || body.shuffle === 1,
    };
    const cards = options.cardRepo.list(filter);
    const syncRes = await ankiConnectAdapter.syncCards(cards, {
      targetDeck: body.targetDeck,
    });
    ctx.sendJson(200, syncRes);
    return true;
  }

  // 14. Export File Download Endpoint: GET /api/export or GET /api/export/:format
  if ((pathname === "/api/export" || pathname.startsWith("/api/export/")) && method === "GET") {
    const subFormat = pathname.startsWith("/api/export/") ? pathname.slice("/api/export/".length) : undefined;
    const format = (subFormat as ExportFormat) || (query.format as ExportFormat) || "csv";
    const filter: CardFilter = {
      targetDeck: query.deck as string,
      tag: query.tag as string,
      difficulty: query.difficulty as any,
      search: query.search as string,
      createdAfter: (query.createdAfter || query.after) as string | undefined,
      createdBefore: (query.createdBefore || query.before) as string | undefined,
      limit: query.limit ? parseInt(query.limit as string, 10) : undefined,
      shuffle: query.shuffle === "true" || query.shuffle === "1",
    };

    const cards = options.cardRepo.list(filter);

    if (
      cards.length === 0 &&
      (filter.createdAfter || filter.createdBefore || filter.targetDeck || filter.tag || filter.search)
    ) {
      ctx.sendJson(404, { error: "No cards match the specified filter criteria" });
      return true;
    }

    if (options.exportService) {
      const author = settingsService?.get("epub_default_author") || undefined;
      const publisher = settingsService?.get("epub_default_publisher") || undefined;
      const result = await options.exportService.export({
        format,
        filter,
        options: {
          author,
          publisher,
          targetDeck: query.deck as string,
        },
      });

      const deckName = query.deck ? String(query.deck).trim() : undefined;
      const defaultName = deckName
        ? `${deckName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "deck"}-flashcards`
        : "all-decks-flashcards";
      const filename =
        format === "epub"
          ? `${defaultName}.epub`
          : `flashcards.${format === "markdown" ? "md" : format === "pdf" ? "html" : format}`;

      let contentType = "text/plain";
      if (format === "apkg") contentType = "application/octet-stream";
      else if (format === "csv") contentType = "text/csv; charset=utf-8";
      else if (format === "tsv") contentType = "text/tab-separated-values; charset=utf-8";
      else if (format === "markdown") contentType = "text/markdown; charset=utf-8";
      else if (format === "html" || format === "pdf") contentType = "text/html; charset=utf-8";
      else if (format === "epub") contentType = "application/epub+zip";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...ctx.buildCorsHeaders(),
      });
      res.end(result.data || "");
      return true;
    } else if (format === "epub") {
      const exporter = new EpubFlashcardExporter(settingsService, mediaService);
      const author = settingsService?.get("epub_default_author") || undefined;
      const publisher = settingsService?.get("epub_default_publisher") || undefined;
      const result = await exporter.export(cards, {
        targetDeck: query.deck as string,
        author,
        publisher,
      });
      const deckName = query.deck ? String(query.deck).trim() : undefined;
      const defaultName = deckName
        ? `${deckName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "deck"}-flashcards`
        : "all-decks-flashcards";

      res.writeHead(200, {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${defaultName}.epub"`,
        ...ctx.buildCorsHeaders(),
      });
      res.end(result.data || "");
      return true;
    } else {
      const csvContent =
        "Question,Answer\n" +
        cards.map((c) => `"${c.question.replace(/"/g, '""')}","${c.answer.replace(/"/g, '""')}"`).join("\n");
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="flashcards.csv"',
        ...ctx.buildCorsHeaders(),
      });
      res.end(csvContent);
      return true;
    }
  }

  return false;
}
