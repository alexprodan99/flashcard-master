# 🚀 3-Minute Quickstart

Get up and running with **Flashcard Master** in three minutes. Turn any web article, markdown note, or book chapter into atomic, active-recall flashcards with verified verbatim citations.

---

## ⚡ 1. Launch Flashcard Master

Flashcard Master runs completely locally on your computer as a standalone desktop app, a local browser-bound Web UI, or a scriptable CLI.

### Option A: Standalone Desktop App (Recommended for Most Users)
Download the latest native desktop installer from the **[Flashcard Master GitHub Releases Page](https://github.com/alexprodan99/flashcard-master/releases)**:

| Operating System | Download Formats | Notes |
| :--- | :--- | :--- |
| **Windows** | [`Flashcard.Master.Setup.1.0.1.exe`](https://github.com/alexprodan99/flashcard-master/releases) (NSIS) or `Flashcard.Master.1.0.1.exe` (Portable) | 64-bit Windows 10/11 installer or standalone portable binary |
| **macOS** | [`Flashcard.Master-1.0.1-universal.dmg`](https://github.com/alexprodan99/flashcard-master/releases), [`arm64.dmg`](https://github.com/alexprodan99/flashcard-master/releases), [`x64.dmg`](https://github.com/alexprodan99/flashcard-master/releases) | Universal binary supporting Apple Silicon (M1/M2/M3/M4) & Intel |
| **Linux** | [`Flashcard.Master-1.0.1.deb`](https://github.com/alexprodan99/flashcard-master/releases) or [`Flashcard.Master-1.0.1.AppImage`](https://github.com/alexprodan99/flashcard-master/releases) | Native Debian/Ubuntu `.deb` package or portable AppImage |

::: tip 💡 Windows Defender SmartScreen Note
Because Flashcard Master is a community open-source project without a costly commercial EV code-signing certificate, Windows or Edge may show an *"Unrecognized app"* or *"Isn't commonly downloaded"* prompt on new releases:
1. **In Edge/Chrome**: Click `...` next to the download &rarr; select **Keep** &rarr; click **Show more** &rarr; select **Keep anyway**.
2. **When opening the installer**: On the blue SmartScreen prompt, click the **More info** link &rarr; then click **Run anyway**.
:::

::: tip 🍎 macOS Gatekeeper Note
On first launch on macOS, if prompted with *"unidentified developer"*:
Open **System Settings** &rarr; **Privacy & Security** &rarr; scroll to Security and click **Open Anyway** (or right-click the app in `/Applications` and select **Open**).
:::

**Desktop Benefits:**
* **Zero Terminal Required:** Double-click and run like any native application.
* **System Tray Minimization:** Keep Flashcard Master running in your background tray/dock without cluttering your workspace.
* **Storage Isolation:** Automatically places your SQLite database (`data.sqlite`) and media cache in your OS user data directory (`%APPDATA%`, `~/Library/Application Support`, or `~/.config`).
* **Ephemeral Port Protection:** Binds an internal loopback port dynamically to prevent conflicts with other services.

### Option B: Zero-Install (Web UI via NPX)
You can run the web dashboard immediately using `npx` without installing anything permanently:

```bash
# Launch the interactive terminal setup wizard:
npx @flashcard-master/cli init

# Or launch the local Web UI dashboard directly:
npx @flashcard-master/cli serve
```

The Web UI dashboard will open automatically in your browser at `http://localhost:3000`.

### Option C: Global CLI Installation
If you prefer having the `flashcard-master` command available anywhere in your terminal:

```bash
npm install -g @flashcard-master/cli
```

Once installed, start the dashboard anytime:
```bash
flashcard-master serve
```

---

## 🔑 2. Configure Your AI Provider

Flashcard Master supports 4 cutting-edge AI providers:

| Provider | Recommended Default Model | Ideal Use Case | Setup Requirements |
| :--- | :--- | :--- | :--- |
| **Ollama** | `phi4-mini` | 100% offline, private, zero API fees | Local Ollama daemon running on `localhost:11434` |
| **Google Gemini** | `gemini-3.6-flash` | Blazing fast, high free-tier limits | Free Google AI Studio API Key |
| **OpenAI** | `gpt-4o-mini` | Ultra-reliable, fast synthesis | OpenAI API Key |
| **Anthropic** | `claude-haiku-4-5-20251001` | Sophisticated reasoning, clean formatting | Anthropic API Key |

### Setting Up via the Web UI:
1. Navigate to **⚙️ Settings** in the left sidebar (shortcut: `6`).
2. Under **AI Model Configurations**, enter your API key or configure your Ollama endpoint URL.
3. Click **🧪 Test Connection** to verify your credentials.
4. Click **💾 Save Settings**.

---

## 🌐 3. Add Your First Data Source

1. Navigate to **Data Sources** in the sidebar (shortcut: `2` or `s`).
2. Click **➕ Add Source**.
3. Choose your source type:
   - **Web Article**: Enter any public article URL (e.g., Wikipedia or technical blog).
   - **RSS Feed**: Enter an Atom/RSS feed URL to periodically auto-sync articles.
   - **Local File / Book**: Upload a `.md`, `.epub`, or `.pdf` document.
   - **Notion Workspace**: Connect your Notion page or database.
4. Click **Save & Ingest**. Flashcard Master extracts clean text and breaks it into semantic chapters or chunks automatically.

---

## ⚡ 4. Generate Active-Recall Flashcards

1. Navigate to **Generate Studio** (shortcut: `3` or `g`).
2. **Select Target Scope**: Choose your newly ingested document or chapter.
3. **Configure Generation Parameters**:
   - **Difficulty Level**: Choose `Beginner`, `Intermediate`, or `Advanced`.
   - **Cognitive Persona**: Select a tailored tutor style (e.g. *Socratic Tutor*, *Exam Drill Sergeant*, or *Analogy Weaver*).
   - **Target Card Count**: Specify how many cards to produce (e.g., `5` to `20`).
4. Click **⚡ Start Generation**.
5. Watch the **Task Center** drawer stream new cards in real time as the background worker runs synthesis and validates verbatim quote citations!

---

## 🗂️ 5. Review & Export

1. Navigate to **Question Explorer** (shortcut: `4`) to view your synthesized cards.
   - Each card highlights the **Source Quote** from your material proving zero hallucination.
   - Edit, rephrase, or tag individual cards with the inline card editor drawer.
2. Navigate to **Export & Anki** (shortcut: `5` or `e`):
   - **AnkiConnect (1-Click Sync)**: Push cards straight into your open Desktop Anki application.
   - **Anki Package (`.apkg`)**: Download a standalone deck file for Anki mobile or desktop.
   - **E-Reader Study Guide (`.epub`)**: Export a styled, chapter-based study book for Kindle, Kobo, or Apple Books.
   - **Markdown / CSV / TSV**: Export raw data for Obsidian, Notion, or spreadsheets.

Congratulations! You have completed your first end-to-end active-recall learning workflow.
