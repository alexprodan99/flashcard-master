import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  createDatabaseClient,
  getDefaultDatabasePath,
  getDefaultLocalFilesDirectory,
  getDefaultMediaDirectory,
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
  NotionStrategy,
  AudioIngestionStrategy,
  VideoIngestionStrategy,
  YouTubeIngestionStrategy,
  AnkiPackageExporter,
  AnkiConnectAdapter,
  CsvExporter,
  TsvExporter,
  MarkdownExporter,
  HtmlStudyGuideExporter,
  PdfStudyGuideExporter,
  EpubFlashcardExporter,
  ProviderVerifier,
} from "@flashcard-master/adapters";
import type Database from "better-sqlite3";

export interface AppContext {
  db: Database.Database;
  dbPath: string;
  mediaDir: string;
  localFilesDir: string;
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
  dataDir?: string;
  dbPath?: string;
  inMemory?: boolean;
  mediaDir?: string;
  localFilesDir?: string;
}

export function getDefaultDbPath(): string {
  return getDefaultDatabasePath();
}

export function createAppContext(options: AppOptions = {}): AppContext {
  const trimmedDataDir = options.dataDir?.trim();
  if (options.dataDir !== undefined && !trimmedDataDir) {
    throw new Error("dataDir must be a non-empty directory path");
  }
  const resolvedBaseDir = trimmedDataDir ? path.resolve(trimmedDataDir) : undefined;

  const trimmedDbPath = options.dbPath?.trim();
  const inMemoryBaseDir = options.inMemory
    ? fs.mkdtempSync(path.join(os.tmpdir(), "flashcard-master-inmemory-"))
    : undefined;

  const dbPath = options.inMemory
    ? ":memory:"
    : trimmedDbPath ||
      (resolvedBaseDir ? path.join(resolvedBaseDir, "data.sqlite") : getDefaultDatabasePath());

  const siblingBaseDir = resolvedBaseDir || (trimmedDbPath ? path.dirname(path.resolve(trimmedDbPath)) : undefined);

  const mediaDir =
    options.mediaDir?.trim() ||
    (siblingBaseDir
      ? path.join(siblingBaseDir, "media")
      : inMemoryBaseDir
        ? path.join(inMemoryBaseDir, "media")
        : getDefaultMediaDirectory());

  const localFilesDir =
    options.localFilesDir?.trim() ||
    (siblingBaseDir
      ? path.join(siblingBaseDir, "local-files")
      : inMemoryBaseDir
        ? path.join(inMemoryBaseDir, "local-files")
        : getDefaultLocalFilesDirectory());

  if (!fs.existsSync(localFilesDir)) {
    fs.mkdirSync(localFilesDir, { recursive: true });
  }

  const db = options.inMemory
    ? createDatabaseClient({ inMemory: true })
    : createDatabaseClient({ dbPath });

  const sourceRepo = new DataSourceRepository(db);
  const syncRepo = new SyncStateRepository(db);
  const cardRepo = new FlashcardRepository(db);
  const docRepo = new DocumentRepository(db);
  const jobRepo = new JobRepository(db);
  const settingsRepo = new SqliteSettingsRepository(db);
  const settingsService = new SettingsService(settingsRepo);
  const providerVerifier = new ProviderVerifier();
  const mediaService = new MediaService({ mediaDir });

  // Ingestion strategies
  const strategyRegistry = new StrategyRegistry();
  strategyRegistry.register(new RssIngestionStrategy());
  strategyRegistry.register(new WebReaderStrategy({ mediaService }));
  strategyRegistry.register(new LocalFileStrategy({ mediaService }));
  strategyRegistry.register(new SitemapIngestionStrategy());
  strategyRegistry.register(new LlmsTxtIngestionStrategy({ mediaService }));
  strategyRegistry.register(new NotionStrategy({ settingsService, mediaService }));
  strategyRegistry.register(new AudioIngestionStrategy({ settingsService }));
  strategyRegistry.register(new VideoIngestionStrategy({ settingsService }));
  strategyRegistry.register(new YouTubeIngestionStrategy({ settingsService }));

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
  exporterRegistry.register(new EpubFlashcardExporter(settingsService, mediaService));

  const exportService = new ExportService(cardRepo, exporterRegistry);

  // Generation components
  const personaStudio = new PersonaStudioService();
  const promptBuilder = new PromptBuilder(personaStudio);
  const groundingGuard = new GroundingGuard();
  const dedupService = new CardDeduplicationService();

  return {
    db,
    dbPath,
    mediaDir,
    localFilesDir,
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
    close: () => {
      db.close();
      if (inMemoryBaseDir) {
        try {
          fs.rmSync(inMemoryBaseDir, { recursive: true, force: true });
        } catch {}
      }
    },
  };
}
