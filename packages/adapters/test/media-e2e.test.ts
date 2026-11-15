import { describe, expect, it } from "vitest";
import {
  CardGenerationService,
  DataSourceRepository,
  DocumentRepository,
  FlashcardRepository,
  GroundingGuard,
  IngestionService,
  PromptBuilder,
  PersonaStudioService,
  StrategyRegistry,
  SyncStateRepository,
  createDatabaseClient,
  type LLMProviderPort,
} from "@flashcard-master/core";
import { YouTubeIngestionStrategy } from "../src/index.js";

describe("Media Pipeline End-to-End Verification (Story 21.7)", () => {
  it("ingests YouTube chapters, slices subdocuments, generates grounded cards with timestamp deep links, and persists to SQLite", async () => {
    const db = createDatabaseClient({ inMemory: true });
    const sourceRepo = new DataSourceRepository(db);
    const syncRepo = new SyncStateRepository(db);
    const docRepo = new DocumentRepository(db);
    const cardRepo = new FlashcardRepository(db);

    const playerResponse = {
      playabilityStatus: { status: "OK" },
      videoDetails: {
        videoId: "E2EMedia001",
        title: "Transformers Deep Dive",
        author: "ML Lab",
        lengthSeconds: "180",
        shortDescription: "Technical overview without description chapters.",
      },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ baseUrl: "https://captions.example/e2e-en", languageCode: "en" }],
        },
      },
    };

    const initialData = {
      playerOverlays: {
        playerOverlayRenderer: {
          decoratedPlayerBarRenderer: {
            decoratedPlayerBarRenderer: {
              playerBar: {
                multiMarkersPlayerBarRenderer: {
                  markersMap: [
                    {
                      key: "AUTO_CHAPTERS",
                      value: {
                        chapters: [
                          {
                            chapterRenderer: {
                              title: { simpleText: "Tokenization" },
                              timeRangeStartMillis: 0,
                            },
                          },
                          {
                            chapterRenderer: {
                              title: { simpleText: "Self-Attention" },
                              timeRangeStartMillis: 60000,
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    };

    const customFetch = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("https://www.youtube.com/watch?v=E2EMedia001")) {
        return new Response(
          `<!doctype html><html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script><script>var ytInitialData = ${JSON.stringify(initialData)};</script></body></html>`,
          { status: 200 }
        );
      }
      if (u === "https://captions.example/e2e-en") {
        return new Response(
          [
            "<transcript>",
            '<text start="5.0" dur="10.0">Byte-pair encoding splits rare words into subword tokens.</text>',
            '<text start="75.0" dur="12.0">Scaled dot-product attention computes compatibility weights between queries and keys.</text>',
            "</transcript>",
          ].join(""),
          { status: 200 }
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const registry = new StrategyRegistry();
    registry.register(new YouTubeIngestionStrategy({ customFetch }));

    const ingestionService = new IngestionService(sourceRepo, syncRepo, registry, docRepo);
    const source = sourceRepo.create({
      name: "Transformers Course",
      type: "youtube",
      uri: "https://www.youtube.com/watch?v=E2EMedia001",
      tags: ["ml"],
      isActive: true,
    });

    const syncResult = await ingestionService.syncSource(source.id, {
      slicing: { mode: "chapters", minutesPerChunk: 10 },
    });

    expect(syncResult.error).toBeUndefined();
    expect(syncResult.newCount).toBe(2);

    const savedDocs = docRepo.listBySourceId(source.id);
    expect(savedDocs).toHaveLength(2);
    expect(savedDocs[1].title).toContain("Self-Attention");
    expect(savedDocs[1].startSeconds).toBe(60);
    expect(savedDocs[1].url).toBe("https://www.youtube.com/watch?v=E2EMedia001&t=60s");

    const mockLlm: LLMProviderPort = {
      providerName: "openai",
      async generateQAPairs() {
        return [
          {
            question: "What does scaled dot-product attention compute?",
            answer: "It computes compatibility weights between queries and keys.",
            sourceQuote:
              "Scaled dot-product attention computes compatibility weights between queries and keys.",
            sourceLocator: "01:15",
            difficulty: "intermediate",
            keywords: ["attention"],
          },
        ];
      },
    };

    const genService = new CardGenerationService(
      mockLlm,
      undefined,
      new PromptBuilder(new PersonaStudioService()),
      new GroundingGuard()
    );

    const attentionDoc = savedDocs[1];
    const drafts = await genService.generateFromDocument(
      {
        id: attentionDoc.id,
        sourceId: source.id,
        title: attentionDoc.title,
        textContent: attentionDoc.textContent,
        originUrl: attentionDoc.url ?? undefined,
        startSeconds: attentionDoc.startSeconds ?? undefined,
        endSeconds: attentionDoc.endSeconds ?? undefined,
        contentHash: attentionDoc.contentHash ?? "e2e-hash",
      },
      { enforceGrounding: true }
    );

    expect(drafts).toHaveLength(1);
    cardRepo.createBatch(
      drafts.map((d) => ({
        targetDeck: "Transformers Deck",
        sourceId: d.sourceId,
        documentId: attentionDoc.id,
        documentTitle: d.documentTitle ?? attentionDoc.title,
        question: d.question,
        answer: d.answer,
        sourceQuote: d.sourceQuote,
        keywords: d.keywords ?? [],
        sourceLocator: d.sourceLocator ?? "01:15",
        sourceOriginUrl: d.sourceOriginUrl ?? d.originUrl ?? null,
        difficulty: d.difficulty,
        personaUsed: "socratic-mentor",
        tags: [],
      }))
    );

    const persistedCards = cardRepo.list({ targetDeck: "Transformers Deck" });
    expect(persistedCards).toHaveLength(1);
    expect(persistedCards[0].sourceLocator).toContain("01:15");
    expect(persistedCards[0].sourceOriginUrl).toBe("https://www.youtube.com/watch?v=E2EMedia001&t=75s");

    db.close();
  });
});

