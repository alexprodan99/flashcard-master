# ❓ Troubleshooting & Frequently Asked Questions (FAQ)

Find quick, actionable solutions for common setup questions, network permissions, and configuration inquiries.

---

## 🌐 Notion Integration

### Q: Why do I get "Could not find page with ID" or a 404 error when syncing Notion?
**Cause:** In Notion, creating an API token is only step one. Notion requires you to explicitly grant the integration access to your specific workspace pages.

**Solution:**
1. Open the target Notion page or database in your browser or desktop app.
2. Click the **•••** (three dots) menu in the top-right corner.
3. Scroll down and click **Connections** (or **Connect to** / **Add connections**).
4. Select your **Flashcard Master** integration and confirm.
5. All nested subpages will automatically inherit access.

---

## ⚡ Anki & AnkiConnect

### Q: Why do I see "Connection Refused" when syncing to Anki?
**Cause:** Desktop Anki is either not running, or the AnkiConnect add-on is not installed.

**Solution:**
1. Verify that **Desktop Anki** is actively running on your machine.
2. Check that the **AnkiConnect** add-on is installed:
   - In Anki, go to **Tools** ➔ **Add-ons**.
   - Ensure `AnkiConnect` (code `2055492159`) is listed and enabled.
3. Verify that AnkiConnect is listening on the default local port (`http://127.0.0.1:8765`). If you changed the port in AnkiConnect config, update the URL in Flashcard Master **Settings** ➔ **Anki Integration**.

---

## 🗄️ Storage & Database

### Q: Where are my cards and data sources stored?
All application state, documents, settings, and flashcards reside locally on your machine in an embedded SQLite database:
- **Default Database Location**: `~/.flashcard-master/data.sqlite`
- **Associated WAL Files**: `~/.flashcard-master/data.sqlite-wal` and `data.sqlite-shm`
- **Media Cache**: `~/.flashcard-master/media/`

To back up your entire knowledge base, simply copy the `~/.flashcard-master/` folder.

---

## 🤖 AI Models & Synthesis

### Q: Why do some cards say "Discarded ungrounded card"?
**Answer:** This is a feature, not a bug! Flashcard Master enforces strict factual grounding via `GroundingGuard`. If an LLM hallucinates an answer or invents a fake quote that does not appear verbatim in your text, Flashcard Master catches and rejects it. The system then automatically backfills and synthesizes replacement cards that meet the strict verification criteria.

### Q: Which AI provider should I choose?
- For **100% offline privacy and zero cost**, install [Ollama](https://ollama.ai) and pull `phi4-mini` (`ollama pull phi4-mini`).
- For **blazing fast synthesis and massive document contexts**, use Google Gemini (`gemini-3.6-flash`).
- For **concise board-exam style recall**, use OpenAI (`gpt-4o-mini`).
- For **deep philosophical or conceptual synthesis**, use Anthropic (`claude-haiku-4-5-20251001`).

---

## 🧵 Multiprocessing & Task Center

### Q: Can I run multiple generation or ingestion tasks simultaneously?
**Answer:** Yes! Flashcard Master includes a dedicated background worker multiprocessing pool (`WorkerExecutor`):
- By default, up to **2 background generation workers** and **2 sync workers** run in parallel as independent Node.js subprocesses.
- You can tune concurrency limits (from 1 up to 16 workers) in **⚙️ Settings** ➔ **Worker Pool Concurrency Limits** or via environment variables (`MAX_GENERATION_WORKERS`, `MAX_SYNC_WORKERS`).
- Monitor active tasks, observe live token throughput, or cancel tasks anytime in the **Task Center** drawer (`t` shortcut).
