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
  CardGenerationService,
} from "@flashcard-master/core";
import { createLLMAdapter } from "@flashcard-master/adapters";
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
    .action(async (options: { port: string; host: string }) => {
      try {
        const port = parseInt(options.port, 10) || 3000;
        const server = createWebServer({
          port,
          host: options.host,
          sourceRepo: context.sourceRepo,
          syncRepo: context.syncRepo,
          cardRepo: context.cardRepo,
          ingestionService: context.ingestionService,
          exportService: context.exportService,
          ankiConnectAdapter: context.ankiConnectAdapter,
        });

        const { url } = await server.listen(port);
        console.log(`\n🎴 Flashcard Master Web UI is running at: ${url}`);
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
    .option("-d, --deck <deck>", "Target deck name", "Default")
    .option("-t, --tags <tags>", "Comma-separated list of tags", "")
    .action((name: string, type: string, uri: string, options: { deck: string; tags: string }) => {
      try {
        const validTypes: DataSourceType[] = ["rss", "web", "local"];
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
          targetDeck: options.deck,
          tags,
          isActive: true,
        });

        console.log(`✅ Successfully added data source: [${source.id}] "${source.name}" (${source.type}) -> Deck: ${source.targetDeck}`);
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
          console.log(`  Deck:   ${s.targetDeck}${tagsStr}`);
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

  // ==========================================
  // SYNC COMMAND
  // ==========================================
  program
    .command("sync [sourceId]")
    .description("Synchronize and fetch new text documents from registered sources")
    .action(async (sourceId?: string) => {
      try {
        console.log(`Starting ingestion synchronization${sourceId ? ` for source [${sourceId}]` : " for all active sources"}...`);
        const results = sourceId
          ? [await context.ingestionService.syncSource(sourceId)]
          : await context.ingestionService.syncAllActive();

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
    });

  // ==========================================
  // GENERATE COMMAND
  // ==========================================
  program
    .command("generate [sourceId]")
    .description("Generate grounded flashcards from ingested source documents")
    .option("-p, --provider <provider>", "LLM Provider (openai, gemini, anthropic, ollama)", "ollama")
    .option("-k, --api-key <key>", "Provider API Key")
    .option("-m, --model <model>", "Model identifier (e.g. gpt-4o-mini, gemini-2.0-flash, claude-3-5-haiku-latest, phi4-mini)")
    .option("--endpoint <endpoint>", "Custom API endpoint (e.g. for Ollama / LocalAI)")
    .option("--difficulty <level>", "Difficulty level: beginner, intermediate, expert", "intermediate")
    .option("--persona <persona>", "Prompt persona: socratic-mentor, strict-examiner, executive-synthesizer", "socratic-mentor")
    .option("-d, --deck <deck>", "Override destination deck")
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

        for (const s of sources) {
          if (!s) continue;
          console.log(`\nGenerating cards for source "${s.name}" (${s.type})...`);

          const strategy = context.strategyRegistry.getStrategy(s.type);
          const rawDocs = await strategy.fetch(s);
          for (const raw of rawDocs) {
            const cleanDoc = strategy.extractCleanText(raw);
            console.log(`Processing article "${cleanDoc.title}"...`);

            const drafts = await genService.generateFromDocument(cleanDoc, {
              difficulty: options.difficulty as DifficultyLevel,
              persona: options.persona as PersonaType,
              enforceGrounding: options.enforceGrounding,
            });

            // Target deck
            const targetDeck = options.deck || s.targetDeck || "Default";

            // Deduplicate against existing cards
            const existingDeckCards = context.cardRepo.list({ targetDeck });
            const dedupResult = context.dedupService.filterUnique(drafts, existingDeckCards);

            if (dedupResult.duplicates.length > 0) {
              console.log(`  Filtered out ${dedupResult.duplicates.length} duplicate/near-identical questions.`);
            }

            // Persist unique cards
            if (dedupResult.unique.length > 0) {
              const created = context.cardRepo.createBatch(
                dedupResult.unique.map((u) => ({
                  ...u,
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
    .command("export <format>")
    .description("Export flashcards (apkg, ankiconnect, csv, tsv, markdown, html)")
    .option("-d, --deck <deck>", "Filter by target deck name")
    .option("-t, --tag <tag>", "Filter by tag")
    .option("--difficulty <diff>", "Filter by difficulty (beginner, intermediate, expert)")
    .option("-o, --out <path>", "Output file destination path")
    .option("--all-decks <dir>", "Export all distinct decks into separate files inside directory")
    .action(async (format: string, options: any) => {
      try {
        if (options.allDecks) {
          console.log(`Exporting all decks to format "${format}" into directory "${options.allDecks}"...`);
          const results = await context.exportService.exportAllDecks({
            format,
            outputDir: options.allDecks,
          });

          for (const r of results) {
            console.log(`✅ [${r.format.toUpperCase()}] ${r.message || `Saved to ${r.outputPath}`}`);
          }
          return;
        }

        const result = await context.exportService.export({
          format,
          filter: {
            targetDeck: options.deck,
            tag: options.tag,
            difficulty: options.difficulty as DifficultyLevel,
          },
          options: {
            outputPath: options.out,
            targetDeck: options.deck,
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
        const sourceType = (await question("2. Source type (rss, web, local) [rss]: ")) || "rss";
        const sourceUri = (await question("3. Source URI / feed URL / folder path: ")) || "https://news.ycombinator.com/rss";
        const targetDeck = (await question("4. Target Deck name ['Computer Science']: ")) || "Computer Science";

        const validTypes: DataSourceType[] = ["rss", "web", "local"];
        const finalType = validTypes.includes(sourceType as DataSourceType)
          ? (sourceType as DataSourceType)
          : "rss";

        const created = context.sourceRepo.create({
          name: sourceName,
          type: finalType,
          uri: sourceUri,
          targetDeck,
          tags: ["initial-setup"],
          isActive: true,
        });

        console.log("\n🎉 Setup complete!");
        console.log(`Created initial data source: "${created.name}" (${created.type}) -> Deck: "${created.targetDeck}"`);
        console.log("\nNext Steps:");
        console.log("  • Run 'flashcard-master sync' to ingest articles");
        console.log("  • Run 'flashcard-master generate' to create flashcards");
        console.log("  • Run 'flashcard-master export apkg' to generate Anki package\n");
      } finally {
        rl.close();
      }
    });

  return program;
}
