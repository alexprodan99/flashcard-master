import { Command } from "commander";
import readline from "node:readline";
import {
  type AppContext,
  createAppContext,
} from "./app.js";
import {
  type DataSourceType,
  type DifficultyLevel,
  type PersonaType,
  type CardDepthMode,
  type SlicingMode,
  type DocumentSlicingOptions,
  CardGenerationService,
} from "@flashcard-master/core";
import { createLLMAdapter, DocumentExportService } from "@flashcard-master/adapters";
import { createWebServer } from "@flashcard-master/web";

export function createCli(providedContext?: AppContext): Command {
  const program = new Command();
  const context = providedContext || createAppContext();

  program
    .name("flashcard-master")
    .description("Multi-source text ingestion and grounded flashcard generator for Anki, Markdown, CSV and PDF")
    .version("1.0.0");

  // ==========================================
  // SERVE COMMAND (LOCAL WEB UI)
  // ==========================================
  program
    .command("serve")
    .description("Launch local Web UI dashboard server")
    .option("-p, --port <port>", "Port to bind local Web UI to", "3000")
    .option("-h, --host <host>", "Host address to bind to", "127.0.0.1")
    .option("--max-generation-workers <number>", "Max concurrent generation workers", "3")
    .option("--max-sync-workers <number>", "Max concurrent sync workers", "2")
    .option("--max-export-workers <number>", "Max concurrent export workers", "2")
    .option("--task-timeout <minutes>", "Default worker task timeout in minutes (0 to disable)", "60")
    .option("--max-worker-heap <mb>", "Max memory heap per worker thread in MB", "512")
    .action(async (options: {
      port: string;
      host: string;
      maxGenerationWorkers?: string;
      maxSyncWorkers?: string;
      maxExportWorkers?: string;
      taskTimeout?: string;
      maxWorkerHeap?: string;
    }) => {
      try {
        const port = parseInt(options.port, 10) || 3000;
        const maxGenerationWorkers = options.maxGenerationWorkers ? Math.max(1, parseInt(options.maxGenerationWorkers, 10) || 1) : 3;
        const maxSyncWorkers = options.maxSyncWorkers ? Math.max(1, parseInt(options.maxSyncWorkers, 10) || 1) : 2;
        const maxExportWorkers = options.maxExportWorkers ? Math.max(1, parseInt(options.maxExportWorkers, 10) || 1) : 2;
        const taskTimeoutMinutes = options.taskTimeout !== undefined ? parseInt(options.taskTimeout, 10) : 60;
        const defaultTaskTimeoutMs = !isNaN(taskTimeoutMinutes) && taskTimeoutMinutes >= 0
          ? taskTimeoutMinutes * 60 * 1000
          : undefined;
        const maxWorkerHeapMb = options.maxWorkerHeap ? parseInt(options.maxWorkerHeap, 10) : undefined;

        const server = createWebServer({
          port,
          host: options.host,
          defaultTaskTimeoutMs,
          maxWorkerHeapMb,
          sourceRepo: context.sourceRepo,
          syncRepo: context.syncRepo,
          cardRepo: context.cardRepo,
          documentRepo: context.docRepo,
          jobRepo: context.jobRepo,
          settingsRepo: context.settingsRepo,
          settingsService: context.settingsService,
          providerVerifier: context.providerVerifier,
          concurrency: {
            maxGenerationWorkers,
            maxSyncWorkers,
            maxExportWorkers,
          },
          ingestionService: context.ingestionService,
          exportService: context.exportService,
          ankiConnectAdapter: context.ankiConnectAdapter,
          strategyRegistry: context.strategyRegistry,
          promptBuilder: context.promptBuilder,
          groundingGuard: context.groundingGuard,
          dedupService: context.dedupService,
        });

        const { url } = await server.listen(port);
        console.log(`\n🎴 Flashcard Master Web UI is running at: ${url}`);
        console.log(`⚡ Background Task Concurrency: Generation=${maxGenerationWorkers}, Sync=${maxSyncWorkers}, Export=${maxExportWorkers} | Task Timeout=${taskTimeoutMinutes === 0 ? "Disabled" : `${taskTimeoutMinutes}m`}`);
        console.log("Press Ctrl+C to stop.\n");
      } catch (err: any) {
        console.error(`Failed to start Web UI server: ${err.message}`);
        process.exitCode = 1;
      }
    });

  // ==========================================
  // SOURCES COMMANDS
  // ==========================================
  const sourcesCmd = program.command("sources").description("Manage data sources (RSS feeds, Web articles, Local files)");

  sourcesCmd
    .command("add <name> <type> <uri>")
    .description("Register a new data source")
    .option("-t, --tags <tags>", "Comma-separated list of tags", "")
    .option("--slicing-mode <mode>", "Document slicing mode: outline | budget | none")
    .option("--pages-per-chunk <count>", "Page budget chunk size (number of pages)")
    .option("--words-per-chunk <count>", "Word budget chunk size (number of words)")
    .option("--min-chunk-words <count>", "Minimum section words for outline slicing")
    .option("--sync", "Immediately trigger ingestion sync upon adding")
    .action(async (name: string, type: string, uri: string, options: {
      tags: string;
      slicingMode?: string;
      pagesPerChunk?: string;
      wordsPerChunk?: string;
      minChunkWords?: string;
      sync?: boolean;
    }) => {
      try {
        const validTypes: DataSourceType[] = ["rss", "web", "local", "sitemap", "llms-txt", "notion"];
        if (!validTypes.includes(type as DataSourceType)) {
          console.error(`Error: Invalid source type "${type}". Must be one of: ${validTypes.join(", ")}`);
          process.exitCode = 1;
          return;
        }

        const tags = options.tags
          ? options.tags.split(",").map((t) => t.trim()).filter((t) => t.length > 0)
          : [];

        const source = context.sourceRepo.create({
          name,
          type: type as DataSourceType,
          uri,
          tags,
          isActive: true,
        });

        console.log(`✅ Successfully added data source: [${source.id}] "${source.name}" (${source.type})`);

        if (options.slicingMode && !["outline", "budget", "none"].includes(options.slicingMode)) {
          console.error(`Error: Invalid slicing mode "${options.slicingMode}". Must be one of: outline, budget, none`);
          process.exitCode = 1;
          return;
        }

        let slicing: DocumentSlicingOptions | undefined;
        if (options.slicingMode || options.pagesPerChunk || options.wordsPerChunk || options.minChunkWords) {
          const parsedPages = options.pagesPerChunk ? parseInt(options.pagesPerChunk, 10) : undefined;
          const parsedWords = options.wordsPerChunk ? parseInt(options.wordsPerChunk, 10) : undefined;
          const parsedMinWords = options.minChunkWords ? parseInt(options.minChunkWords, 10) : undefined;

          slicing = {
            mode: (options.slicingMode as SlicingMode) || (parsedPages || parsedWords ? "budget" : parsedMinWords ? "outline" : undefined),
            pagesPerChunk: parsedPages && !isNaN(parsedPages) && parsedPages > 0 ? parsedPages : undefined,
            wordsPerChunk: parsedWords && !isNaN(parsedWords) && parsedWords > 0 ? parsedWords : undefined,
            minChunkWords: parsedMinWords && !isNaN(parsedMinWords) && parsedMinWords > 0 ? parsedMinWords : undefined,
          };
        }

        if (slicing && !options.sync) {
          console.warn("⚠️  Warning: Slicing options require '--sync' to take effect upon adding. Use 'flashcard-master sync <sourceId>' with slicing options to ingest.");
        }

        if (options.sync) {
          console.log(`Starting ingestion synchronization for source [${source.id}]...`);
          const syncRes = await context.ingestionService.syncSource(source.id, { slicing });
          if (syncRes.error) {
            console.warn(`⚠️ [${syncRes.sourceName}] Sync error: ${syncRes.error}`);
          } else {
            console.log(`✅ [${syncRes.sourceName}] Ingested ${syncRes.newCount} new items (Total fetched: ${syncRes.totalFetched})`);
          }
        }
      } catch (err: any) {
        console.error(`Error adding data source: ${err.message}`);
        process.exitCode = 1;
      }
    });

  sourcesCmd
    .command("list")
    .description("List all registered data sources")
    .option("--json", "Output in JSON format")
    .action((options: { json?: boolean }) => {
      try {
        const sources = context.sourceRepo.list();
        if (options.json) {
          console.log(JSON.stringify(sources, null, 2));
          return;
        }

        if (sources.length === 0) {
          console.log("No data sources registered yet. Use 'flashcard-master sources add' to register one.");
          return;
        }

        console.log("\nRegistered Data Sources:");
        console.log("--------------------------------------------------------------------------------");
        for (const s of sources) {
          const tagsStr = s.tags.length > 0 ? ` [${s.tags.join(", ")}]` : "";
          console.log(`• ID: ${s.id}`);
          console.log(`  Name:   ${s.name}`);
          console.log(`  Type:   ${s.type.toUpperCase()}`);
          console.log(`  URI:    ${s.uri}`);
          console.log(`  Tags:   ${s.tags.length > 0 ? s.tags.join(", ") : "None"}`);
          console.log(`  Active: ${s.isActive ? "Yes" : "No"}`);
          console.log("--------------------------------------------------------------------------------");
        }
      } catch (err: any) {
        console.error(`Error listing sources: ${err.message}`);
        process.exitCode = 1;
      }
    });

  sourcesCmd
    .command("remove <id>")
    .description("Remove a data source by ID")
    .action((id: string) => {
      try {
        const success = context.sourceRepo.delete(id);
        if (success) {
          console.log(`✅ Successfully removed data source [${id}].`);
        } else {
          console.error(`Error: Source with ID "${id}" not found.`);
          process.exitCode = 1;
        }
      } catch (err: any) {
        console.error(`Error removing source: ${err.message}`);
        process.exitCode = 1;
      }
    });

  sourcesCmd
    .command("docs <sourceId>")
    .description("List all discovered documents and articles for a data source")
    .option("-s, --search <query>", "Filter documents by title or URL")
    .option("--json", "Output in JSON format")
    .action((sourceId: string, options: { search?: string; json?: boolean }) => {
      try {
        const source = context.sourceRepo.getById(sourceId);
        if (!source) {
          console.error(`Error: Data source "${sourceId}" not found.`);
          process.exitCode = 1;
          return;
        }

        const docs = context.docRepo.listBySourceId(source.id, { search: options.search });
        const allSourceCards = context.cardRepo.list({ sourceId: source.id });

        const enrichedDocs = docs.map((doc) => {
          const cardCount = allSourceCards.filter(
            (c) =>
              (c.documentTitle && c.documentTitle.toLowerCase() === doc.title.toLowerCase()) ||
              (c.sourceOriginUrl && doc.url && c.sourceOriginUrl === doc.url)
          ).length;
          return {
            ...doc,
            cardCount,
          };
        });

        if (options.json) {
          console.log(JSON.stringify(enrichedDocs, null, 2));
          return;
        }

        if (enrichedDocs.length === 0) {
          console.log(`No discovered documents found for "${source.name}". Run 'flashcard-master sync ${source.id}' first.`);
          return;
        }

        console.log(`\nDiscovered Documents for "${source.name}" (${enrichedDocs.length} total):`);
        console.log("--------------------------------------------------------------------------------");
        for (const doc of enrichedDocs) {
          console.log(`• ${doc.title}`);
          console.log(`  ID:    ${doc.id}`);
          if (doc.url) console.log(`  URL:   ${doc.url}`);
          if (doc.startPage != null) {
            const pageLabel = doc.endPage != null && doc.endPage !== doc.startPage
              ? `Pages: ${doc.startPage}-${doc.endPage}`
              : `Page: ${doc.startPage}`;
            console.log(`  ${pageLabel}`);
          }
          console.log(`  Words: ${(doc.wordCount ?? 0).toLocaleString()} | Generated Cards: ${doc.cardCount}`);
          console.log("--------------------------------------------------------------------------------");
        }
      } catch (err: any) {
        console.error(`Error listing source documents: ${err.message}`);
        process.exitCode = 1;
      }
    });

  sourcesCmd
    .command("export-docs <sourceId>")
    .description("Export discovered clean text documents for a data source into Markdown, HTML, Plain Text, or JSON")
    .option("-f, --format <format>", "Export format: markdown | html | txt | json", "markdown")
    .option("-m, --mode <mode>", "Packaging mode: merged | split", "merged")
    .option("-o, --output <path>", "Output file path")
    .option("-q, --quality <quality>", "Image quality profile: compact | standard | high", "compact")
    .option("--grayscale", "Convert inlined images to grayscale for Kindle e-ink e-readers", false)
    .option("--no-toc", "Omit Table of Contents in merged export")
    .option("--no-citations", "Omit origin URL citations in exported sections")
    .action(async (sourceId: string, options: { format: string; mode: string; output?: string; quality: string; grayscale: boolean; toc: boolean; citations: boolean }) => {
      try {
        const source = context.sourceRepo.getById(sourceId);
        if (!source) {
          console.error(`Error: Data source "${sourceId}" not found.`);
          process.exitCode = 1;
          return;
        }

        const docs = context.docRepo.listBySourceId(source.id);
        if (docs.length === 0) {
          console.error(`Error: No documents found for source "${source.name}". Run 'flashcard-master sync ${source.id}' first.`);
          process.exitCode = 1;
          return;
        }

        const docExporter = new DocumentExportService(context.mediaService);
        const result = await docExporter.export(docs, {
          format: options.format as any,
          mode: options.mode as any,
          sourceName: source.name,
          includeTableOfContents: options.toc !== false,
          includeCitations: options.citations !== false,
          outputPath: options.output,
          imageQuality: (options.quality as any) || "compact",
          grayscale: Boolean(options.grayscale),
        });

        if (options.output) {
          console.log(`✅ Successfully exported ${result.documentCount} documents to "${options.output}"`);
        } else {
          if (typeof result.content === "string") {
            console.log(result.content);
          } else {
            console.log(`✅ Generated binary archive: ${result.filename} (${result.content.length} bytes)`);
          }
        }
      } catch (err: any) {
        console.error(`Error exporting source documents: ${err.message}`);
        process.exitCode = 1;
      }
    });


  const runSync = async (
    sourceId: string | undefined,
    options: {
      slicingMode?: string;
      pagesPerChunk?: string;
      wordsPerChunk?: string;
      minChunkWords?: string;
    }
  ) => {
    try {
      console.log(`Starting ingestion synchronization${sourceId ? ` for source [${sourceId}]` : " for all active sources"}...`);
      if (options.slicingMode && !["outline", "budget", "none"].includes(options.slicingMode)) {
        console.error(`Error: Invalid slicing mode "${options.slicingMode}". Must be one of: outline, budget, none`);
        process.exitCode = 1;
        return;
      }

      let slicing: DocumentSlicingOptions | undefined;
      if (options.slicingMode || options.pagesPerChunk || options.wordsPerChunk || options.minChunkWords) {
        const parsedPages = options.pagesPerChunk ? parseInt(options.pagesPerChunk, 10) : undefined;
        const parsedWords = options.wordsPerChunk ? parseInt(options.wordsPerChunk, 10) : undefined;
        const parsedMinWords = options.minChunkWords ? parseInt(options.minChunkWords, 10) : undefined;

        slicing = {
          mode: (options.slicingMode as SlicingMode) || (parsedPages || parsedWords ? "budget" : parsedMinWords ? "outline" : undefined),
          pagesPerChunk: parsedPages && !isNaN(parsedPages) && parsedPages > 0 ? parsedPages : undefined,
          wordsPerChunk: parsedWords && !isNaN(parsedWords) && parsedWords > 0 ? parsedWords : undefined,
          minChunkWords: parsedMinWords && !isNaN(parsedMinWords) && parsedMinWords > 0 ? parsedMinWords : undefined,
        };
      }

      const results = sourceId
        ? [await context.ingestionService.syncSource(sourceId, { slicing })]
        : await context.ingestionService.syncAllActive({ slicing });

      let totalNewItems = 0;
      for (const r of results) {
        if (r.error) {
          console.warn(`⚠️ [${r.sourceName}] Sync error: ${r.error}`);
        } else {
          console.log(`✅ [${r.sourceName}] Ingested ${r.newCount} new items (Total fetched: ${r.totalFetched})`);
          totalNewItems += r.newCount;
        }
      }
      console.log(`Sync complete. Total new items fetched: ${totalNewItems}`);
    } catch (err: any) {
      console.error(`Sync failure: ${err.message}`);
      process.exitCode = 1;
    }
  };

  sourcesCmd
    .command("sync [sourceId]")
    .description("Synchronize and fetch new text documents from registered sources")
    .option("--slicing-mode <mode>", "Document slicing mode: outline | budget | none")
    .option("--pages-per-chunk <count>", "Page budget chunk size (number of pages)")
    .option("--words-per-chunk <count>", "Word budget chunk size (number of words)")
    .option("--min-chunk-words <count>", "Minimum section words for outline slicing")
    .action(runSync);

  // ==========================================
  // SYNC COMMAND
  // ==========================================
  program
    .command("sync [sourceId]")
    .description("Synchronize and fetch new text documents from registered sources")
    .option("--slicing-mode <mode>", "Document slicing mode: outline | budget | none")
    .option("--pages-per-chunk <count>", "Page budget chunk size (number of pages)")
    .option("--words-per-chunk <count>", "Word budget chunk size (number of words)")
    .option("--min-chunk-words <count>", "Minimum section words for outline slicing")
    .action(runSync);

  // ==========================================
  // GENERATE COMMAND
  // ==========================================
  program
    .command("generate [sourceId]")
    .description("Generate grounded flashcards from ingested source documents")
    .option("-p, --provider <provider>", "LLM Provider (openai, gemini, anthropic, ollama)", "ollama")
    .option("-k, --api-key <key>", "Provider API Key")
    .option("-m, --model <model>", "Model identifier (e.g. gpt-4o-mini, gemini-3.6-flash, claude-haiku-4-5-20251001, phi4-mini)")
    .option("--endpoint <endpoint>", "Custom API endpoint (e.g. for Ollama / LocalAI)")
    .option("--difficulty <level>", "Difficulty level: beginner, intermediate, expert, mixed", "intermediate")
    .option("--persona <persona>", "Prompt persona: socratic-mentor, strict-examiner, executive-synthesizer", "socratic-mentor")
    .option("-D, --depth <depth>", "Question depth & granularity: atomic, deep-dive, scenario", "atomic")
    .option("-M, --chunk-multiplier <multiplier>", "Context chunk size multiplier (1, 2, 3, 5, or 0 for full document)", "1")
    .option("-d, --deck <deck>", "Override destination deck")
    .option("-l, --limit <number>", "Maximum cards to generate per document", parseInt)
    .option("--enforce-grounding", "Enforce strict verbatim citation checks", true)
    .action(async (sourceId: string | undefined, options: any) => {
      try {
        // 1. Instantiate LLM adapter
        const llmProvider = createLLMAdapter({
          provider: options.provider,
          apiKey: options.apiKey,
          model: options.model,
          baseUrl: options.endpoint,
        });

        const genService = new CardGenerationService(
          llmProvider,
          undefined,
          context.promptBuilder,
          context.groundingGuard
        );

        // 2. Fetch documents
        const sources = sourceId
          ? [context.sourceRepo.getById(sourceId)].filter(Boolean)
          : context.sourceRepo.list().filter((s) => s.isActive);

        if (sources.length === 0) {
          console.log("No active data sources found to generate cards from.");
          return;
        }

        let totalCardsCreated = 0;
        const multiplier = parseFloat(options.chunkMultiplier) || 1;
        const fullDocument = multiplier === 0;

        for (const s of sources) {
          if (!s) continue;
          console.log(`\nGenerating cards for source "${s.name}" (${s.type})...`);

          const strategy = context.strategyRegistry.getStrategy(s.type);
          const rawDocs = await strategy.fetch(s);
          for (const raw of rawDocs) {
            const cleanDoc = strategy.extractCleanText(raw);
            console.log(`Processing article "${cleanDoc.title}"...`);

            const rawDrafts = await genService.generateFromDocument(cleanDoc, {
              difficulty: options.difficulty as DifficultyLevel,
              persona: options.persona as PersonaType,
              depthMode: options.depth as CardDepthMode,
              chunkOptions: { chunkMultiplier: multiplier, fullDocument },
              enforceGrounding: options.enforceGrounding,
            });

            const drafts = options.limit && options.limit > 0 ? rawDrafts.slice(0, options.limit) : rawDrafts;

            // Target deck
            const targetDeck = options.deck || "Default";

            // Deduplicate against existing cards
            const existingDeckCards = context.cardRepo.list({ targetDeck });
            const dedupResult = context.dedupService.filterUnique(drafts, existingDeckCards);

            if (dedupResult.duplicates.length > 0) {
              console.log(`  Filtered out ${dedupResult.duplicates.length} duplicate/near-identical questions.`);
            }

            // Persist unique cards
            if (dedupResult.unique.length > 0) {
              const created = context.cardRepo.createBatch(
                dedupResult.unique.map((u: any) => ({
                  ...u,
                  sourceOriginUrl: u.originUrl || (s.type === "web" || s.type === "rss" || s.type === "sitemap" || s.type === "llms-txt" ? s.uri : null),
                  documentTitle: u.documentTitle || s.name,
                  personaUsed: options.persona || "socratic-mentor",
                  targetDeck,
                  tags: Array.from(new Set([...(s.tags || []), u.difficulty])),
                }))
              );
              console.log(`  ✅ Stored ${created.length} new verified flashcards in deck "${targetDeck}".`);
              totalCardsCreated += created.length;
            }
          }
        }

        console.log(`\n🎉 Card generation complete! Created ${totalCardsCreated} total flashcards.`);
      } catch (err: any) {
        console.error(`Generation error: ${err.message}`);
        process.exitCode = 1;
      }
    });

  // ==========================================
  // EXPORT COMMAND
  // ==========================================
  program
    .command("export [format]")
    .description("Export flashcards (apkg, ankiconnect, csv, tsv, markdown, html, pdf, epub)")
    .option("-f, --format <format>", "Export format (apkg, ankiconnect, csv, tsv, markdown, html, pdf, epub)")
    .option("-d, --deck <deck>", "Filter by target deck name")
    .option("-t, --tag <tag>", "Filter by tag")
    .option("--difficulty <diff>", "Filter by difficulty (beginner, intermediate, expert, mixed)")
    .option("-o, --out <path>", "Output file destination path")
    .option("--all-decks <dir>", "Export all distinct decks into separate files inside directory")
    .option("--after <date>", "Filter cards created on or after date (YYYY-MM-DD or ISO string)")
    .option("--before <date>", "Filter cards created on or before date (YYYY-MM-DD or ISO string)")
    .option("--limit <number>", "Maximum number of cards to export", parseInt)
    .option("--shuffle", "Export a randomized/shuffled subset of cards", false)
    .option("--no-toc", "Omit Table of Contents in study guides")
    .option("--no-citations", "Omit source citation quotes and references in study guides")
    .option("--no-fold-guide", "Omit fold guide markers in printable HTML study guide")
    .action(async (formatArg: string | undefined, options: any) => {
      try {
        const format = formatArg || options.format;
        if (!format) {
          console.error("Error: Missing required argument 'format'. Specify format (e.g. 'flashcard-master export apkg' or 'flashcard-master export -f apkg').");
          process.exitCode = 1;
          return;
        }
        if (options.allDecks) {
          console.log(`Exporting all decks to format "${format}" into directory "${options.allDecks}"...`);
          const results = await context.exportService.exportAllDecks({
            format,
            outputDir: options.allDecks,
            options: {
              includeToc: options.toc,
              includeCitations: options.citations,
              includeFoldGuide: options.foldGuide,
            },
          });

          for (const r of results) {
            console.log(`✅ [${r.format.toUpperCase()}] ${r.message || `Saved to ${r.outputPath}`}`);
          }
          return;
        }

        const limit = options.limit !== undefined && !isNaN(options.limit) ? options.limit : undefined;
        const result = await context.exportService.export({
          format,
          filter: {
            targetDeck: options.deck,
            tag: options.tag,
            difficulty: options.difficulty as DifficultyLevel,
            createdAfter: options.after,
            createdBefore: options.before,
            limit,
            shuffle: Boolean(options.shuffle),
          },
          options: {
            outputPath: options.out,
            targetDeck: options.deck,
            includeToc: options.toc,
            includeCitations: options.citations,
            includeFoldGuide: options.foldGuide,
          },
        });

        console.log(`✅ ${result.message || `Exported ${result.successCount} cards to ${format}.`}`);
      } catch (err: any) {
        console.error(`Export failed: ${err.message}`);
        process.exitCode = 1;
      }
    });

  // ==========================================
  // INIT / ONBOARDING WIZARD
  // ==========================================
  program
    .command("init")
    .description("Interactive onboarding wizard to configure settings and add initial source")
    .action(async () => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const question = (query: string): Promise<string> =>
        new Promise((resolve) => rl.question(query, resolve));

      console.log("\n=======================================================");
      console.log("  🎴 Welcome to Flashcard Master Setup Wizard");
      console.log("=======================================================\n");

      try {
        const sourceName = (await question("1. First data source name (e.g. 'Tech Blog'): ")) || "Tech Blog";
        const sourceType = (await question("2. Source type (rss, web, local, sitemap, llms-txt, notion) [rss]: ")) || "rss";
        const sourceUri = (await question("3. Source URI / feed URL / folder path: ")) || "https://news.ycombinator.com/rss";

        const validTypes: DataSourceType[] = ["rss", "web", "local", "sitemap", "llms-txt", "notion"];
        const finalType = validTypes.includes(sourceType as DataSourceType)
          ? (sourceType as DataSourceType)
          : "rss";

        const created = context.sourceRepo.create({
          name: sourceName,
          type: finalType,
          uri: sourceUri,
          tags: ["initial-setup"],
          isActive: true,
        });

        console.log("\n🎉 Setup complete!");
        console.log(`Created initial data source: "${created.name}" (${created.type})`);
        console.log("\nNext Steps:");
        console.log("  • Run 'flashcard-master sync' to ingest articles");
        console.log("  • Run 'flashcard-master generate' to create flashcards");
        console.log("  • Run 'flashcard-master export apkg' to generate Anki package\n");
      } finally {
        rl.close();
      }
    });

  // ==========================================
  // STATS COMMAND
  // ==========================================
  program
    .command("stats")
    .description("Display database statistics, total sources, and flashcard counts")
    .action(() => {
      try {
        const sources = context.sourceRepo.list();
        const cards = context.cardRepo.list();
        const docCount = context.docRepo.getDocumentCount();
        const decks = context.cardRepo.listDecks();

        console.log("\n📊 Flashcard Master Knowledge Base Statistics:");
        console.log("-----------------------------------------------");
        console.log(`• Total Registered Sources: ${sources.length}`);
        console.log(`• Total Ingested Documents: ${docCount}`);
        console.log(`• Total Verified Flashcards: ${cards.length}`);
        console.log(`• Total Active Study Decks: ${decks.length}`);
        if (decks.length > 0) {
          console.log(`• Decks: ${decks.join(", ")}`);
        }
        console.log("");
      } catch (err: any) {
        console.error(`Error displaying statistics: ${err.message}`);
        process.exitCode = 1;
      }
    });

  return program;
}
