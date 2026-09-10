import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  createDatabaseClient,
  DataSourceRepository,
  SyncStateRepository,
  FlashcardRepository,
  DocumentRepository,
  JobRepository,
  type SettingsRepository,
  type ProviderVerifierPort,
  SqliteSettingsRepository,
  SettingsService,
  StrategyRegistry,
  IngestionService,
  PersonaStudioService,
  PromptBuilder,
  GroundingGuard,
  CardDeduplicationService,
  CardGenerationService,
  ExporterRegistry,
  ExportService,
  MediaService,
} from "@flashcard-master/core";
import {
  RssIngestionStrategy,
  WebReaderStrategy,
  LocalFileStrategy,
  SitemapIngestionStrategy,
  LlmsTxtIngestionStrategy,
  createLLMAdapter,
  AnkiPackageExporter,
  AnkiConnectAdapter,
  CsvExporter,
  TsvExporter,
  MarkdownExporter,
  HtmlStudyGuideExporter,
  PdfStudyGuideExporter,
  ProviderVerifier,
} from "@flashcard-master/adapters";
import type Database from "better-sqlite3";

export interface AppContext {
  db: Database.Database;
  sourceRepo: DataSourceRepository;
  syncRepo: SyncStateRepository;
  cardRepo: FlashcardRepository;
  docRepo: DocumentRepository;
  jobRepo: JobRepository;
  settingsRepo: SettingsRepository;
  settingsService: SettingsService;
  providerVerifier: ProviderVerifierPort;
  mediaService: MediaService;
  strategyRegistry: StrategyRegistry;
  ingestionService: IngestionService;
  exporterRegistry: ExporterRegistry;
  exportService: ExportService;
  personaStudio: PersonaStudioService;
  promptBuilder: PromptBuilder;
  groundingGuard: GroundingGuard;
  dedupService: CardDeduplicationService;
  ankiConnectAdapter: AnkiConnectAdapter;
  close: () => void;
}

export interface AppOptions {
  dbPath?: string;
  inMemory?: boolean;
}

export function getDefaultDbPath(): string {
  const dir = path.join(os.homedir(), ".flashcard-master");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "flashcards.db");
}

export function createAppContext(options: AppOptions = {}): AppContext {
  const db = options.inMemory
    ? createDatabaseClient({ inMemory: true })
    : createDatabaseClient({ dbPath: options.dbPath || getDefaultDbPath() });

  const sourceRepo = new DataSourceRepository(db);
  const syncRepo = new SyncStateRepository(db);
  const cardRepo = new FlashcardRepository(db);
  const docRepo = new DocumentRepository(db);
  const jobRepo = new JobRepository(db);
  const settingsRepo = new SqliteSettingsRepository(db);
  const settingsService = new SettingsService(settingsRepo);
  const providerVerifier = new ProviderVerifier();
  const mediaService = new MediaService();

  // Ingestion strategies
  const strategyRegistry = new StrategyRegistry();
  strategyRegistry.register(new RssIngestionStrategy());
  strategyRegistry.register(new WebReaderStrategy({ mediaService }));
  strategyRegistry.register(new LocalFileStrategy());
  strategyRegistry.register(new SitemapIngestionStrategy());
  strategyRegistry.register(new LlmsTxtIngestionStrategy({ mediaService }));

  const ingestionService = new IngestionService(sourceRepo, syncRepo, strategyRegistry, docRepo);

  // Exporters
  const ankiConnectAdapter = new AnkiConnectAdapter();
  const exporterRegistry = new ExporterRegistry();
  exporterRegistry.register(new AnkiPackageExporter());
  exporterRegistry.register(ankiConnectAdapter);
  exporterRegistry.register(new CsvExporter());
  exporterRegistry.register(new TsvExporter());
  exporterRegistry.register(new MarkdownExporter());
  exporterRegistry.register(new HtmlStudyGuideExporter());
  exporterRegistry.register(new PdfStudyGuideExporter());

  const exportService = new ExportService(cardRepo, exporterRegistry);

  // Generation components
  const personaStudio = new PersonaStudioService();
  const promptBuilder = new PromptBuilder(personaStudio);
  const groundingGuard = new GroundingGuard();
  const dedupService = new CardDeduplicationService();

  return {
    db,
    sourceRepo,
    syncRepo,
    cardRepo,
    docRepo,
    jobRepo,
    settingsRepo,
    settingsService,
    providerVerifier,
    mediaService,
    strategyRegistry,
    ingestionService,
    exporterRegistry,
    exportService,
    personaStudio,
    promptBuilder,
    groundingGuard,
    dedupService,
    ankiConnectAdapter,
    close: () => db.close(),
  };
}

