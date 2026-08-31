import http from "node:http";
import url from "node:url";
import {
  type DataSourceRepository,
  type SyncStateRepository,
  type FlashcardRepository,
  type IngestionService,
  type ExportService,
  type CardFilter,
} from "@flashcard-master/core";

export interface WebServerOptions {
  port?: number;
  host?: string;
  sourceRepo: DataSourceRepository;
  syncRepo: SyncStateRepository;
  cardRepo: FlashcardRepository;
  ingestionService?: IngestionService;
  exportService?: ExportService;
}

export class WebServer {
  private server: http.Server | null = null;
  private readonly port: number;
  private readonly host: string;

  constructor(private readonly options: WebServerOptions) {
    this.port = options.port !== undefined ? options.port : 3000;
    this.host = options.host || "127.0.0.1";
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
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
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
    .btn-danger { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.3); }
    .btn-sm { padding: 4px 10px; font-size: 12px; }

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
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
    .card-item {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 18px 20px;
    }
    .card-meta { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
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

    .card-q { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
    .card-a { font-size: 14px; color: var(--text-muted); line-height: 1.4; }

    .source-quote {
      margin-top: 10px;
      padding-left: 10px;
      border-left: 2px solid var(--primary);
      font-size: 12px;
      color: #94a3b8;
      font-style: italic;
    }

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

    /* Modal */
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
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .form-group {
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-group label {
      font-size: 13px;
      color: var(--text-muted);
    }
    .form-input {
      background: #0f172a;
      border: 1px solid var(--card-border);
      border-radius: 6px;
      color: var(--text);
      padding: 8px 12px;
      font-size: 14px;
      outline: none;
    }
    .form-input:focus { border-color: var(--primary); }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 24px;
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
      <li class="nav-item" id="nav-cards" onclick="switchTab('cards')">🗂️ Flashcards</li>
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
          <h1>Data Sources Manager</h1>
          <p class="subtitle">Manage RSS feeds, web reader links, and local markdown folders</p>
        </div>
        <div class="toolbar">
          <button class="btn btn-secondary" onclick="syncAllSources()">🔄 Sync All Sources</button>
          <button class="btn" onclick="openAddSourceModal()" style="margin-left: 10px;">+ Add Data Source</button>
        </div>
      </header>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>URI / Endpoint</th>
              <th>Target Deck</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="sources-tbody">
            <tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Loading sources...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 3. FLASHCARDS VIEW -->
    <div id="view-cards" style="display:none;">
      <header>
        <div>
          <h1>Flashcards Explorer</h1>
          <p class="subtitle">Explore all grounded study cards by deck and difficulty</p>
        </div>
      </header>
      <div id="all-cards-list" class="card-list">
        <p style="color: var(--text-muted); font-size: 14px;">Select or filter cards...</p>
      </div>
    </div>

    <!-- 4. EXPORT CENTER VIEW -->
    <div id="view-export" style="display:none;">
      <header>
        <div>
          <h1>Export Center</h1>
          <p class="subtitle">Export flashcards to Anki (.apkg), CSV/TSV, Markdown, or PDF</p>
        </div>
      </header>
      <div class="kpi-card" style="max-width: 600px;">
        <h3 style="margin-bottom: 12px;">One-Click Format Export</h3>
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">Choose a target format to generate output files directly:</p>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn" onclick="triggerExport('apkg')">📦 Anki Package (.apkg)</button>
          <button class="btn btn-secondary" onclick="triggerExport('csv')">📄 Spreadsheet (.csv)</button>
          <button class="btn btn-secondary" onclick="triggerExport('markdown')">📝 Markdown (.md)</button>
          <button class="btn btn-secondary" onclick="triggerExport('html')">🖨️ Printable HTML</button>
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
          <label>Target Deck</label>
          <input class="form-input" id="src-deck" placeholder="Default" />
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

  <script>
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
          const tagsHtml = (c.tags || []).map(function(t) { return '<span class="badge">' + t + '</span>'; }).join('');
          const quoteHtml = c.sourceQuote ? '<div class="source-quote">"' + c.sourceQuote + '"</div>' : '';

          html += '<div class="card-item">' +
            '<div class="card-meta">' +
              '<span class="badge badge-deck">' + c.targetDeck + '</span>' +
              '<span class="badge badge-diff">' + c.difficulty + '</span>' +
              tagsHtml +
            '</div>' +
            '<div class="card-q">' + c.question + '</div>' +
            '<div class="card-a">' + c.answer + '</div>' +
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
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No data sources configured. Click "+ Add Data Source" to add one.</td></tr>';
          return;
        }

        let html = '';
        for (let i = 0; i < sources.length; i++) {
          const s = sources[i];
          const typeBadge = '<span class="badge badge-' + s.type + '">' + s.type.toUpperCase() + '</span>';
          const statusBadge = s.isActive ? '<span class="badge" style="color: #34d399;">● Active</span>' : '<span class="badge" style="color: #94a3b8;">○ Inactive</span>';

          html += '<tr>' +
            '<td><strong>' + s.name + '</strong></td>' +
            '<td>' + typeBadge + '</td>' +
            '<td style="font-family: monospace; font-size: 12px; color: var(--text-muted);">' + s.uri + '</td>' +
            '<td><span class="badge badge-deck">' + s.targetDeck + '</span></td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' +
              '<button class="btn btn-secondary btn-sm" onclick="syncSingleSource(\'' + s.id + '\')">🔄 Sync</button> ' +
              '<button class="btn btn-danger btn-sm" onclick="deleteSingleSource(\'' + s.id + '\')">🗑️</button>' +
            '</td>' +
          '</tr>';
        }
        tbody.innerHTML = html;
      } catch (err) {
        console.error('Failed to load sources:', err);
      }
    }

