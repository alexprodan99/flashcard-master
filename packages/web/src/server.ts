import http from "node:http";
import url, { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import {
  type DataSourceRepository,
  type SyncStateRepository,
  type FlashcardRepository,
  type DocumentRepository,
  type IngestionService,
  type ExportService,
  type StrategyRegistry,
  type PromptBuilder,
  type GroundingGuard,
  type CardDeduplicationService,
  type JobRepository,
  type SettingsRepository,
  type ProviderVerifierPort,
  SqliteSettingsRepository,
  SettingsService,
  createDatabaseClient,
  getDefaultLocalFilesDirectory,
  MediaService,
} from "@flashcard-master/core";
import {
  ProviderVerifier,
  AnkiConnectAdapter,
  AudioIngestionStrategy,
  VideoIngestionStrategy,
  YouTubeIngestionStrategy,
} from "@flashcard-master/adapters";
import { JobManager, type JobManagerOptions } from "./jobs/index.js";
import { WorkerExecutor } from "./workers/index.js";
import { getFallbackHtmlSpa } from "./fallback-spa.js";
import {
  buildCorsHeaders,
  decodeUriParamStrict,
  parseJsonBodyFromRequest,
  parseMultipartUpload,
  readRequestBuffer,
  sendJsonResponse,
  type RouteContext,
} from "./routes/route-context.js";
import { handleJobsAndMediaRoutes } from "./routes/jobs-routes.js";
import { handleSyncAndGenerateRoutes } from "./routes/sync-generate-routes.js";
import { handleSourcesAndDocumentsRoutes } from "./routes/sources-documents-routes.js";
import { handleCardsAndExportRoutes } from "./routes/cards-export-routes.js";
import { handleSettingsRoutes } from "./routes/settings-routes.js";

export type ExportFormat = "apkg" | "csv" | "tsv" | "markdown" | "html" | "pdf" | "epub";

export interface AnkiConnectHealthCheck {
  isOnline: boolean;
  version?: number;
  error?: string;
}

export interface WebServerOptions {
  port?: number;
  host?: string;
  sourceRepo: DataSourceRepository;
  syncRepo: SyncStateRepository;
  cardRepo: FlashcardRepository;
  documentRepo?: DocumentRepository;
  jobRepo?: JobRepository;
  jobManager?: JobManager;
  workerExecutor?: WorkerExecutor;
  settingsRepo?: SettingsRepository;
  settingsService?: SettingsService;
  providerVerifier?: ProviderVerifierPort;
  concurrency?: JobManagerOptions;
  ingestionService?: IngestionService;
  exportService?: ExportService;
  strategyRegistry?: StrategyRegistry;
  promptBuilder?: PromptBuilder;
  groundingGuard?: GroundingGuard;
  dedupService?: CardDeduplicationService;
  mediaService?: MediaService;
  mediaDir?: string;
  localFilesDir?: string;
  createLLMAdapterFn?: (config: any) => any;
  defaultTaskTimeoutMs?: number;
  maxWorkerHeapMb?: number;
  ankiConnectAdapter?: {
    checkHealth(): Promise<AnkiConnectHealthCheck>;
    syncCards(cards: any[], options?: any): Promise<any>;
  };
}

export class WebServer {
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly host: string;
  private readonly mediaService: MediaService;
  private readonly mediaDir: string;
  private readonly localFilesDir: string;
  public readonly jobManager: JobManager | null;
  private readonly workerExecutor: WorkerExecutor;
  private readonly settingsRepo: SettingsRepository | null;
  private readonly settingsService: SettingsService;
  private readonly providerVerifier: ProviderVerifierPort;
  private readonly ankiConnectAdapter: {
    checkHealth(): Promise<AnkiConnectHealthCheck>;
    syncCards(cards: any[], options?: any): Promise<any>;
  };

  constructor(private readonly options: WebServerOptions) {
    this.port = options.port !== undefined ? options.port : 3000;
    this.host = options.host || "127.0.0.1";
    this.mediaService = options.mediaService || new MediaService({ mediaDir: options.mediaDir?.trim() || undefined });
    this.mediaDir = options.mediaService
      ? this.mediaService.getMediaDirectory()
      : options.mediaDir?.trim() || this.mediaService.getMediaDirectory();
    this.localFilesDir = options.localFilesDir?.trim() || getDefaultLocalFilesDirectory();

    if (options.settingsService) {
      this.settingsService = options.settingsService;
      this.settingsRepo = options.settingsRepo || null;
    } else if (options.settingsRepo) {
      this.settingsRepo = options.settingsRepo;
      this.settingsService = new SettingsService(options.settingsRepo);
    } else {
      const fallbackDb = createDatabaseClient({ inMemory: true });
      this.settingsRepo = new SqliteSettingsRepository(fallbackDb);
      this.settingsService = new SettingsService(this.settingsRepo);
    }

    this.ankiConnectAdapter =
      options.ankiConnectAdapter || new AnkiConnectAdapter(() => this.settingsService.getAnkiConnectOptions());

    if (options.strategyRegistry) {
      if (!options.strategyRegistry.hasStrategy("audio")) {
        options.strategyRegistry.register(new AudioIngestionStrategy({ settingsService: this.settingsService }));
      }
      if (!options.strategyRegistry.hasStrategy("video")) {
        options.strategyRegistry.register(new VideoIngestionStrategy({ settingsService: this.settingsService }));
      }
      if (!options.strategyRegistry.hasStrategy("youtube")) {
        options.strategyRegistry.register(new YouTubeIngestionStrategy({ settingsService: this.settingsService }));
      }
    }

    const concurrencyLimits = this.settingsService.getWorkerConcurrencyLimits();
    const effectiveMaxGen = options.concurrency?.maxGenerationWorkers ?? concurrencyLimits.maxGenerationWorkers;
    const effectiveMaxSync = options.concurrency?.maxSyncWorkers ?? concurrencyLimits.maxSyncWorkers;
    const effectiveMaxExport = options.concurrency?.maxExportWorkers ?? concurrencyLimits.maxExportWorkers;
    const effectiveWorkerTimeout = options.concurrency?.workerTimeoutMinutes ?? concurrencyLimits.workerTimeoutMinutes;

    if (options.jobManager) {
      this.jobManager = options.jobManager;
    } else if (options.jobRepo) {
      this.jobManager = new JobManager(options.jobRepo, {
        maxGenerationWorkers: effectiveMaxGen,
        maxSyncWorkers: effectiveMaxSync,
        maxExportWorkers: effectiveMaxExport,
        workerTimeoutMinutes: effectiveWorkerTimeout,
        isVerbose: options.concurrency?.isVerbose ?? (() => this.settingsService.isVerboseLogging()),
        logToConsole: options.concurrency?.logToConsole,
      });
    } else {
      this.jobManager = null;
    }

    this.providerVerifier = options.providerVerifier || new ProviderVerifier();

    this.workerExecutor =
      options.workerExecutor ||
      new WorkerExecutor({
        cardRepo: options.cardRepo,
        sourceRepo: options.sourceRepo,
        syncRepo: options.syncRepo,
        dedupService: options.dedupService,
        ingestionService: options.ingestionService,
        documentRepo: options.documentRepo,
        mediaDir: this.mediaDir,
        localFilesDir: this.localFilesDir,
        defaultTimeoutMs: options.defaultTaskTimeoutMs,
        maxWorkerHeapMb: options.maxWorkerHeapMb,
      });
  }

  getJobManager(): JobManager | null {
    return this.jobManager;
  }

  getWorkerExecutor(): WorkerExecutor {
    return this.workerExecutor;
  }

  getSettingsService(): SettingsService {
    return this.settingsService;
  }

  getSettingsRepo(): SettingsRepository | null {
    return this.settingsRepo;
  }

  getProviderVerifier(): ProviderVerifierPort {
    return this.providerVerifier;
  }

  private serveStaticSpa(pathname: string, res: http.ServerResponse): void {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const clientDistDir = path.resolve(currentDir, "client");
    const clientDistWithSep = clientDistDir.endsWith(path.sep) ? clientDistDir : `${clientDistDir}${path.sep}`;

    const requestedFile = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
    const filePath = path.resolve(clientDistDir, requestedFile);

    if (filePath !== clientDistDir && !filePath.startsWith(clientDistWithSep)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      let contentType = "application/octet-stream";
      if (ext === ".html") contentType = "text/html; charset=utf-8";
      else if (ext === ".js") contentType = "application/javascript; charset=utf-8";
      else if (ext === ".css") contentType = "text/css; charset=utf-8";
      else if (ext === ".json") contentType = "application/json; charset=utf-8";
      else if (ext === ".svg") contentType = "image/svg+xml";
      else if (ext === ".png") contentType = "image/png";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
      });
      res.end(fs.readFileSync(filePath));
      return;
    }

    const spaIndex = path.join(clientDistDir, "index.html");
    if (fs.existsSync(spaIndex)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(spaIndex));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(getFallbackHtmlSpa());
  }

  private createRouteContext(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    method: string,
    query: Record<string, any>
  ): RouteContext {
    return {
      req,
      res,
      pathname,
      method,
      query,
      options: this.options,
      jobManager: this.jobManager,
      workerExecutor: this.workerExecutor,
      settingsService: this.settingsService,
      providerVerifier: this.providerVerifier,
      mediaService: this.mediaService,
      mediaDir: this.mediaDir,
      localFilesDir: this.localFilesDir,
      ankiConnectAdapter: this.ankiConnectAdapter,
      sendJson: (statusCode, data) => sendJsonResponse(req, res, statusCode, data),
      buildCorsHeaders: () => buildCorsHeaders(req),
      parseBody: () => parseJsonBodyFromRequest(req),
      parseJsonBodyStrict: async () => {
        try {
          return await parseJsonBodyFromRequest(req);
        } catch (err: any) {
          const badReq = new Error(err?.message || "Invalid JSON body");
          (badReq as any).statusCode = typeof err?.statusCode === "number" ? err.statusCode : 400;
          throw badReq;
        }
      },
      readRequestBodyBuffer: (maxBytes) => readRequestBuffer(req, maxBytes),
      parseMultipartFormData: (buf, boundary) => parseMultipartUpload(buf, boundary),
      decodeRouteParam: (raw) => decodeUriParamStrict(raw),
    };
  }

  async listen(port?: number): Promise<{ port: number; url: string }> {
    const listenPort = port !== undefined ? port : this.port;

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url || "/", true);
        const pathname = parsedUrl.pathname || "/";
        const method = req.method || "GET";

        if (method === "OPTIONS") {
          res.writeHead(204, buildCorsHeaders(req));
          res.end();
          return;
        }

        try {
          if (!pathname.startsWith("/api/")) {
            this.serveStaticSpa(pathname, res);
            return;
          }

          const ctx = this.createRouteContext(req, res, pathname, method, parsedUrl.query as Record<string, any>);
          const handlers = [
            handleJobsAndMediaRoutes,
            handleSyncAndGenerateRoutes,
            handleSourcesAndDocumentsRoutes,
            handleCardsAndExportRoutes,
            handleSettingsRoutes,
          ];

          for (const handler of handlers) {
            if (await handler(ctx)) {
              return;
            }
          }

          ctx.sendJson(404, { error: "Not Found", path: pathname });
        } catch (err: any) {
          const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
          sendJsonResponse(req, res, status, { error: err.message || "Internal Server Error" });
        }
      });

      this.server.on("error", reject);

      this.server.listen(listenPort, this.host, () => {
        let addr = this.server?.address();
        let actualPort = typeof addr === "object" && addr && addr.port ? addr.port : listenPort;
        if ((!actualPort || actualPort === 0) && this.server) {
          addr = this.server.address();
          if (typeof addr === "object" && addr && addr.port) {
            actualPort = addr.port;
          }
        }
        if (!actualPort || actualPort === 0) {
          reject(new Error("WebServer failed to bind to a valid port (port is 0)"));
          return;
        }
        resolve({
          port: actualPort,
          url: `http://${this.host}:${actualPort}`,
        });
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        if (typeof (this.server as any).closeAllConnections === "function") {
          (this.server as any).closeAllConnections();
        }
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export function createWebServer(options: WebServerOptions): WebServer {
  return new WebServer(options);
}
