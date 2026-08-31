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
    this.port = options.port || 3000;
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
  </style>
</head>
<body>
  <aside>
    <div class="brand">
      <span>🎴</span> Flashcard Master
    </div>
    <ul class="nav-list">
      <li class="nav-item active" onclick="switchTab('dashboard')">📊 Dashboard</li>
      <li class="nav-item" onclick="switchTab('sources')">🌐 Data Sources</li>
      <li class="nav-item" onclick="switchTab('cards')">🗂️ Flashcards</li>
      <li class="nav-item" onclick="switchTab('export')">🚀 Export Center</li>
    </ul>
  </aside>

  <main>
    <header>
      <div>
        <h1 id="page-title">Dashboard Overview</h1>
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
  </main>

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

    function switchTab(tab) {
      const items = document.querySelectorAll('.nav-item');
      for (let i = 0; i < items.length; i++) {
        items[i].classList.remove('active');
      }
      if (window.event && window.event.target) {
        window.event.target.classList.add('active');
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
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end(JSON.stringify(data));
  }

  private parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk.toString(); });
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
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
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

          // 4. Sources Endpoint
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

          // 5. Single Source Delete Endpoint: /api/sources/:id
          if (pathname.startsWith("/api/sources/") && method === "DELETE") {
            const id = pathname.replace("/api/sources/", "");
            const deleted = this.options.sourceRepo.delete(id);
            this.sendJson(res, deleted ? 200 : 404, { success: deleted });
            return;
          }

          // 6. Cards Endpoint
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

          // 7. Decks Endpoint
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
