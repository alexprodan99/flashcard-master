import http from "node:http";
import url from "node:url";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
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
  type CardFilter,
  type DifficultyLevel,
  type PersonaType,
  type CardDepthMode,
  type DiscoveredDocument,
  type JobRepository,
  type SettingsRepository,
  type ProviderVerifierPort,
  SqliteSettingsRepository,
  SettingsService,
  SUPPORTED_PROVIDERS,
  createDatabaseClient,
  MediaService,
  CardGenerationService,
  type DocumentSlicingOptions,
} from "@flashcard-master/core";
import { createLLMAdapter, DocumentExportService, ProviderVerifier } from "@flashcard-master/adapters";
import { JobManager, type ConcurrencyLimits, type JobManagerOptions } from "./jobs/index.js";
import { WorkerExecutor } from "./workers/index.js";

export type ExportFormat = "apkg" | "csv" | "tsv" | "markdown" | "html" | "pdf";

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
  private readonly localFilesDir: string;
  private readonly jobManager: JobManager | null;
  private readonly workerExecutor: WorkerExecutor;
  private readonly settingsRepo: SettingsRepository | null;
  private readonly settingsService: SettingsService;
  private readonly providerVerifier: ProviderVerifierPort;

  constructor(private readonly options: WebServerOptions) {
    this.port = options.port !== undefined ? options.port : 3000;
    this.host = options.host || "127.0.0.1";
    this.mediaService = options.mediaService || new MediaService();
    this.localFilesDir = options.localFilesDir || path.join(os.homedir(), ".flashcard-master", "local-files");
    
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

    if (options.jobManager) {
      this.jobManager = options.jobManager;
    } else if (options.jobRepo) {
      this.jobManager = new JobManager(options.jobRepo, {
        ...options.concurrency,
        isVerbose: options.concurrency?.isVerbose ?? (() => this.settingsService.isVerboseLogging()),
        logToConsole: options.concurrency?.logToConsole,
      });
    } else {
      this.jobManager = null;
    }

    if (options.providerVerifier) {
      this.providerVerifier = options.providerVerifier;
    } else {
      this.providerVerifier = new ProviderVerifier();
    }

    if (options.workerExecutor) {
      this.workerExecutor = options.workerExecutor;
    } else {
      this.workerExecutor = new WorkerExecutor({
        cardRepo: options.cardRepo,
        sourceRepo: options.sourceRepo,
        syncRepo: options.syncRepo,
        dedupService: options.dedupService,
        ingestionService: options.ingestionService,
        documentRepo: options.documentRepo,
        defaultTimeoutMs: options.defaultTaskTimeoutMs,
        maxWorkerHeapMb: options.maxWorkerHeapMb,
      });
    }
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



  private getHtmlSpa(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flashcard Master Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --radius: 8px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    aside {
      width: 260px;
      background: var(--card-bg);
      border-right: 1px solid var(--card-border);
      display: flex;
      flex-direction: column;
      padding: 24px 16px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 32px;
      padding-left: 8px;
    }

    .nav-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .nav-item {
      padding: 10px 14px;
      border-radius: var(--radius);
      color: var(--text-muted);
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.15s ease;
    }
    .nav-item:hover, .nav-item.active {
      background: rgba(99, 102, 241, 0.15);
      color: var(--primary);
    }

    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: 32px 40px;
      position: relative;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    h1 { font-size: 26px; font-weight: 700; }
    .subtitle { font-size: 14px; color: var(--text-muted); margin-top: 4px; }

    .btn {
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn-secondary { background: #334155; color: #f8fafc; }
    .btn-secondary:hover { background: #475569; }
    .btn-success { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
    .btn-success:hover { background: rgba(16, 185, 129, 0.3); }
    .btn-danger { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.3); }
    .btn-sm { padding: 4px 10px; font-size: 12px; }

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      gap: 12px;
      flex-wrap: wrap;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }

    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .kpi-label { font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-val { font-size: 32px; font-weight: 700; color: var(--text); }
    .kpi-sub { font-size: 12px; color: var(--accent); }

    .section-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
    .card-list { display: flex; flex-direction: column; gap: 14px; }
    
    /* Visual Flashcards Grid */
    .flashcards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 18px;
      margin-top: 16px;
    }

    .card-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: border-color 0.15s ease, transform 0.15s ease;
    }
    .card-box:hover {
      border-color: rgba(99, 102, 241, 0.5);
      transform: translateY(-2px);
    }

    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .card-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .badge {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 9999px;
      background: rgba(255,255,255,0.08);
      color: var(--text-muted);
    }
    .badge-diff { background: rgba(56, 189, 248, 0.15); color: var(--accent); }
    .badge-deck { background: rgba(99, 102, 241, 0.15); color: var(--primary); }
    .badge-rss { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .badge-web { background: rgba(56, 189, 248, 0.15); color: var(--accent); }
    .badge-local { background: rgba(16, 185, 129, 0.15); color: var(--success); }

    .card-q { font-size: 15px; font-weight: 600; margin-bottom: 12px; line-height: 1.4; }
    .card-a-container {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px dashed var(--card-border);
      display: none;
    }
    .card-a { font-size: 14px; color: #e2e8f0; line-height: 1.4; margin-bottom: 8px; }

    .source-quote {
      margin-top: 8px;
      padding-left: 10px;
      border-left: 2px solid var(--primary);
      font-size: 12px;
      color: #94a3b8;
      font-style: italic;
    }

    /* Filter Controls */
    .filter-panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 16px 20px;
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .search-input {
      background: #0f172a;
      border: 1px solid var(--card-border);
      border-radius: 6px;
      color: var(--text);
      padding: 10px 14px;
      font-size: 14px;
      outline: none;
      width: 100%;
    }
    .search-input:focus { border-color: var(--primary); }

    .chip-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .chip-label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-right: 4px; }
    .filter-chip {
      background: #0f172a;
      border: 1px solid var(--card-border);
      border-radius: 9999px;
      padding: 4px 12px;
      font-size: 12px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .filter-chip:hover { border-color: var(--primary); color: var(--text); }
    .filter-chip.active { background: rgba(99, 102, 241, 0.2); border-color: var(--primary); color: #818cf8; font-weight: 600; }

    /* Table Styles */
    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 14px;
    }
    th {
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid var(--card-border);
      padding: 12px 16px;
      color: var(--text-muted);
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
    }
    td {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(51, 65, 85, 0.4);
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: none; }

    /* Export Center Styles */
    .export-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .export-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
      transition: border-color 0.15s ease;
    }
    .export-card:hover { border-color: var(--primary); }
    .export-card-title { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .export-card-desc { font-size: 13px; color: var(--text-muted); line-height: 1.4; }

    /* Slide-over Drawer */
    .drawer-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      display: none;
      justify-content: flex-end;
      z-index: 150;
      backdrop-filter: blur(2px);
    }
    .drawer {
      width: 520px;
      max-width: 95vw;
      height: 100%;
      background: var(--card-bg);
      border-left: 1px solid var(--card-border);
      padding: 32px 28px;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      animation: slideIn 0.25s ease-out;
    }
    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 100;
    }
    .modal {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      width: 480px;
      max-width: 90vw;
      padding: 24px;
    }

    .modal-header, .drawer-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .form-group {
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-group label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
    }
    .form-input {
      background: #0f172a;
      border: 1px solid var(--card-border);
      border-radius: 6px;
      color: var(--text);
      padding: 10px 12px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
    }
    .form-input:focus { border-color: var(--primary); }
    textarea.form-input { resize: vertical; min-height: 80px; line-height: 1.4; }

    .drawer-actions, .modal-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1px solid var(--card-border);
    }
  </style>
</head>
<body>
  <aside>
    <div class="brand">
      <span>🎴</span> Flashcard Master
    </div>
    <ul class="nav-list">
      <li class="nav-item active" id="nav-dashboard" onclick="switchTab('dashboard')">📊 Dashboard</li>
      <li class="nav-item" id="nav-sources" onclick="switchTab('sources')">🌐 Data Sources</li>
      <li class="nav-item" id="nav-generate" onclick="switchTab('generate')">⚡ Generate Studio</li>
      <li class="nav-item" id="nav-cards" onclick="switchTab('cards')">🗂️ Question Explorer</li>
      <li class="nav-item" id="nav-export" onclick="switchTab('export')">🚀 Export Center</li>
    </ul>
  </aside>

  <main>
    <!-- 1. DASHBOARD VIEW -->
    <div id="view-dashboard">
      <header>
        <div>
          <h1>Dashboard Overview</h1>
          <p class="subtitle">Real-time local metrics and generated study card knowledge base</p>
        </div>
        <div id="status-pill" class="badge badge-diff">🟢 Local SQLite Active</div>
      </header>

      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">Total Flashcards</span>
          <span id="kpi-cards" class="kpi-val">0</span>
          <span class="kpi-sub">Verified &amp; Deduplicated</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Active Sources</span>
          <span id="kpi-sources" class="kpi-val">0</span>
          <span class="kpi-sub">RSS, Web, Local</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Study Decks</span>
          <span id="kpi-decks" class="kpi-val">0</span>
          <span class="kpi-sub">Distinct Categories</span>
        </div>
      </div>

      <div class="section-title">Recent Generated Flashcards</div>
      <div id="card-feed" class="card-list">
        <p style="color: var(--text-muted); font-size: 14px;">Loading cards...</p>
      </div>
    </div>

    <!-- 2. DATA SOURCES VIEW -->
    <div id="view-sources" style="display:none;">
      <header>
        <div>
          <h1>Ingested Data Sources</h1>
          <p class="subtitle">Manage RSS feeds, web articles, and local Markdown documentation</p>
        </div>
        <button class="btn" onclick="openAddSourceModal()">+ Add Data Source</button>
      </header>

      <div class="card" style="margin-bottom: 24px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="font-size:16px;">🔄 Incremental Delta Sync</h3>
            <p style="color:var(--text-muted); font-size:13px; margin-top:4px;">Fetch newly published articles and local file changes across all active sources</p>
          </div>
          <button class="btn btn-secondary" id="sync-all-btn" onclick="triggerBulkSync()">⚡ Sync All Sources</button>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>URI / Endpoint</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="sources-tbody">
            <tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Loading sources...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 3. GENERATE STUDIO VIEW -->
    <div id="view-generate" style="display: none;">
      <header>
        <div>
          <h1>⚡ AI Flashcard Generation Studio</h1>
          <p class="subtitle">Extract grounded, atomic flashcards directly from your ingested materials with customizable models and cognitive personas</p>
        </div>
        <div id="gen-status-badge" class="badge badge-diff">🟢 Ready to Generate</div>
      </header>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px;">
        <!-- Left: Configuration Form -->
        <div class="card">
          <h3 style="margin-bottom: 16px;">⚙️ Studio Configuration</h3>
          <form onsubmit="handleGenerateStudioSubmit(event)">
            <div class="form-group">
              <label>1. AI Provider</label>
              <select class="form-input" id="gen-provider" onchange="updateProviderDefaults()">
                <option value="ollama">🦙 Ollama (100% Local &amp; Free)</option>
                <option value="gemini">🔵 Google Gemini (Recommended Cloud)</option>
                <option value="openai">🟢 OpenAI</option>
                <option value="anthropic">🟣 Anthropic</option>
              </select>
            </div>

            <div class="form-group">
              <label>2. Model Identifier (or type custom model)</label>
              <input class="form-input" id="gen-model" value="phi4-mini" placeholder="e.g. phi4-mini, gemini-3.6-flash, gpt-4o-mini" required />
            </div>

            <div class="form-group" id="gen-apikey-container" style="display: none;">
              <label>3. API Key (Optional)</label>
              <input class="form-input" id="gen-apikey" type="password" placeholder="Leave empty to use server environment variable" />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                <label>4. Learning Persona</label>
                <select class="form-input" id="gen-persona">
                  <option value="socratic-mentor">🎓 Socratic Mentor</option>
                  <option value="strict-examiner">⚖️ Strict Examiner</option>
                  <option value="analogy-builder">💡 Analogy Builder</option>
                </select>
              </div>

              <div class="form-group">
                <label>5. Difficulty Tier</label>
                <select class="form-input" id="gen-difficulty">
                  <option value="intermediate">🟡 Intermediate</option>
                  <option value="beginner">🟢 Beginner</option>
                  <option value="expert">🔴 Expert</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <label style="margin-bottom: 0;">6. Ingested Data Sources Scope <span id="gen-source-count-badge" class="badge badge-diff" style="margin-left: 8px;">0 Selected</span></label>
                <button type="button" class="btn btn-secondary btn-sm" style="padding: 3px 8px; font-size: 11px;" onclick="toggleAllGenerateSources()">Toggle All</button>
              </div>
              <div id="gen-sources-checkbox-list" style="background: #0f172a; border: 1px solid var(--card-border); border-radius: 6px; padding: 8px; max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">
                <div style="color: var(--text-muted); font-size: 12px;">Loading active data sources...</div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                <label>7. Target Deck Override</label>
                <input class="form-input" id="gen-deck" placeholder="Leave blank to use Source Deck" />
              </div>

              <div class="form-group">
                <label>8. Max Cards per Doc</label>
                <input class="form-input" id="gen-limit" type="number" min="1" max="20" value="5" />
              </div>
            </div>

            <button type="submit" id="gen-submit-btn" class="btn" style="width: 100%; margin-top: 16px; font-weight: 600;">⚡ Start AI Generation</button>
          </form>
        </div>

        <!-- Right: Real-time Execution Feedback & Card Previews -->
        <div class="card" style="display: flex; flex-direction: column;">
          <h3 style="margin-bottom: 16px;">📊 Live Execution &amp; Results</h3>
          
          <div id="gen-placeholder" style="color: var(--text-muted); font-size: 14px; line-height: 1.6; padding: 24px 0; text-align: center;">
            <div style="font-size: 32px; margin-bottom: 8px;">✨</div>
            Configure your AI generation settings on the left and click <strong>Start AI Generation</strong> to synthesize grounded flashcards.
          </div>

          <div id="gen-loading" style="display: none; padding: 32px 0; text-align: center;">
            <div style="font-size: 36px; animation: spin 1s linear infinite; display: inline-block; margin-bottom: 12px;">⏳</div>
            <div style="font-weight: 600; color: var(--text);">Synthesizing flashcards with AI...</div>
            <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Enforcing verbatim citations and filtering duplicates</div>
          </div>

          <div id="gen-results" style="display: none; flex: 1; display: flex; flex-direction: column;">
            <div id="gen-metrics-banner" style="background: rgba(99, 102, 241, 0.15); border: 1px solid var(--primary); border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
              <span id="gen-metrics-text">✅ Created 0 new flashcards</span>
              <button class="btn btn-secondary btn-sm" onclick="switchTab('cards')">👁️ View in Explorer</button>
            </div>

            <div style="font-weight: 600; font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">Newly Generated Cards Preview:</div>
            <div id="gen-cards-list" style="overflow-y: auto; max-height: 360px; display: flex; flex-direction: column; gap: 10px;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. QUESTION EXPLORER VIEW -->
    <div id="view-cards" style="display:none;">
      <header>
        <div>
          <h1>Question Explorer</h1>
          <p class="subtitle">Explore, search, and self-test verified flashcards with filter chips</p>
        </div>
        <div id="cards-count-badge" class="badge badge-diff">0 Cards Found</div>
      </header>

      <div class="filter-panel">
        <input class="search-input" id="search-query" placeholder="🔍 Search questions, answers, and source quotes..." oninput="handleSearchInput()" />
        
        <div class="chip-row" id="deck-chips-row">
          <span class="chip-label">Deck:</span>
          <span class="filter-chip active" onclick="setFilter('deck', '')">All Decks</span>
        </div>

        <div class="chip-row">
          <span class="chip-label">Difficulty:</span>
          <span class="filter-chip active" id="diff-chip-all" onclick="setFilter('difficulty', '')">All</span>
          <span class="filter-chip" id="diff-chip-beginner" onclick="setFilter('difficulty', 'beginner')">🟢 Beginner</span>
          <span class="filter-chip" id="diff-chip-intermediate" onclick="setFilter('difficulty', 'intermediate')">🟡 Intermediate</span>
          <span class="filter-chip" id="diff-chip-expert" onclick="setFilter('difficulty', 'expert')">🔴 Expert</span>
        </div>

        <div class="chip-row" id="tag-chips-row">
          <span class="chip-label">Tags:</span>
          <span class="filter-chip active" onclick="setFilter('tag', '')">All Tags</span>
        </div>
      </div>

      <div id="explorer-grid" class="flashcards-grid">
        <p style="color: var(--text-muted); font-size: 14px;">Loading cards...</p>
      </div>
    </div>

    <!-- 5. EXPORT CENTER VIEW -->
    <div id="view-export" style="display:none;">
      <header>
        <div>
          <h1>1-Click Export Center</h1>
          <p class="subtitle">Download flashcards in multiple formats or sync directly with desktop Anki</p>
        </div>
        <div id="export-count-badge" class="badge badge-diff">All Cards Selected</div>
      </header>

      <!-- Scope Filter Card -->
      <div class="filter-panel" style="margin-bottom: 24px;">
        <h3 style="font-size: 15px; font-weight: 600;">🎯 Export Scoping Filters</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px;">
          <div class="form-group" style="margin-bottom: 0;">
            <label>Filter by Target Deck</label>
            <select class="form-input" id="export-deck-select" onchange="updateExportScope()">
              <option value="">All Decks (Entire Collection)</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label>Filter by Tag</label>
            <select class="form-input" id="export-tag-select" onchange="updateExportScope()">
              <option value="">All Tags</option>
            </select>
          </div>
        </div>
      </div>

      <!-- AnkiConnect Live Status Card -->
      <div class="kpi-card" style="margin-bottom: 24px; border-color: rgba(99, 102, 241, 0.4);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <h3 style="font-size: 16px;">🔄 Desktop AnkiConnect Integration</h3>
              <span id="ankiconnect-badge" class="badge" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8;">Checking Status...</span>
            </div>
            <p style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">Synchronize flashcard notes directly into the running Anki desktop app</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="checkAnkiConnectStatus()">🔄 Refresh Status</button>
            <button id="ankiconnect-sync-btn" class="btn btn-sm" onclick="syncToAnkiConnect()">🚀 Push to Anki</button>
          </div>
        </div>
      </div>

      <!-- Format Download Cards -->
      <div class="section-title">📦 Download Standalone Deliverables</div>
      <div class="export-grid">
        <div class="export-card">
          <div>
            <div class="export-card-title">📦 Anki Package (.apkg)</div>
            <p class="export-card-desc">Native SQLite Anki package bundled with full deck hierarchy, tags, and CSS styling for 1-click import.</p>
          </div>
          <button class="btn" onclick="triggerFileDownload('apkg')">⬇️ Download .apkg</button>
        </div>

        <div class="export-card">
          <div>
            <div class="export-card-title">📄 Spreadsheet (.csv)</div>
            <p class="export-card-desc">RFC 4180 standard comma-delimited spreadsheet format with quote escaping, deck headers, and tags.</p>
          </div>
          <button class="btn btn-secondary" onclick="triggerFileDownload('csv')">⬇️ Download .csv</button>
        </div>

        <div class="export-card">
          <div>
            <div class="export-card-title">📋 Tab-Separated (.tsv)</div>
            <p class="export-card-desc">Standard tab-delimited text format compatible with Quizlet, Google Sheets, and legacy flashcard apps.</p>
          </div>
          <button class="btn btn-secondary" onclick="triggerFileDownload('tsv')">⬇️ Download .tsv</button>
        </div>

        <div class="export-card">
          <div>
            <div class="export-card-title">📝 Active-Recall Markdown (.md)</div>
            <p class="export-card-desc">Obsidian &amp; Notion compatible markdown with YAML metadata frontmatter and collapsible &lt;details&gt; answer blocks.</p>
          </div>
          <button class="btn btn-secondary" onclick="triggerFileDownload('markdown')">⬇️ Download .md</button>
        </div>

        <div class="export-card">
          <div>
            <div class="export-card-title">🖨️ Two-Column Printable Study Guide (.html)</div>
            <p class="export-card-desc">Print-optimized two-column fold-over HTML document with @media print CSS for offline physical flashcard review.</p>
          </div>
          <button class="btn btn-secondary" onclick="triggerFileDownload('html')">⬇️ Download .html</button>
        </div>
      </div>
    </div>
  </main>

  <!-- ADD SOURCE MODAL -->
  <div id="add-source-modal" class="modal-overlay">
    <div class="modal">
      <div class="modal-header">
        <h3>Add Data Source</h3>
        <button class="btn btn-secondary btn-sm" onclick="closeAddSourceModal()">✕</button>
      </div>
      <form onsubmit="handleCreateSource(event)">
        <div class="form-group">
          <label>Source Name</label>
          <input class="form-input" id="src-name" placeholder="e.g. Distributed Systems Blog" required />
        </div>
        <div class="form-group">
          <label>Source Type</label>
          <select class="form-input" id="src-type">
            <option value="rss">RSS / Atom Feed</option>
            <option value="web">Web Article URL</option>
            <option value="local">Local Markdown Folder</option>
          </select>
        </div>
        <div class="form-group">
          <label>URI / URL / File Path</label>
          <input class="form-input" id="src-uri" placeholder="https://example.com/rss.xml" required />
        </div>
        <div class="form-group">
          <label>Tags (comma-separated)</label>
          <input class="form-input" id="src-tags" placeholder="tech, cloud" />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeAddSourceModal()">Cancel</button>
          <button type="submit" class="btn">Save Source</button>
        </div>
      </form>
    </div>
  </div>

  <!-- SLIDE-OVER CARD EDITOR DRAWER -->
  <div id="card-drawer-overlay" class="drawer-overlay" onclick="if (event.target === this) closeCardDrawer();">
    <div class="drawer">
      <div class="drawer-header">
        <h3>✏️ Edit Flashcard</h3>
        <button class="btn btn-secondary btn-sm" onclick="closeCardDrawer()">✕</button>
      </div>
      <form onsubmit="handleSaveCardEdits(event)" style="display: flex; flex-direction: column; flex: 1;">
        <input type="hidden" id="edit-card-id" />
        
        <div class="form-group">
          <label>Question</label>
          <textarea class="form-input" id="edit-card-question" rows="3" required></textarea>
        </div>

        <div class="form-group">
          <label>Answer</label>
          <textarea class="form-input" id="edit-card-answer" rows="4" required></textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label>Difficulty</label>
            <select class="form-input" id="edit-card-difficulty">
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="expert">Expert</option>
            </select>
          </div>
          <div class="form-group">
            <label>Target Deck</label>
            <input class="form-input" id="edit-card-deck" placeholder="Default" />
          </div>
        </div>

        <div class="form-group">
          <label>Tags (comma-separated)</label>
          <input class="form-input" id="edit-card-tags" placeholder="tag1, tag2" />
        </div>

        <div class="form-group">
          <label>Source Verbatim Excerpt</label>
          <textarea class="form-input" id="edit-card-quote" rows="2" style="font-size: 13px; color: var(--text-muted);"></textarea>
        </div>

        <div class="drawer-actions">
          <button type="button" class="btn btn-danger btn-sm" onclick="handleDeleteCurrentCard()">🗑️ Delete Card</button>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeCardDrawer()">Cancel</button>
            <button type="submit" class="btn btn-sm">💾 Save Changes</button>
          </div>
        </div>
      </form>
    </div>
  </div>

  <script>
    let activeFilters = {
      search: '',
      deck: '',
      difficulty: '',
      tag: ''
    };
    let exportScope = {
      deck: '',
      tag: ''
    };
    let searchDebounceTimer = null;
    let cardCache = new Map();

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function escapeAttr(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    async function loadStats() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        document.getElementById('kpi-cards').innerText = data.totalCards;
        document.getElementById('kpi-sources').innerText = data.totalSources;
        document.getElementById('kpi-decks').innerText = data.totalDecks;

        const feed = document.getElementById('card-feed');
        if (!data.recentCards || data.recentCards.length === 0) {
          feed.innerHTML = '<p style="color: var(--text-muted); font-size: 14px;">No flashcards in database yet. Ingest a source to generate cards!</p>';
          return;
        }

        let html = '';
        for (let i = 0; i < data.recentCards.length; i++) {
          const c = data.recentCards[i];
          cardCache.set(c.id, c);
          const tagsHtml = (c.tags || []).map(function(t) { return '<span class="badge">#' + escapeHtml(t) + '</span>'; }).join('');
          const quoteHtml = c.sourceQuote ? '<div class="source-quote">"' + escapeHtml(c.sourceQuote) + '"</div>' : '';

          html += '<div class="card-box">' +
            '<div class="card-header-row">' +
              '<div class="card-meta">' +
                '<span class="badge badge-deck">' + escapeHtml(c.targetDeck) + '</span>' +
                '<span class="badge badge-diff">' + escapeHtml(c.difficulty) + '</span>' +
                tagsHtml +
              '</div>' +
              '<button class="btn btn-secondary btn-sm" data-id="' + escapeAttr(c.id) + '" onclick="openCardDrawer(this.dataset.id)">✏️ Edit</button>' +
            '</div>' +
            '<div class="card-q">' + escapeHtml(c.question) + '</div>' +
            '<div class="card-a">' + escapeHtml(c.answer) + '</div>' +
            quoteHtml +
          '</div>';
        }
        feed.innerHTML = html;
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    }

    async function loadSources() {
      try {
        const res = await fetch('/api/sources');
        const sources = await res.json();
        const tbody = document.getElementById('sources-tbody');

        if (!sources || sources.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">No data sources configured. Click "+ Add Data Source" to add one.</td></tr>';
          return;
        }

        let html = '';
        for (let i = 0; i < sources.length; i++) {
          const s = sources[i];
          const typeBadge = '<span class="badge badge-' + escapeAttr(s.type) + '">' + escapeHtml(s.type.toUpperCase()) + '</span>';
          const statusBadge = s.isActive ? '<span class="badge" style="color: #34d399;">● Active</span>' : '<span class="badge" style="color: #94a3b8;">○ Inactive</span>';

          html += '<tr>' +
            '<td><strong>' + escapeHtml(s.name) + '</strong></td>' +
            '<td>' + typeBadge + '</td>' +
            '<td style="font-family: monospace; font-size: 12px; color: var(--text-muted);">' + escapeHtml(s.uri) + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' +
              '<button class="btn btn-secondary btn-sm" data-id="' + escapeAttr(s.id) + '" onclick="syncSingleSource(this.dataset.id)">🔄 Sync</button> ' +
              '<button class="btn btn-danger btn-sm" data-id="' + escapeAttr(s.id) + '" onclick="deleteSingleSource(this.dataset.id)">🗑️</button>' +
            '</td>' +
          '</tr>';
        }
        tbody.innerHTML = html;
      } catch (err) {
        console.error('Failed to load sources:', err);
      }
    }

    function setDeckFilter(val) {
      setFilter('deck', val || '');
    }

    function setTagFilter(val) {
      setFilter('tag', val || '');
    }

    async function loadExplorerFilterChips() {
      try {
        // Decks
        const decksRes = await fetch('/api/decks');
        const decks = await decksRes.json();
        const deckContainer = document.getElementById('deck-chips-row');
        let deckHtml = '<span class="chip-label">Deck:</span><span class="filter-chip ' + (activeFilters.deck === '' ? 'active' : '') + '" data-deck="" onclick="setDeckFilter(this.dataset.deck)">All Decks</span>';
        for (let i = 0; i < decks.length; i++) {
          const d = decks[i];
          deckHtml += '<span class="filter-chip ' + (activeFilters.deck === d ? 'active' : '') + '" data-deck="' + escapeAttr(d) + '" onclick="setDeckFilter(this.dataset.deck)">' + escapeHtml(d) + '</span>';
        }
        deckContainer.innerHTML = deckHtml;

        // Tags
        const tagsRes = await fetch('/api/tags');
        const tags = await tagsRes.json();
        const tagContainer = document.getElementById('tag-chips-row');
        let tagHtml = '<span class="chip-label">Tags:</span><span class="filter-chip ' + (activeFilters.tag === '' ? 'active' : '') + '" data-tag="" onclick="setTagFilter(this.dataset.tag)">All Tags</span>';
        for (let i = 0; i < tags.length; i++) {
          const t = tags[i];
          tagHtml += '<span class="filter-chip ' + (activeFilters.tag === t ? 'active' : '') + '" data-tag="' + escapeAttr(t) + '" onclick="setTagFilter(this.dataset.tag)">#' + escapeHtml(t) + '</span>';
        }
        tagContainer.innerHTML = tagHtml;
      } catch (err) {
        console.error('Failed to load filter chips:', err);
      }
    }

    async function loadExplorerCards() {
      try {
        const params = new URLSearchParams();
        if (activeFilters.search) params.append('search', activeFilters.search);
        if (activeFilters.deck) params.append('deck', activeFilters.deck);
        if (activeFilters.difficulty) params.append('difficulty', activeFilters.difficulty);
        if (activeFilters.tag) params.append('tag', activeFilters.tag);

        const res = await fetch('/api/cards?' + params.toString());
        const cards = await res.json();

        document.getElementById('cards-count-badge').innerText = cards.length + ' Cards Found';

        const grid = document.getElementById('explorer-grid');
        if (!cards || cards.length === 0) {
          grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">' +
            '<h3>🔍 No matching flashcards found</h3>' +
            '<p style="margin-top: 6px; font-size: 14px;">Try clearing filters or search terms.</p>' +
          '</div>';
          return;
        }

        let html = '';
        for (let i = 0; i < cards.length; i++) {
          const c = cards[i];
          cardCache.set(c.id, c);
          const tagsHtml = (c.tags || []).map(function(t) { return '<span class="badge">#' + escapeHtml(t) + '</span>'; }).join('');
          const quoteHtml = c.sourceQuote ? '<div class="source-quote"><strong>Source Excerpt:</strong> "' + escapeHtml(c.sourceQuote) + '"</div>' : '';

          html += '<div class="card-box" id="card-box-' + escapeAttr(c.id) + '">' +
            '<div>' +
              '<div class="card-header-row">' +
                '<div class="card-meta">' +
                  '<span class="badge badge-deck">' + escapeHtml(c.targetDeck) + '</span>' +
                  '<span class="badge badge-diff">' + escapeHtml(c.difficulty) + '</span>' +
                  tagsHtml +
                '</div>' +
                '<button class="btn btn-secondary btn-sm" data-id="' + escapeAttr(c.id) + '" onclick="openCardDrawer(this.dataset.id)">✏️ Edit</button>' +
              '</div>' +
              '<div class="card-q">' + escapeHtml(c.question) + '</div>' +
            '</div>' +
            '<div>' +
              '<div class="card-a-container" id="ans-' + escapeAttr(c.id) + '">' +
                '<div class="card-a"><strong>Answer:</strong> ' + escapeHtml(c.answer) + '</div>' +
                quoteHtml +
              '</div>' +
              '<button class="btn btn-secondary btn-sm" style="margin-top: 14px; width: 100%;" data-id="' + escapeAttr(c.id) + '" onclick="toggleAnswer(this, this.dataset.id)">👁️ Reveal Answer</button>' +
            '</div>' +
          '</div>';
        }
        grid.innerHTML = html;
      } catch (err) {
        console.error('Failed to load explorer cards:', err);
      }
    }

    function toggleAnswer(btn, cardId) {
      const container = document.getElementById('ans-' + cardId);
      if (!container) return;
      if (container.style.display === 'block') {
        container.style.display = 'none';
        if (btn) btn.innerText = '👁️ Reveal Answer';
      } else {
        container.style.display = 'block';
        if (btn) btn.innerText = '🙈 Hide Answer';
      }
    }

    function setFilter(key, value) {
      activeFilters[key] = value;

      if (key === 'difficulty') {
        document.querySelectorAll('[id^="diff-chip-"]').forEach(function(el) { el.classList.remove('active'); });
        const targetId = value === '' ? 'diff-chip-all' : 'diff-chip-' + value;
        const targetEl = document.getElementById(targetId);
        if (targetEl) targetEl.classList.add('active');
      }

      loadExplorerFilterChips();
      loadExplorerCards();
    }

    function handleSearchInput() {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(function() {
        activeFilters.search = document.getElementById('search-query').value.trim();
        loadExplorerCards();
      }, 250);
    }

    function openCardDrawer(cardId) {
      const card = cardCache.get(cardId);
      if (!card) return;

      document.getElementById('edit-card-id').value = card.id;
      document.getElementById('edit-card-question').value = card.question || '';
      document.getElementById('edit-card-answer').value = card.answer || '';
      document.getElementById('edit-card-difficulty').value = card.difficulty || 'intermediate';
      document.getElementById('edit-card-deck').value = card.targetDeck || 'Default';
      document.getElementById('edit-card-tags').value = (card.tags || []).join(', ');
      document.getElementById('edit-card-quote').value = card.sourceQuote || '';

      document.getElementById('card-drawer-overlay').style.display = 'flex';
    }

    function closeCardDrawer() {
      document.getElementById('card-drawer-overlay').style.display = 'none';
    }

    async function handleSaveCardEdits(e) {
      e.preventDefault();
      const id = document.getElementById('edit-card-id').value;
      const question = document.getElementById('edit-card-question').value;
      const answer = document.getElementById('edit-card-answer').value;
      const difficulty = document.getElementById('edit-card-difficulty').value;
      const targetDeck = document.getElementById('edit-card-deck').value || 'Default';
      const tagsStr = document.getElementById('edit-card-tags').value;
      const tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];
      const sourceQuote = document.getElementById('edit-card-quote').value;

      try {
        const res = await fetch('/api/cards/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, answer, difficulty, targetDeck, tags, sourceQuote })
        });
        if (res.ok) {
          const updated = await res.json();
          cardCache.set(updated.id, updated);
          closeCardDrawer();
          loadExplorerCards();
          loadStats();
        } else {
          alert('Failed to save card edits');
        }
      } catch (err) {
        alert('Error saving card: ' + err.message);
      }
    }

    async function handleDeleteCurrentCard() {
      const id = document.getElementById('edit-card-id').value;
      if (!confirm('Are you sure you want to permanently delete this flashcard?')) return;

      try {
        const res = await fetch('/api/cards/' + id, { method: 'DELETE' });
        if (res.ok) {
          cardCache.delete(id);
          closeCardDrawer();
          loadExplorerCards();
          loadStats();
        } else {
          alert('Failed to delete card');
        }
      } catch (err) {
        alert('Error deleting card: ' + err.message);
      }
    }

    // EXPORT CENTER LOGIC
    async function loadExportCenter() {
      try {
        const [decksRes, tagsRes] = await Promise.all([
          fetch('/api/decks'),
          fetch('/api/tags')
        ]);
        const decks = await decksRes.json();
        const tags = await tagsRes.json();

        const deckSelect = document.getElementById('export-deck-select');
        let deckOpts = '<option value="">All Decks (Entire Collection)</option>';
        for (let d of decks) {
          deckOpts += '<option value="' + escapeAttr(d) + '">' + escapeHtml(d) + '</option>';
        }
        deckSelect.innerHTML = deckOpts;

        const tagSelect = document.getElementById('export-tag-select');
        let tagOpts = '<option value="">All Tags</option>';
        for (let t of tags) {
          tagOpts += '<option value="' + escapeAttr(t) + '">#' + escapeHtml(t) + '</option>';
        }
        tagSelect.innerHTML = tagOpts;

        updateExportScope();
        checkAnkiConnectStatus();
      } catch (err) {
        console.error('Failed to initialize export center:', err);
      }
    }

    function updateExportScope() {
      exportScope.deck = document.getElementById('export-deck-select').value;
      exportScope.tag = document.getElementById('export-tag-select').value;

      let badgeText = 'All Cards Selected';
      if (exportScope.deck && exportScope.tag) {
        badgeText = 'Deck: ' + exportScope.deck + ' | Tag: #' + exportScope.tag;
      } else if (exportScope.deck) {
        badgeText = 'Deck: ' + exportScope.deck;
      } else if (exportScope.tag) {
        badgeText = 'Tag: #' + exportScope.tag;
      }
      document.getElementById('export-count-badge').innerText = badgeText;
    }

    function triggerFileDownload(format) {
      const params = new URLSearchParams();
      params.append('format', format);
      if (exportScope.deck) params.append('deck', exportScope.deck);
      if (exportScope.tag) params.append('tag', exportScope.tag);

      window.location.href = '/api/export?' + params.toString();
    }

    async function checkAnkiConnectStatus() {
      const badge = document.getElementById('ankiconnect-badge');
      badge.innerText = 'Checking...';
      badge.style.background = 'rgba(148, 163, 184, 0.15)';
      badge.style.color = '#94a3b8';

      try {
        const res = await fetch('/api/ankiconnect/status');
        const data = await res.json();

        if (data.isOnline) {
          badge.innerText = '🟢 Connected (v' + (data.version || 6) + ')';
          badge.style.background = 'rgba(16, 185, 129, 0.15)';
          badge.style.color = '#34d399';
        } else {
          badge.innerText = '🔴 Offline (Anki closed)';
          badge.style.background = 'rgba(239, 68, 68, 0.15)';
          badge.style.color = '#f87171';
        }
      } catch (err) {
        badge.innerText = '🔴 Unreachable';
        badge.style.background = 'rgba(239, 68, 68, 0.15)';
        badge.style.color = '#f87171';
      }
    }

    async function syncToAnkiConnect() {
      const btn = document.getElementById('ankiconnect-sync-btn');
      const origText = btn.innerText;
      btn.innerText = '⏳ Syncing...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/ankiconnect/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetDeck: exportScope.deck, tag: exportScope.tag })
        });
        const data = await res.json();

        if (data.error) {
          alert('❌ AnkiConnect Sync Failed: ' + data.error);
        } else {
          alert('✅ AnkiConnect Sync Success!\\n\\nAdded ' + (data.addedCards || 0) + ' new cards to Anki.\\nDuplicates/Skipped: ' + (data.duplicateOrFailedCards || 0));
        }
      } catch (err) {
        alert('❌ Error: ' + err.message);
      } finally {
        btn.innerText = origText;
        btn.disabled = false;
        checkAnkiConnectStatus();
      }
    }

    function switchTab(tab) {
      document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
      document.getElementById('view-dashboard').style.display = 'none';
      document.getElementById('view-generate').style.display = 'none';
      document.getElementById('view-sources').style.display = 'none';
      document.getElementById('view-cards').style.display = 'none';
      document.getElementById('view-export').style.display = 'none';

      document.getElementById('nav-' + tab).classList.add('active');
      document.getElementById('view-' + tab).style.display = 'block';

      if (tab === 'dashboard') loadStats();
      if (tab === 'generate') {
        loadGenerateSources();
        updateProviderDefaults();
      }
      if (tab === 'sources') loadSources();
      if (tab === 'cards') {
        loadExplorerFilterChips();
        loadExplorerCards();
      }
      if (tab === 'export') {
        loadExportCenter();
      }
    }

    function updateProviderDefaults() {
      const provider = document.getElementById('gen-provider').value;
      const modelInput = document.getElementById('gen-model');
      const apiKeyContainer = document.getElementById('gen-apikey-container');

      if (provider === 'ollama') {
        modelInput.value = 'phi4-mini';
        apiKeyContainer.style.display = 'none';
      } else if (provider === 'gemini') {
        modelInput.value = 'gemini-3.6-flash';
        apiKeyContainer.style.display = 'flex';
      } else if (provider === 'openai') {
        modelInput.value = 'gpt-4o-mini';
        apiKeyContainer.style.display = 'flex';
      } else if (provider === 'anthropic') {
        modelInput.value = 'claude-haiku-4-5-20251001';
        apiKeyContainer.style.display = 'flex';
      }
    }

    async function loadGenerateSources() {
      try {
        const res = await fetch('/api/sources');
        const sources = await res.json();
        const container = document.getElementById('gen-sources-checkbox-list');
        const activeSources = sources.filter(function(s) { return s.isActive; });
        if (activeSources.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">No active data sources found. Please add a data source first.</div>';
          document.getElementById('gen-source-count-badge').innerText = '0 Selected';
          return;
        }
        let html = '';
        activeSources.forEach(function(s) {
          html += '<label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; color: var(--text); padding: 4px 6px; border-radius: 4px; background: rgba(255,255,255,0.02);">' +
            '<input type="checkbox" class="gen-source-checkbox" value="' + escapeAttr(s.id) + '" checked onchange="updateSelectedSourcesCount()" />' +
            '<span style="font-weight: 500;">' + escapeHtml(s.name) + '</span>' +
            '<span class="badge badge-diff" style="font-size: 10px; padding: 1px 6px;">' + escapeHtml(s.type) + '</span>' +
          '</label>';
        });
        container.innerHTML = html;
        updateSelectedSourcesCount();
      } catch (err) {
        console.error('Failed to load sources for generator:', err);
      }
    }

    function toggleAllGenerateSources() {
      const checkboxes = document.querySelectorAll('.gen-source-checkbox');
      const allChecked = Array.from(checkboxes).every(function(cb) { return cb.checked; });
      checkboxes.forEach(function(cb) { cb.checked = !allChecked; });
      updateSelectedSourcesCount();
    }

    function updateSelectedSourcesCount() {
      const checkboxes = document.querySelectorAll('.gen-source-checkbox');
      const total = checkboxes.length;
      const checked = Array.from(checkboxes).filter(function(cb) { return cb.checked; }).length;
      const badge = document.getElementById('gen-source-count-badge');
      if (badge) {
        badge.innerText = checked + ' / ' + total + ' Selected';
      }
    }

    async function handleGenerateStudioSubmit(e) {
      e.preventDefault();
      const provider = document.getElementById('gen-provider').value;
      const model = document.getElementById('gen-model').value;
      const apiKey = document.getElementById('gen-apikey').value || undefined;
      const persona = document.getElementById('gen-persona').value;
      const difficulty = document.getElementById('gen-difficulty').value;
      const targetDeck = document.getElementById('gen-deck').value || undefined;
      const limit = parseInt(document.getElementById('gen-limit').value, 10) || 5;

      const checkedBoxes = Array.from(document.querySelectorAll('.gen-source-checkbox:checked'));
      const sourceIds = checkedBoxes.map(function(cb) { return cb.value; });

      if (sourceIds.length === 0) {
        alert('⚠️ Please select at least one data source to generate flashcards from.');
        return;
      }

      const btn = document.getElementById('gen-submit-btn');
      const origText = btn.innerText;
      btn.innerText = '⏳ Synthesizing Cards (' + sourceIds.length + ' source' + (sourceIds.length > 1 ? 's' : '') + ')...';
      btn.disabled = true;

      document.getElementById('gen-status-badge').innerText = '🟡 Generating...';
      document.getElementById('gen-placeholder').style.display = 'none';
      document.getElementById('gen-loading').style.display = 'block';
      document.getElementById('gen-results').style.display = 'none';

      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, model, apiKey, persona, difficulty, sourceIds, targetDeck, limit })
        });
        const data = await res.json();

        document.getElementById('gen-loading').style.display = 'none';
        document.getElementById('gen-results').style.display = 'flex';

        if (!res.ok || data.error) {
          document.getElementById('gen-status-badge').innerText = '🔴 Generation Failed';
          document.getElementById('gen-metrics-banner').style.background = 'rgba(244, 63, 94, 0.15)';
          document.getElementById('gen-metrics-banner').style.borderColor = 'var(--accent-rose, #f43f5e)';
          document.getElementById('gen-metrics-text').innerText = '❌ ' + (data.error || 'Failed to generate flashcards');
          document.getElementById('gen-cards-list').innerHTML = '<div style="color: var(--text-muted); padding: 12px 0;">Check that your AI provider is running / API key is valid.</div>';
        } else {
          document.getElementById('gen-status-badge').innerText = '🟢 Generation Complete';
          document.getElementById('gen-metrics-banner').style.background = 'rgba(99, 102, 241, 0.15)';
          document.getElementById('gen-metrics-banner').style.borderColor = 'var(--primary)';
          document.getElementById('gen-metrics-text').innerText = '✅ Created ' + (data.cardsCreated || 0) + ' new cards (' + (data.duplicatesSkipped || 0) + ' duplicates filtered, ' + (data.discardedUngrounded || 0) + ' ungrounded rejected)';

          const newCards = data.newCards || [];
          if (newCards.length === 0) {
            document.getElementById('gen-cards-list').innerHTML = '<div style="color: var(--text-muted); padding: 12px 0;">No new unique cards were generated (existing cards already cover these concepts or sources are empty).</div>';
          } else {
            let html = '';
            newCards.slice(0, 10).forEach(function(card) {
              html += '<div style="background: #0f172a; border: 1px solid var(--card-border); border-radius: 6px; padding: 12px;">' +
                '<div style="display: flex; justify-content: space-between; margin-bottom: 6px;">' +
                  '<span class="badge badge-diff">' + escapeHtml(card.targetDeck) + '</span>' +
                  '<span class="badge">' + escapeHtml(card.difficulty) + '</span>' +
                '</div>' +
                '<div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Q: ' + escapeHtml(card.question) + '</div>' +
                '<div style="color: var(--text-muted); font-size: 13px; margin-bottom: 6px;">A: ' + escapeHtml(card.answer) + '</div>' +
                '<div style="font-size: 12px; color: var(--accent); background: rgba(56, 189, 248, 0.08); padding: 4px 8px; border-radius: 4px;">💬 "' + escapeHtml(card.sourceQuote) + '"</div>' +
              '</div>';
            });
            document.getElementById('gen-cards-list').innerHTML = html;
          }
          loadStats();
        }
      } catch (err) {
        document.getElementById('gen-loading').style.display = 'none';
        document.getElementById('gen-results').style.display = 'flex';
        document.getElementById('gen-status-badge').innerText = '🔴 Error';
        document.getElementById('gen-metrics-banner').style.background = 'rgba(244, 63, 94, 0.15)';
        document.getElementById('gen-metrics-banner').style.borderColor = 'var(--accent-rose, #f43f5e)';
        document.getElementById('gen-metrics-text').innerText = '❌ Error: ' + err.message;
      } finally {
        btn.innerText = origText;
        btn.disabled = false;
      }
    }

    function openAddSourceModal() {
      document.getElementById('add-source-modal').style.display = 'flex';
    }

    function closeAddSourceModal() {
      document.getElementById('add-source-modal').style.display = 'none';
    }

    async function handleCreateSource(e) {
      e.preventDefault();
      const name = document.getElementById('src-name').value;
      const type = document.getElementById('src-type').value;
      const uri = document.getElementById('src-uri').value;
      const tagsStr = document.getElementById('src-tags').value;
      const tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];

      try {
        const res = await fetch('/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type, uri, tags, isActive: true })
        });
        if (res.ok) {
          closeAddSourceModal();
          loadSources();
          loadStats();
        } else {
          alert('Failed to add source');
        }
      } catch (err) {
        alert('Error adding source: ' + err.message);
      }
    }

    async function syncSingleSource(id) {
      try {
        const res = await fetch('/api/sync/' + id, { method: 'POST' });
        const result = await res.json();
        if (result.error) {
          alert('Sync warning: ' + result.error);
        } else {
          alert('✅ Synchronized! Ingested ' + result.newCount + ' new items.');
        }
        loadSources();
        loadStats();
      } catch (err) {
        alert('Sync error: ' + err.message);
      }
    }

    async function syncAllSources() {
      try {
        const res = await fetch('/api/sync', { method: 'POST' });
        const results = await res.json();
        alert('✅ Batch sync completed for ' + results.length + ' sources.');
        loadSources();
        loadStats();
      } catch (err) {
        alert('Sync error: ' + err.message);
      }
    }

    async function deleteSingleSource(id) {
      if (!confirm('Are you sure you want to delete this data source?')) return;
      try {
        const res = await fetch('/api/sources/' + id, { method: 'DELETE' });
        if (res.ok) {
          loadSources();
          loadStats();
        }
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    }

    loadStats();
  </script>
</body>
</html>`;
  }

  private sendJson(res: http.ServerResponse, statusCode: number, data: any): void {
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end(JSON.stringify(data));
  }

  private parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      if (req.complete || req.readableEnded || req.headers["content-length"] === "0") {
        return resolve({});
      }
      let body = "";
      req.on("data", (chunk) => { body += chunk.toString(); });
      req.on("end", () => {
        try {
          resolve(body.trim() ? JSON.parse(body) : {});
        } catch (err) {
          reject(new Error("Invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  }

  private readRequestBodyBuffer(req: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  private parseMultipartFormData(bodyBuffer: Buffer, boundary: string): { filename: string; content: Buffer } | null {
    const boundaryBuf = Buffer.from(`--${boundary}`);
    let startIdx = bodyBuffer.indexOf(boundaryBuf);
    if (startIdx === -1) return null;

    while (startIdx !== -1) {
      const nextStart = startIdx + boundaryBuf.length;
      if (bodyBuffer.subarray(nextStart, nextStart + 2).toString() === "--") {
        break;
      }

      let partStart = nextStart;
      if (bodyBuffer.subarray(partStart, partStart + 2).toString() === "\r\n") {
        partStart += 2;
      } else if (bodyBuffer[partStart] === 0x0a) {
        partStart += 1;
      }

      const nextBoundaryIdx = bodyBuffer.indexOf(boundaryBuf, partStart);
      if (nextBoundaryIdx === -1) break;

      const partBuffer = bodyBuffer.subarray(partStart, nextBoundaryIdx);

      let headerEndIdx = partBuffer.indexOf("\r\n\r\n");
      let bodyOffset = 4;
      if (headerEndIdx === -1) {
        headerEndIdx = partBuffer.indexOf("\n\n");
        bodyOffset = 2;
      }

      if (headerEndIdx !== -1) {
        const headerText = partBuffer.subarray(0, headerEndIdx).toString("utf-8");
        const cdMatch = headerText.match(/Content-Disposition:[^\r\n]*\sfilename=(?:"([^"]+)"|([^;\s\r\n]+))/i);
        if (cdMatch) {
          let filename = cdMatch[1] || cdMatch[2] || "";
          filename = filename.replace(/^["']|["']$/g, "").trim();

          let fileContent = partBuffer.subarray(headerEndIdx + bodyOffset);
          if (fileContent.length >= 2 && fileContent.subarray(fileContent.length - 2).toString() === "\r\n") {
            fileContent = fileContent.subarray(0, fileContent.length - 2);
          } else if (fileContent.length >= 1 && fileContent[fileContent.length - 1] === 0x0a) {
            fileContent = fileContent.subarray(0, fileContent.length - 1);
          }
          return { filename, content: Buffer.from(fileContent) };
        }
      }

      startIdx = nextBoundaryIdx;
    }
    return null;
  }

  async listen(port?: number): Promise<{ port: number; url: string }> {
    const listenPort = port !== undefined ? port : this.port;

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url || "/", true);
        const pathname = parsedUrl.pathname || "/";
        const method = req.method || "GET";

        if (method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          });
          res.end();
          return;
        }

        try {
          // 1. Static Asset / Svelte SPA Serving
          if (!pathname.startsWith("/api/")) {
            const currentDir = path.dirname(fileURLToPath(import.meta.url));
            const clientDistDir = path.resolve(currentDir, "client");

            const requestedFile = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
            const filePath = path.join(clientDistDir, requestedFile);

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

            // Fallback for SPA routing if dist/client/index.html exists
            const spaIndex = path.join(clientDistDir, "index.html");
            if (fs.existsSync(spaIndex)) {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end(fs.readFileSync(spaIndex));
              return;
            }

            // Fallback to embedded template if static client bundle is not yet built
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(this.getHtmlSpa());
            return;
          }

          // 2. Health Endpoint
          if (pathname === "/api/health" && method === "GET") {
            this.sendJson(res, 200, { status: "ok", version: "1.0.0" });
            return;
          }

          // 2b. Local Media Static Streaming Endpoint: GET /api/media/:filename
          if (pathname.startsWith("/api/media/") && method === "GET") {
            const rawFilename = pathname.slice("/api/media/".length);
            let filename = "";
            try {
              filename = decodeURIComponent(rawFilename);
            } catch {
              filename = rawFilename;
            }

            // Path traversal security checks
            if (
              !filename ||
              filename.includes("..") ||
              filename.includes("/") ||
              filename.includes("\\") ||
              filename.includes("\0")
            ) {
              this.sendJson(res, 400, { error: "Invalid media filename or path traversal detected" });
              return;
            }

            const sanitized = this.mediaService.sanitizeFilename(filename);
            let mediaPath = "";
            try {
              mediaPath = this.mediaService.getMediaPath(sanitized);
            } catch {
              this.sendJson(res, 400, { error: "Invalid media path" });
              return;
            }

            if (!fs.existsSync(mediaPath) || !fs.statSync(mediaPath).isFile()) {
              this.sendJson(res, 404, { error: "Media file not found" });
              return;
            }

            const stat = fs.statSync(mediaPath);
            const contentType = this.mediaService.detectMimeType(sanitized);

            res.writeHead(200, {
              "Content-Type": contentType,
              "Content-Length": stat.size,
              "Cache-Control": "public, max-age=31536000, immutable",
              "Access-Control-Allow-Origin": "*",
            });

            const stream = fs.createReadStream(mediaPath);
            stream.on("error", () => {
              if (!res.headersSent) {
                this.sendJson(res, 500, { error: "Failed to stream media file" });
              }
            });
            stream.pipe(res);
            return;
          }

          // =======================================================
          // BACKGROUND JOBS & SSE REAL-TIME STREAMING
          // =======================================================

          // 2c. Global Job Events SSE Stream: GET /api/jobs/stream
          if (pathname === "/api/jobs/stream" && method === "GET") {
            if (!this.jobManager) {
              this.sendJson(res, 503, { error: "JobManager not configured on this server" });
              return;
            }

            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive",
              "Access-Control-Allow-Origin": "*",
              "X-Accel-Buffering": "no",
            });

            res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected", timestamp: new Date().toISOString() })}\n\n`);

            const onCreated = (job: any) => {
              res.write(`event: job_created\ndata: ${JSON.stringify(job)}\n\n`);
            };
            const onStatus = (job: any) => {
              res.write(`event: job_status\ndata: ${JSON.stringify(job)}\n\n`);
            };
            const onProgress = (data: any) => {
              res.write(`event: job_progress\ndata: ${JSON.stringify(data)}\n\n`);
            };
            const onLog = (log: any) => {
              res.write(`event: job_log\ndata: ${JSON.stringify(log)}\n\n`);
            };
            const onCompleted = (job: any) => {
              res.write(`event: job_completed\ndata: ${JSON.stringify(job)}\n\n`);
            };
            const onFailed = (job: any) => {
              res.write(`event: job_failed\ndata: ${JSON.stringify(job)}\n\n`);
            };
            const onCancelled = (job: any) => {
              res.write(`event: job_cancelled\ndata: ${JSON.stringify(job)}\n\n`);
            };
            const onCard = (cardData: any) => {
              res.write(`event: card_created\ndata: ${JSON.stringify(cardData)}\n\n`);
            };

            this.jobManager.on("job_created", onCreated);
            this.jobManager.on("job_status", onStatus);
            this.jobManager.on("job_progress", onProgress);
            this.jobManager.on("job_log", onLog);
            this.jobManager.on("job_completed", onCompleted);
            this.jobManager.on("job_failed", onFailed);
            this.jobManager.on("job_cancelled", onCancelled);
            this.jobManager.on("card_created", onCard);

            const heartbeat = setInterval(() => {
              res.write(": ping\n\n");
            }, 15000);

            req.on("close", () => {
              clearInterval(heartbeat);
              if (this.jobManager) {
                this.jobManager.off("job_created", onCreated);
                this.jobManager.off("job_status", onStatus);
                this.jobManager.off("job_progress", onProgress);
                this.jobManager.off("job_log", onLog);
                this.jobManager.off("job_completed", onCompleted);
                this.jobManager.off("job_failed", onFailed);
                this.jobManager.off("job_cancelled", onCancelled);
                this.jobManager.off("card_created", onCard);
              }
            });
            return;
          }

          // 2d. Step-by-Step Job Logs SSE Stream: GET /api/jobs/:id/logs/stream
          const jobLogsStreamMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/logs\/stream$/);
          if (jobLogsStreamMatch && method === "GET") {
            const jobId = jobLogsStreamMatch[1];
            if (!this.jobManager) {
              this.sendJson(res, 503, { error: "JobManager not configured on this server" });
              return;
            }

            const job = this.jobManager.getJob(jobId);
            if (!job) {
              this.sendJson(res, 404, { error: `Job with ID "${jobId}" not found` });
              return;
            }

            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "Connection": "keep-alive",
              "Access-Control-Allow-Origin": "*",
              "X-Accel-Buffering": "no",
            });

            res.write(`event: connected\ndata: ${JSON.stringify({ jobId, status: job.status })}\n\n`);

            // Replay existing logs
            const existingLogs = this.jobManager.getJobLogs(jobId);
            for (const log of existingLogs) {
              res.write(`event: job_log\ndata: ${JSON.stringify(log)}\n\n`);
            }

            const onLog = (log: any) => {
              if (log.jobId === jobId) {
                res.write(`event: job_log\ndata: ${JSON.stringify(log)}\n\n`);
              }
            };
            const onStatus = (j: any) => {
              if (j.id === jobId) {
                res.write(`event: job_status\ndata: ${JSON.stringify(j)}\n\n`);
              }
            };
            const onCard = (cardData: any) => {
              if (cardData.jobId === jobId) {
                res.write(`event: card_created\ndata: ${JSON.stringify(cardData)}\n\n`);
              }
            };

            this.jobManager.on("job_log", onLog);
            this.jobManager.on("job_status", onStatus);
            this.jobManager.on("card_created", onCard);

            const heartbeat = setInterval(() => {
              res.write(": ping\n\n");
            }, 15000);

            req.on("close", () => {
              clearInterval(heartbeat);
              if (this.jobManager) {
                this.jobManager.off("job_log", onLog);
                this.jobManager.off("job_status", onStatus);
                this.jobManager.off("card_created", onCard);
              }
            });
            return;
          }

          // 2e. Cancel Job: POST /api/jobs/:id/cancel
          const jobCancelMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/cancel$/);
          if (jobCancelMatch && method === "POST") {
            const jobId = jobCancelMatch[1];
            if (!this.jobManager) {
              this.sendJson(res, 503, { error: "JobManager not configured" });
              return;
            }
            const existing = this.jobManager.getJob(jobId);
            if (!existing) {
              this.sendJson(res, 404, { error: `Job with ID "${jobId}" not found` });
              return;
            }
            const cancelled = this.jobManager.cancelJob(jobId);
            const updated = this.jobManager.getJob(jobId);
            this.sendJson(res, 200, { success: true, cancelled, job: updated });
            return;
          }

          // 2f. Clear / Prune History: DELETE /api/jobs/history or POST /api/jobs/history
          if (pathname === "/api/jobs/history" && (method === "DELETE" || method === "POST")) {
            if (!this.jobManager) {
              this.sendJson(res, 503, { error: "JobManager not configured" });
              return;
            }
            const keepLastNStr = parsedUrl.query.keepLastN as string | undefined;
            const keepLastN = keepLastNStr ? parseInt(keepLastNStr, 10) : undefined;

            let deletedCount = 0;
            if (typeof keepLastN === "number" && !isNaN(keepLastN)) {
              deletedCount = this.jobManager.pruneJobs({ keepLastN });
            } else {
              deletedCount = this.jobManager.clearHistory();
            }
            this.sendJson(res, 200, { success: true, deletedCount });
            return;
          }

          // 2g. List Jobs: GET /api/jobs
          if (pathname === "/api/jobs" && method === "GET") {
            if (!this.jobManager) {
              this.sendJson(res, 200, []);
              return;
            }
            const status = parsedUrl.query.status as any;
            const type = parsedUrl.query.type as any;
            const limitStr = parsedUrl.query.limit as string;
            const limit = limitStr ? parseInt(limitStr, 10) : undefined;

            const jobs = this.jobManager.listJobs({ status, type, limit });
            this.sendJson(res, 200, jobs);
            return;
          }

          // 2h. Get Single Job Details with Logs: GET /api/jobs/:id
          const singleJobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
          if (
            singleJobMatch &&
            method === "GET" &&
            !pathname.endsWith("/stream") &&
            !pathname.endsWith("/history")
          ) {
            const jobId = singleJobMatch[1];
            if (!this.jobManager) {
              this.sendJson(res, 404, { error: "JobManager not configured" });
              return;
            }
            const job = this.jobManager.getJob(jobId);
            if (!job) {
              this.sendJson(res, 404, { error: `Job with ID "${jobId}" not found` });
              return;
            }
            const logs = this.jobManager.getJobLogs(jobId);
            this.sendJson(res, 200, { job, logs });
            return;
          }

          // 3. Stats Endpoint
          if (pathname === "/api/stats" && method === "GET") {
            const sources = this.options.sourceRepo.list();
            const cards = this.options.cardRepo.list();
            const decks = this.options.cardRepo.listDecks();

            this.sendJson(res, 200, {
              totalCards: cards.length,
              totalSources: sources.length,
              activeSources: sources.filter((s) => s.isActive).length,
              totalDecks: decks.length,
              decks,
              recentCards: cards.slice(0, 10),
            });
            return;
          }

          // 4. Single Source Sync Endpoint: POST /api/sync/:id
          if (pathname.startsWith("/api/sync/") && method === "POST") {
            const sourceId = pathname.slice("/api/sync/".length);
            const source = this.options.sourceRepo.getById(sourceId);
            if (!source) {
              this.sendJson(res, 404, { error: `Source "${sourceId}" not found` });
              return;
            }

            const body = await this.parseBody(req).catch(() => ({}));
            let slicing: DocumentSlicingOptions | undefined = body?.slicing;
            if (typeof slicing === "string") {
              try {
                slicing = JSON.parse(slicing);
              } catch {
                slicing = { mode: slicing as any };
              }
            } else if (!slicing && typeof parsedUrl.query.slicing === "string") {
              try {
                slicing = JSON.parse(parsedUrl.query.slicing);
              } catch {
                slicing = { mode: parsedUrl.query.slicing as any };
              }
            }

            if (this.jobManager && parsedUrl.query.sync !== "true") {
              const job = await this.jobManager.enqueueJob(
                "sync_source",
                `Sync source: ${source.name}`,
                { sourceId, sourceName: source.name, slicing },
                async (_j, ctx) => {
                  const explicitTimeout = typeof (slicing as any)?.timeoutMs === "number" && (slicing as any).timeoutMs >= 0 ? (slicing as any).timeoutMs : undefined;
                  const syncTimeoutMs = explicitTimeout !== undefined
                    ? explicitTimeout
                    : (this.options.defaultTaskTimeoutMs ?? 1_800_000);
                  return await this.workerExecutor.executeTask(
                    {
                      type: "sync_source",
                      payload: { sources: [source], slicing, timeoutMs: syncTimeoutMs },
                    },
                    ctx
                  );
                },
                1
              );
              this.sendJson(res, 202, {
                success: true,
                jobId: job.id,
                status: job.status,
                title: job.title,
              });
              return;
            }

            if (this.options.ingestionService) {
              const syncRes = await this.options.ingestionService.syncSource(sourceId, { slicing });
              this.sendJson(res, syncRes.error && syncRes.totalFetched === 0 ? 404 : 200, syncRes);
            } else {
              this.sendJson(res, 200, { sourceId, newCount: 0, totalFetched: 0 });
            }
            return;
          }

          // 5. Bulk Sync Endpoint: POST /api/sync
          if (pathname === "/api/sync" && method === "POST") {
            const activeSources = this.options.sourceRepo.list().filter((s) => s.isActive);

            const body = await this.parseBody(req).catch(() => ({}));
            let slicing: DocumentSlicingOptions | undefined = body?.slicing;
            if (typeof slicing === "string") {
              try {
                slicing = JSON.parse(slicing);
              } catch {
                slicing = { mode: slicing as any };
              }
            } else if (!slicing && typeof parsedUrl.query.slicing === "string") {
              try {
                slicing = JSON.parse(parsedUrl.query.slicing);
              } catch {
                slicing = { mode: parsedUrl.query.slicing as any };
              }
            }

            if (this.jobManager && parsedUrl.query.sync !== "true") {
              const job = await this.jobManager.enqueueJob(
                "sync_all",
                `Sync all sources (${activeSources.length} active)`,
                { sourceCount: activeSources.length, slicing },
                async (_j, ctx) => {
                  const explicitTimeout = typeof (slicing as any)?.timeoutMs === "number" && (slicing as any).timeoutMs >= 0 ? (slicing as any).timeoutMs : undefined;
                  const syncTimeoutMs = explicitTimeout !== undefined
                    ? explicitTimeout
                    : Math.max(
                        this.options.defaultTaskTimeoutMs ?? 1_800_000,
                        (activeSources.length || 1) * 10 * 60 * 1000
                      );
                  return await this.workerExecutor.executeTask(
                    {
                      type: "sync_all",
                      payload: { sources: activeSources, slicing, timeoutMs: syncTimeoutMs },
                    },
                    ctx
                  );
                },
                activeSources.length || 1
              );
              this.sendJson(res, 202, {
                success: true,
                jobId: job.id,
                status: job.status,
                title: job.title,
              });
              return;
            }

            if (this.options.ingestionService) {
              const syncResults = await this.options.ingestionService.syncAllActive({ slicing });
              this.sendJson(res, 200, syncResults);
            } else {
              this.sendJson(res, 200, []);
            }
            return;
          }

          // 6. Generation Endpoint: POST /api/generate
          if (pathname === "/api/generate" && method === "POST") {
            const body = await this.parseBody(req);
            const provider = typeof body.provider === "string" && body.provider.trim().length > 0 ? body.provider.trim().toLowerCase() : "ollama";
            const model = body.model || undefined;

            // Resolve credentials: manual body override > SettingsService (DB > Env)
            const rawKey = typeof body.apiKey === "string" && body.apiKey.trim().length > 0 ? body.apiKey.trim() : undefined;
            const apiKey = rawKey || this.settingsService.getSecret(provider as any) || undefined;

            const rawEndpoint = typeof body.endpoint === "string" && body.endpoint.trim().length > 0 ? body.endpoint.trim() : undefined;
            const baseUrl = rawEndpoint || this.settingsService.getEndpoint(provider as any) || undefined;

            // Enforce credential requirements for cloud LLM providers (exempting local endpoints)
            const isLocalOpenAI = provider === "openai" && typeof baseUrl === "string" && (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1") || baseUrl.includes("::1"));
            if (["openai", "anthropic", "gemini"].includes(provider) && !apiKey && !isLocalOpenAI) {
              this.sendJson(res, 400, {
                error: `No API key configured for ${provider}. Please provide an API key or configure it in Settings.`,
              });
              return;
            }

            const persona = (body.persona as PersonaType) || "socratic-mentor";
            const difficulty = (body.difficulty as DifficultyLevel) || "intermediate";
            const depthMode = (body.depthMode as CardDepthMode) || "atomic";
            const chunkMultiplier = typeof body.chunkMultiplier === "number" ? body.chunkMultiplier : 1;
            const fullDocument = body.fullDocument === true || chunkMultiplier === 0;
            const targetDeckOverride = body.targetDeck || undefined;
            const limit = typeof body.limit === "number" ? body.limit : 5;
            const enforceGrounding = body.enforceGrounding !== false;

            if (this.jobManager && parsedUrl.query.sync !== "true") {
              const documents: Array<{
                id: string;
                sourceId: string;
                title: string;
                textContent: string;
                originUrl?: string;
                startPage?: number | null;
                endPage?: number | null;
              }> = [];

              if (Array.isArray(body.documentIds) && body.documentIds.length > 0 && this.options.documentRepo) {
                for (const docId of body.documentIds) {
                  const doc = this.options.documentRepo.getById(docId);
                  if (doc) {
                    documents.push({
                      id: doc.id,
                      sourceId: doc.sourceId,
                      title: doc.title,
                      textContent: doc.textContent,
                      originUrl: doc.url || undefined,
                      startPage: doc.startPage ?? null,
                      endPage: doc.endPage ?? null,
                    });
                  }
                }
              } else {
                let sources: any[] = [];
                if (Array.isArray(body.sourceIds) && body.sourceIds.length > 0) {
                  sources = body.sourceIds.map((id: string) => this.options.sourceRepo.getById(id)).filter(Boolean);
                } else if (body.sourceId) {
                  const s = this.options.sourceRepo.getById(body.sourceId);
                  if (s) sources = [s];
                } else {
                  sources = this.options.sourceRepo.list().filter((s) => s.isActive);
                }

                if (this.options.documentRepo) {
                  for (const s of sources) {
                    const docs = this.options.documentRepo.listBySourceId(s.id);
                    for (const doc of docs) {
                      documents.push({
                        id: doc.id,
                        sourceId: doc.sourceId,
                        title: doc.title,
                        textContent: doc.textContent,
                        originUrl: doc.url || undefined,
                        startPage: doc.startPage ?? null,
                        endPage: doc.endPage ?? null,
                      });
                    }
                  }
                }
              }

              const docCount = documents.length || 1;
              const job = await this.jobManager.enqueueJob(
                "generation",
                `Synthesize flashcards (${docCount} doc${docCount === 1 ? "" : "s"})`,
                {
                  documentCount: documents.length,
                  provider,
                  model,
                  persona,
                  difficulty,
                  targetDeck: targetDeckOverride,
                },
                async (_j, ctx) => {
                  const explicitTimeout = typeof body?.timeoutMs === "number" && body.timeoutMs >= 0 ? body.timeoutMs : undefined;
                  const dynamicTimeoutMs = explicitTimeout !== undefined
                    ? explicitTimeout
                    : Math.max(
                        this.options.defaultTaskTimeoutMs ?? 3_600_000,
                        docCount * 3 * 60 * 1000 // 3 minutes per document
                      );
                  return await this.workerExecutor.executeTask(
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
                    ctx
                  );
                },
                docCount
              );

              this.sendJson(res, 202, {
                success: true,
                jobId: job.id,
                status: job.status,
                title: job.title,
              });
              return;
            }

            try {
              const createLLMFn = this.options.createLLMAdapterFn || createLLMAdapter;
              const llm = createLLMFn({
                provider,
                model,
                apiKey,
                baseUrl,
                timeoutMs: typeof body?.timeoutMs === "number" && body.timeoutMs > 0 ? body.timeoutMs : undefined,
              });
              const genService = new CardGenerationService(
                llm,
                undefined,
                this.options.promptBuilder,
                this.options.groundingGuard
              );

              const createdCards: any[] = [];
              let totalDrafts = 0;
              let totalDuplicates = 0;

              if (Array.isArray(body.documentIds) && body.documentIds.length > 0 && this.options.documentRepo) {
                for (const docId of body.documentIds) {
                  const doc = this.options.documentRepo.getById(docId);
                  if (!doc) continue;
                  const parentSource = this.options.sourceRepo.getById(doc.sourceId);
                  const cleanDoc = {
                    id: doc.id,
                    sourceId: doc.sourceId,
                    title: doc.title,
                    textContent: doc.textContent,
                    originUrl: doc.url || undefined,
                    contentHash: doc.contentHash || "",
                    startPage: doc.startPage ?? null,
                    endPage: doc.endPage ?? null,
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
                  const existingCards = this.options.cardRepo.list({ targetDeck });
                  const dedupResult = this.options.dedupService
                    ? this.options.dedupService.filterUnique(drafts, existingCards)
                    : { unique: drafts, duplicates: [] };

                  totalDuplicates += dedupResult.duplicates.length;

                  for (const draft of dedupResult.unique as any[]) {
                    const card = this.options.cardRepo.create({
                      sourceId: doc.sourceId,
                      question: draft.question,
                      answer: draft.answer,
                      sourceQuote: draft.sourceQuote,
                      sourceOriginUrl: draft.originUrl || doc.url || (parentSource?.type === "web" || parentSource?.type === "rss" || parentSource?.type === "sitemap" || parentSource?.type === "llms-txt" ? parentSource.uri : null),
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
              } else {
                let sources: any[] = [];
                if (Array.isArray(body.sourceIds) && body.sourceIds.length > 0) {
                  sources = body.sourceIds.map((id: string) => this.options.sourceRepo.getById(id)).filter(Boolean);
                } else if (body.sourceId) {
                  const s = this.options.sourceRepo.getById(body.sourceId);
                  if (s) sources = [s];
                } else {
                  sources = this.options.sourceRepo.list().filter((s) => s.isActive);
                }

                if (sources.length === 0) {
                  this.sendJson(res, 400, { error: "No active data sources found to generate cards from." });
                  return;
                }

                for (const s of sources) {
                  if (!s) continue;
                  const strategy = this.options.strategyRegistry
                    ? this.options.strategyRegistry.getStrategy(s.type)
                    : undefined;

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
                    const existingCards = this.options.cardRepo.list({ targetDeck });
                    const dedupResult = this.options.dedupService
                      ? this.options.dedupService.filterUnique(drafts, existingCards)
                      : { unique: drafts, duplicates: [] };

                    totalDuplicates += dedupResult.duplicates.length;

                    for (const draft of dedupResult.unique as any[]) {
                      const card = this.options.cardRepo.create({
                        sourceId: s.id,
                        question: draft.question,
                        answer: draft.answer,
                        sourceQuote: draft.sourceQuote,
                        sourceOriginUrl: draft.originUrl || (s.type === "web" || s.type === "rss" || s.type === "sitemap" || s.type === "llms-txt" ? s.uri : null),
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

              this.sendJson(res, 200, {
                success: true,
                cardsCreated: createdCards.length,
                totalDraftsGenerated: totalDrafts,
                duplicatesSkipped: totalDuplicates,
                newCards: createdCards,
              });
            } catch (err: any) {
              this.sendJson(res, 500, { error: err.message || "Failed to generate cards" });
            }
            return;
          }

          // 6. Sources CRUD Endpoints
          if (pathname === "/api/sources") {
            if (method === "GET") {
              const sources = this.options.sourceRepo.list();
              this.sendJson(res, 200, sources);
              return;
            }

            if (method === "POST") {
              const body = await this.parseBody(req);
              const created = this.options.sourceRepo.create(body);
              this.sendJson(res, 201, created);
              return;
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
                this.sendJson(res, 400, { error: "Missing multipart boundary in Content-Type header" });
                return;
              }
              const rawBody = await this.readRequestBodyBuffer(req);
              const parsed = this.parseMultipartFormData(rawBody, boundary);
              if (!parsed || !parsed.filename) {
                this.sendJson(res, 400, { error: "No file provided in multipart upload" });
                return;
              }
              filename = parsed.filename;
              fileBuffer = parsed.content;
            } else if (contentType.includes("application/json")) {
              const json = await this.parseBody(req);
              filename = json.filename;
              if (json.content !== undefined) {
                fileBuffer = Buffer.from(json.content, "utf-8");
              }
            } else {
              // Direct raw stream/buffer
              const rawBody = await this.readRequestBodyBuffer(req);
              const cdHeader = req.headers["content-disposition"] || "";
              const cdMatch = cdHeader.match(/filename=(?:"([^"]+)"|([^;\s\r\n]+))/i);
              const rawFilename =
                (req.headers["x-filename"] as string) ||
                (parsedUrl.query.filename as string) ||
                (cdMatch ? cdMatch[1] || cdMatch[2] : undefined);

              if (rawFilename) {
                filename = rawFilename;
                fileBuffer = rawBody;
              }
            }

            if (!filename || fileBuffer === undefined) {
              this.sendJson(res, 400, { error: "No file content or filename provided" });
              return;
            }

            // Reject null bytes
            if (filename.includes("\0")) {
              this.sendJson(res, 400, { error: "Invalid filename" });
              return;
            }

            // Extract base name, removing any directory components
            const splitParts = filename.split(/[/\\]/);
            const base = splitParts[splitParts.length - 1].trim();
            const safeFilename = path.basename(base).replace(/[/\\?%*:|"<>]/g, "_").trim();

            if (!safeFilename || safeFilename === "." || safeFilename === ".." || safeFilename.length === 0) {
              this.sendJson(res, 400, { error: "Invalid filename" });
              return;
            }

            // Validate file extension
            const ext = path.extname(safeFilename).toLowerCase();
            if (ext === ".doc") {
              this.sendJson(res, 400, {
                error: "Legacy pre-2007 Word (.doc) files are not supported. Please convert to .docx or .pdf before uploading.",
              });
              return;
            }

            const ALLOWED_EXTS = [".md", ".markdown", ".txt", ".pdf", ".docx"];
            if (!ALLOWED_EXTS.includes(ext)) {
              this.sendJson(res, 400, {
                error: `Unsupported file type "${ext}". Only .md, .markdown, .txt, .pdf, and .docx files are supported.`,
              });
              return;
            }

            // Check for legacy OLE binary magic bytes (0xD0CF11E0) spoofed as .docx or other extensions
            if (
              fileBuffer.length >= 4 &&
              fileBuffer[0] === 0xd0 &&
              fileBuffer[1] === 0xcf &&
              fileBuffer[2] === 0x11 &&
              fileBuffer[3] === 0xe0
            ) {
              this.sendJson(res, 400, {
                error: "Legacy binary Word (.doc) format detected via file signature. Please convert to .docx or .pdf before uploading.",
              });
              return;
            }

            // Ensure storage directory exists
            fs.mkdirSync(this.localFilesDir, { recursive: true });
            const targetFilePath = path.resolve(this.localFilesDir, safeFilename);

            // Verify target path stays strictly inside localFilesDir
            const resolvedDir = path.resolve(this.localFilesDir);
            if (!targetFilePath.startsWith(resolvedDir)) {
              this.sendJson(res, 400, { error: "Path traversal detected" });
              return;
            }

            fs.writeFileSync(targetFilePath, fileBuffer);

            this.sendJson(res, 200, {
              path: targetFilePath,
              filename: safeFilename,
              size: fileBuffer.length,
            });
            return;
          }

          // 6b. Discovered Documents Catalog for a Source: GET /api/sources/:id/documents
          const sourceDocsMatch = pathname.match(/^\/api\/sources\/([^/]+)\/documents$/);
          if (sourceDocsMatch && method === "GET") {
            const sourceId = sourceDocsMatch[1];
            const search = parsedUrl.query.search as string | undefined;
            if (!this.options.documentRepo) {
              this.sendJson(res, 200, { documents: [], total: 0 });
              return;
            }
            const docs = this.options.documentRepo.listBySourceId(sourceId, { search });
            const allSourceCards = this.options.cardRepo.list({ sourceId });
            const enrichedDocs = docs.map((doc) => {
              const cardCount = allSourceCards.filter(
                (c) =>
                  (c.documentTitle && c.documentTitle.toLowerCase() === doc.title.toLowerCase()) ||
                  (c.sourceOriginUrl && doc.url && c.sourceOriginUrl === doc.url)
              ).length;
              return {
                ...doc,
                textContent: doc.textContent && doc.textContent.length > 2000 ? doc.textContent.slice(0, 2000) : (doc.textContent || ""),
                cardCount,
              };
            });
            this.sendJson(res, 200, { documents: enrichedDocs, total: enrichedDocs.length });
            return;
          }

          // 6c. All Discovered Documents Catalog: GET /api/documents
          if (pathname === "/api/documents" && method === "GET") {
            const search = parsedUrl.query.search as string | undefined;
            const sourceId = parsedUrl.query.sourceId as string | undefined;
            if (!this.options.documentRepo) {
              this.sendJson(res, 200, { documents: [], total: 0 });
              return;
            }
            const docs = sourceId
              ? this.options.documentRepo.listBySourceId(sourceId, { search })
              : this.options.documentRepo.listAll({ search });
            const allCards = this.options.cardRepo.list(sourceId ? { sourceId } : undefined);
            const enrichedDocs = docs.map((doc) => {
              const cardCount = allCards.filter(
                (c) =>
                  (c.documentTitle && c.documentTitle.toLowerCase() === doc.title.toLowerCase()) ||
                  (c.sourceOriginUrl && doc.url && c.sourceOriginUrl === doc.url)
              ).length;
              return {
                ...doc,
                textContent: doc.textContent && doc.textContent.length > 2000 ? doc.textContent.slice(0, 2000) : (doc.textContent || ""),
                cardCount,
              };
            });
            this.sendJson(res, 200, { documents: enrichedDocs, total: enrichedDocs.length });
            return;
          }

          // 6d. Bulk Discovered Documents Delete: POST /api/documents/bulk-delete
          if (pathname === "/api/documents/bulk-delete" && (method === "POST" || method === "DELETE")) {
            if (!this.options.documentRepo) {
              this.sendJson(res, 200, { success: true, deletedCount: 0 });
              return;
            }
            const body = await this.parseBody(req);
            const ids = Array.isArray(body?.ids) ? body.ids : [];
            const deletedCount = this.options.documentRepo.deleteMany(ids);
            this.sendJson(res, 200, { success: true, deletedCount });
            return;
          }

          // 6d. Discovered Documents Knowledge Base Export: POST or GET /api/documents/export
          if (pathname === "/api/documents/export" && (method === "POST" || method === "GET")) {
            if (!this.options.documentRepo) {
              this.sendJson(res, 400, { error: "Document repository is not configured on this server." });
              return;
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

            if (method === "POST") {
              body = await this.parseBody(req);
              sourceId = body?.sourceId;
              ids = Array.isArray(body?.ids) ? body.ids : undefined;
              if (body?.format) format = body.format;
              if (body?.mode) mode = body.mode;
              if (body?.includeTableOfContents !== undefined) includeTableOfContents = body.includeTableOfContents;
              if (body?.includeCitations !== undefined) includeCitations = body.includeCitations;
              if (body?.imageQuality) imageQuality = body.imageQuality;
              if (body?.grayscale !== undefined) grayscale = Boolean(body.grayscale);
            } else {
              const query = parsedUrl.query;
              sourceId = (query.sourceId as string) || (query.source as string) || undefined;
              if (query.ids) {
                ids = typeof query.ids === "string" ? query.ids.split(",") : Array.isArray(query.ids) ? query.ids : undefined;
              }
              if (query.format) format = query.format as string;
              if (query.mode) mode = query.mode as string;
              if (query.toc !== undefined) includeTableOfContents = query.toc !== "false" && query.toc !== "0";
              if (query.citations !== undefined) includeCitations = query.citations !== "false" && query.citations !== "0";
              if (query.quality || query.imageQuality) imageQuality = ((query.quality || query.imageQuality) as any);
              if (query.grayscale !== undefined) grayscale = query.grayscale === "true" || query.grayscale === "1";
            }

            if (format === "epub") {
              mode = "merged";
            }

            let targetDocs: DiscoveredDocument[] = [];
            let sourceName = "Knowledge Base";

            if (Array.isArray(ids) && ids.length > 0) {
              targetDocs = this.options.documentRepo.getByIds(ids);
              if (sourceId) {
                const src = this.options.sourceRepo.getById(sourceId);
                if (src) sourceName = src.name;
              } else if (targetDocs.length > 0 && targetDocs[0].sourceId) {
                const src = this.options.sourceRepo.getById(targetDocs[0].sourceId);
                if (src) sourceName = src.name;
              }
            } else if (sourceId && typeof sourceId === "string") {
              targetDocs = this.options.documentRepo.listBySourceId(sourceId);
              const src = this.options.sourceRepo.getById(sourceId);
              if (src) sourceName = src.name;
            } else {
              targetDocs = this.options.documentRepo.listAll();
            }

            if (targetDocs.length === 0) {
              const msg = sourceId
                ? `No documents found to export for source "${sourceName}". Please sync the data source first to ingest articles.`
                : "No documents found to export in the knowledge base.";
              this.sendJson(res, 404, { error: msg });
              return;
            }

            if (this.jobManager && (method === "POST" ? (body?.async === true || parsedUrl.query.async === "true") : parsedUrl.query.async === "true")) {
              const job = await this.jobManager.enqueueJob(
                "export",
                `Export ${targetDocs.length} document(s) (${format.toUpperCase()})`,
                { format, documentCount: targetDocs.length, sourceName, mode },
                async (_j, ctx) => {
                  return await this.workerExecutor.executeTask(
                    {
                      type: "export",
                      payload: {
                        exportKind: "documents",
                        format,
                        mode: mode as any,
                        sourceName,
                        documents: targetDocs,
                      },
                    },
                    ctx
                  );
                },
                1
              );
              this.sendJson(res, 202, {
                success: true,
                jobId: job.id,
                status: job.status,
                title: job.title,
              });
              return;
            }

            const docExporter = new DocumentExportService(this.mediaService);
            const exportResult = await docExporter.export(targetDocs, {
              format: format as any,
              mode: mode as any,
              sourceName,
              includeTableOfContents: includeTableOfContents !== false,
              includeCitations: includeCitations !== false,
              imageQuality,
              grayscale,
            });

            const contentBuffer = Buffer.isBuffer(exportResult.content)
              ? exportResult.content
              : Buffer.from(exportResult.content as string, "utf-8");

            res.writeHead(200, {
              "Content-Type": exportResult.mimeType,
              "Content-Disposition": `attachment; filename="${exportResult.filename}"`,
              "Content-Length": contentBuffer.length,
            });
            res.end(contentBuffer);
            return;
          }

          // 6e. Single Discovered Document: GET /api/documents/:id & DELETE /api/documents/:id
          if (
            pathname.startsWith("/api/documents/") &&
            pathname !== "/api/documents/export" &&
            pathname !== "/api/documents/bulk-delete"
          ) {
            let docId = pathname.slice("/api/documents/".length);
            try {
              docId = decodeURIComponent(docId);
            } catch {}
            if (!this.options.documentRepo) {
              this.sendJson(res, 404, { error: "Document not found" });
              return;
            }

            if (method === "GET") {
              const doc = this.options.documentRepo.getById(docId);
              if (!doc) {
                this.sendJson(res, 404, { error: `Document with ID ${docId} not found` });
                return;
              }
              this.sendJson(res, 200, { document: doc });
              return;
            }

            if (method === "DELETE") {
              const deleted = this.options.documentRepo.deleteById(docId);
              this.sendJson(res, deleted ? 200 : 404, { success: deleted });
              return;
            }
          }

          // 7. Single Source Update (PATCH) / Delete (DELETE): /api/sources/:id
          if (pathname.startsWith("/api/sources/") && pathname !== "/api/sources/upload") {
            let id = pathname.slice("/api/sources/".length);
            try {
              id = decodeURIComponent(id);
            } catch {}

            if (method === "DELETE") {
              try {
                const deleted = this.options.sourceRepo.delete(id);
                this.sendJson(res, deleted ? 200 : 404, { success: deleted });
              } catch (err: any) {
                this.sendJson(res, 500, { error: err.message || "Failed to delete source" });
              }
              return;
            }

            if (method === "PATCH" || method === "PUT") {
              try {
                const body = await this.parseBody(req);
                const updated = this.options.sourceRepo.update(id, body);
                this.sendJson(res, updated ? 200 : 404, updated || { error: "Source not found" });
              } catch (err: any) {
                this.sendJson(res, 500, { error: err.message || "Failed to update source" });
              }
              return;
            }
          }

          // 8. Canonical Bulk Card Delete Endpoint: POST /api/cards/bulk-delete
          if (pathname === "/api/cards/bulk-delete" && (method === "POST" || method === "DELETE")) {
            const body = await this.parseBody(req);
            const ids = Array.isArray(body.ids) ? body.ids : [];
            const deletedCount = this.options.cardRepo.deleteMany(ids);
            this.sendJson(res, 200, { success: true, deletedCount });
            return;
          }

          // 8b. Single Card Update (PATCH) / Delete (DELETE) / Get (GET): /api/cards/:id
          if (pathname.startsWith("/api/cards/") && pathname !== "/api/cards") {
            const id = pathname.slice("/api/cards/".length);

            if (method === "GET") {
              const card = this.options.cardRepo.getById(id);
              this.sendJson(res, card ? 200 : 404, card || { error: "Card not found" });
              return;
            }

            if (method === "DELETE") {
              const deleted = this.options.cardRepo.delete(id);
              this.sendJson(res, deleted ? 200 : 404, { success: deleted });
              return;
            }

            if (method === "PATCH" || method === "PUT") {
              const body = await this.parseBody(req);
              const updated = this.options.cardRepo.update(id, body);
              this.sendJson(res, updated ? 200 : 404, updated || { error: "Card not found" });
              return;
            }
          }

          // 9. Cards List Endpoint: /api/cards
          if (pathname === "/api/cards" && method === "GET") {
            const query = parsedUrl.query;
            const filter: CardFilter = {
              targetDeck: query.deck as string,
              tag: query.tag as string,
              difficulty: query.difficulty as any,
              sourceId: query.sourceId as string,
              search: query.search as string,
            };
            const cards = this.options.cardRepo.list(filter);
            this.sendJson(res, 200, cards);
            return;
          }

          // 10. Decks Endpoint
          if (pathname === "/api/decks" && method === "GET") {
            const decks = this.options.cardRepo.listDecks();
            this.sendJson(res, 200, decks);
            return;
          }

          // 11. Tags Endpoint
          if (pathname === "/api/tags" && method === "GET") {
            const tags = this.options.cardRepo.listTags ? this.options.cardRepo.listTags() : [];
            this.sendJson(res, 200, tags);
            return;
          }

          // 12. AnkiConnect Status Endpoint: GET /api/ankiconnect/status
          if (pathname === "/api/ankiconnect/status" && method === "GET") {
            if (this.options.ankiConnectAdapter) {
              const health = await this.options.ankiConnectAdapter.checkHealth();
              this.sendJson(res, 200, health);
            } else {
              try {
                const checkRes = await fetch("http://127.0.0.1:8765", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "version", version: 6 }),
                  signal: AbortSignal.timeout(2000),
                });
                const data = (await checkRes.json()) as any;
                this.sendJson(res, 200, { isOnline: !data.error, version: data.result || 6 });
              } catch {
                this.sendJson(res, 200, { isOnline: false, error: "AnkiConnect unreachable" });
              }
            }
            return;
          }

          // 13. AnkiConnect Sync Endpoint: POST /api/ankiconnect/sync
          if (pathname === "/api/ankiconnect/sync" && method === "POST") {
            const body = await this.parseBody(req);
            const filter: CardFilter = {
              targetDeck: body.targetDeck || undefined,
              tag: body.tag || undefined,
            };
            const cards = this.options.cardRepo.list(filter);

            if (this.options.ankiConnectAdapter) {
              const syncRes = await this.options.ankiConnectAdapter.syncCards(cards, {
                targetDeck: body.targetDeck,
              });
              this.sendJson(res, 200, syncRes);
            } else {
              this.sendJson(res, 200, {
                totalCards: cards.length,
                addedCards: 0,
                duplicateOrFailedCards: cards.length,
                error: "AnkiConnect adapter not configured",
              });
            }
            return;
          }

          // 14. Export File Download Endpoint: GET /api/export or GET /api/export/:format
          if ((pathname === "/api/export" || pathname.startsWith("/api/export/")) && method === "GET") {
            const query = parsedUrl.query;
            const subFormat = pathname.startsWith("/api/export/") ? pathname.slice("/api/export/".length) : undefined;
            const format = (subFormat as ExportFormat) || (query.format as ExportFormat) || "csv";
            const filter: CardFilter = {
              targetDeck: query.deck as string,
              tag: query.tag as string,
              difficulty: query.difficulty as any,
              search: query.search as string,
            };

            const cards = this.options.cardRepo.list(filter);

            if (this.options.exportService) {
              const result = await this.options.exportService.export({ format, filter });
              const filename = `flashcards.${format === "markdown" ? "md" : format === "pdf" ? "html" : format}`;

              let contentType = "text/plain";
              if (format === "apkg") contentType = "application/octet-stream";
              else if (format === "csv") contentType = "text/csv; charset=utf-8";
              else if (format === "tsv") contentType = "text/tab-separated-values; charset=utf-8";
              else if (format === "markdown") contentType = "text/markdown; charset=utf-8";
              else if (format === "html" || format === "pdf") contentType = "text/html; charset=utf-8";

              res.writeHead(200, {
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Access-Control-Allow-Origin": "*",
              });

              if (result.data) {
                res.end(result.data);
              } else {
                res.end("");
              }
              return;
            } else {
              // Fallback simple CSV export
              const csvContent = "Question,Answer\n" + cards.map((c) => `"${c.question.replace(/"/g, '""')}","${c.answer.replace(/"/g, '""')}"`).join("\n");
              res.writeHead(200, {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": 'attachment; filename="flashcards.csv"',
              });
              res.end(csvContent);
              return;
            }
          }

          // 15. Settings Keys REST API
          // 15a. GET /api/settings/keys
          if (pathname === "/api/settings/keys" && method === "GET") {
            const keys = this.settingsService.getAllKeyStatuses();
            const providers = this.settingsService.listProviderStatuses();
            this.sendJson(res, 200, { keys, providers });
            return;
          }

          // 15d. POST /api/settings/keys/test
          if (pathname === "/api/settings/keys/test" && method === "POST") {
            const body = await this.parseBody(req);
            if (!body || typeof body !== "object" || !body.provider || typeof body.provider !== "string") {
              this.sendJson(res, 400, { error: "Field 'provider' is required and must be a string." });
              return;
            }

            const provider = body.provider.trim().toLowerCase();
            if (!SUPPORTED_PROVIDERS.includes(provider as any)) {
              this.sendJson(res, 400, {
                error: `Unsupported provider "${body.provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
              });
              return;
            }

            if (("key" in body && typeof body.key !== "string" && body.key !== null) ||
                ("endpoint" in body && typeof body.endpoint !== "string" && body.endpoint !== null)) {
              this.sendJson(res, 400, { error: "'key' and 'endpoint' must be strings or null." });
              return;
            }

            const candidateKey = typeof body.key === "string" && body.key.trim().length > 0 ? body.key.trim() : null;
            const candidateEndpoint = typeof body.endpoint === "string" && body.endpoint.trim().length > 0 ? body.endpoint.trim() : null;

            const keyToTest = candidateKey || this.settingsService.getSecret(provider);
            const endpointToTest = candidateEndpoint || this.settingsService.getEndpoint(provider);

            const isLocalOpenAI = provider === "openai" && endpointToTest && (endpointToTest.includes("localhost") || endpointToTest.includes("127.0.0.1"));

            if (["openai", "anthropic", "gemini", "notion"].includes(provider) && !keyToTest && !isLocalOpenAI) {
              this.sendJson(res, 200, {
                success: false,
                message: `No API key configured for ${provider}. Please enter a key to test.`,
              });
              return;
            }

            const timeoutMs = typeof body.timeoutMs === "number" && body.timeoutMs > 0
              ? Math.min(Math.max(body.timeoutMs, 500), 10000)
              : 3000;

            try {
              const result = await this.providerVerifier.verify({
                provider,
                key: keyToTest,
                endpoint: endpointToTest,
                timeoutMs,
              });
              this.sendJson(res, 200, result);
            } catch (err: any) {
              this.sendJson(res, 200, {
                success: false,
                message: `Verification failed: ${err?.message || String(err)}`,
              });
            }
            return;
          }

          // 15b. POST /api/settings/keys
          if (pathname === "/api/settings/keys" && method === "POST") {
            const body = await this.parseBody(req);
            if (!body || typeof body !== "object" || !body.provider || typeof body.provider !== "string") {
              this.sendJson(res, 400, { error: "Field 'provider' is required and must be a string." });
              return;
            }

            const provider = body.provider.trim().toLowerCase();
            if (!SUPPORTED_PROVIDERS.includes(provider as any)) {
              this.sendJson(res, 400, {
                error: `Unsupported provider "${body.provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
              });
              return;
            }

            if (("key" in body && typeof body.key !== "string" && body.key !== null) ||
                ("endpoint" in body && typeof body.endpoint !== "string" && body.endpoint !== null)) {
              this.sendJson(res, 400, { error: "'key' and 'endpoint' must be strings or null." });
              return;
            }

            const rawKey = typeof body.key === "string" ? body.key.trim() : body.key === null ? null : undefined;
            const rawEndpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : body.endpoint === null ? null : undefined;

            if (rawKey === undefined && rawEndpoint === undefined) {
              this.sendJson(res, 400, { error: "At least one of 'key' or 'endpoint' must be provided." });
              return;
            }

            this.settingsService.setProviderSecret(provider, rawKey, rawEndpoint);
            const status = this.settingsService.getKeyStatus(provider);
            this.sendJson(res, 200, { success: true, ...status });
            return;
          }

          // 15c. DELETE /api/settings/keys/:provider
          if (pathname.startsWith("/api/settings/keys/") && method === "DELETE") {
            const providerRaw = pathname.slice("/api/settings/keys/".length);
            if (!providerRaw || providerRaw.trim().length === 0) {
              this.sendJson(res, 400, { error: "Provider is required in URL path." });
              return;
            }

            const provider = providerRaw.replace(/\/+$/, "").trim().toLowerCase();
            if (!SUPPORTED_PROVIDERS.includes(provider as any)) {
              this.sendJson(res, 400, {
                error: `Unsupported provider "${providerRaw}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
              });
              return;
            }

            this.settingsService.deleteProviderSecret(provider);
            const status = this.settingsService.getKeyStatus(provider);
            this.sendJson(res, 200, { success: true, ...status });
            return;
          }

          // 15e. GET /api/settings/logging
          if (pathname === "/api/settings/logging" && method === "GET") {
            const verbose = this.settingsService.isVerboseLogging();
            const logLevel = this.settingsService.getLogLevel();
            this.sendJson(res, 200, { verbose, logLevel });
            return;
          }

          // 15f. PUT /api/settings/logging
          if (pathname === "/api/settings/logging" && (method === "PUT" || method === "POST")) {
            const body = await this.parseBody(req);
            if (!body || typeof body !== "object") {
              this.sendJson(res, 400, { error: "Request body must be an object." });
              return;
            }

            if ("verbose" in body && typeof body.verbose === "boolean") {
              this.settingsService.setVerboseLogging(body.verbose);
            }

            if ("logLevel" in body && typeof body.logLevel === "string") {
              const level = body.logLevel.trim().toLowerCase();
              if (!["debug", "info", "warn", "error"].includes(level)) {
                this.sendJson(res, 400, { error: "Field 'logLevel' must be one of: debug, info, warn, error" });
                return;
              }
              this.settingsService.setLogLevel(level);
            }

            const verbose = this.settingsService.isVerboseLogging();
            const logLevel = this.settingsService.getLogLevel();
            this.sendJson(res, 200, { success: true, verbose, logLevel });
            return;
          }

          // Fallback 404
          this.sendJson(res, 404, { error: "Not Found", path: pathname });
        } catch (err: any) {
          this.sendJson(res, 500, { error: err.message || "Internal Server Error" });
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