    function switchTab(tab) {
      document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
      document.getElementById('view-dashboard').style.display = 'none';
      document.getElementById('view-sources').style.display = 'none';
      document.getElementById('view-cards').style.display = 'none';
      document.getElementById('view-export').style.display = 'none';

      document.getElementById('nav-' + tab).classList.add('active');
      document.getElementById('view-' + tab).style.display = 'block';

      if (tab === 'dashboard') loadStats();
      if (tab === 'sources') loadSources();
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
      const targetDeck = document.getElementById('src-deck').value || 'Default';
      const tagsStr = document.getElementById('src-tags').value;
      const tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];

      try {
        const res = await fetch('/api/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type, uri, targetDeck, tags, isActive: true })
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
          // 1. Static SPA Dashboard
          if (pathname === "/" || pathname === "/index.html") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(this.getHtmlSpa());
            return;
          }

          // 2. Health Endpoint
          if (pathname === "/api/health" && method === "GET") {
            this.sendJson(res, 200, { status: "ok", version: "1.0.0" });
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
            if (this.options.ingestionService) {
              const syncRes = await this.options.ingestionService.syncSource(sourceId);
              this.sendJson(res, syncRes.error && syncRes.totalFetched === 0 ? 404 : 200, syncRes);
            } else {
              this.sendJson(res, 200, { sourceId, newCount: 0, totalFetched: 0 });
            }
            return;
          }

          // 5. Bulk Sync Endpoint: POST /api/sync
          if (pathname === "/api/sync" && method === "POST") {
            if (this.options.ingestionService) {
              const syncResults = await this.options.ingestionService.syncAllActive();
              this.sendJson(res, 200, syncResults);
            } else {
              this.sendJson(res, 200, []);
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

          // 7. Single Source Update (PATCH) / Delete (DELETE): /api/sources/:id
          if (pathname.startsWith("/api/sources/")) {
            const id = pathname.slice("/api/sources/".length);

            if (method === "DELETE") {
              const deleted = this.options.sourceRepo.delete(id);
              this.sendJson(res, deleted ? 200 : 404, { success: deleted });
              return;
            }

            if (method === "PATCH") {
              const body = await this.parseBody(req);
              const updated = this.options.sourceRepo.update(id, body);
              this.sendJson(res, updated ? 200 : 404, updated || { error: "Source not found" });
              return;
            }
          }

          // 8. Cards Endpoint
          if (pathname === "/api/cards" && method === "GET") {
            const query = parsedUrl.query;
            const filter: CardFilter = {
              targetDeck: query.deck as string,
              tag: query.tag as string,
              difficulty: query.difficulty as any,
              sourceId: query.sourceId as string,
            };
            const cards = this.options.cardRepo.list(filter);
            this.sendJson(res, 200, cards);
            return;
          }

          // 9. Decks Endpoint
          if (pathname === "/api/decks" && method === "GET") {
            const decks = this.options.cardRepo.listDecks();
            this.sendJson(res, 200, decks);
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
        const addr = this.server?.address();
        const actualPort = typeof addr === "object" && addr ? addr.port : listenPort;
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



