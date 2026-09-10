# 📓 Notion Ingestion & Integration Setup Guide

This guide walks you through connecting your **Notion** workspace to **Flashcard Master**, allowing you to ingest Notion pages and databases into your local flashcard library with automatic subpage crawling, content parsing, and S3 media asset localization.

---

## 📋 Overview of Notion Ingestion Features

* **Pages & Databases:** Ingest individual Notion documents or full databases.
* **Subpage Recursion:** Optional recursive crawling up to 3 levels deep with automatic cycle prevention and parent-child hierarchy preservation.
* **Expiring Media Localization:** Notion hosts images using temporary AWS S3 signed URLs that expire after 60 minutes. Flashcard Master automatically downloads and converts all embedded images to optimized local WebP files (`/api/media/<hash>.webp`), ensuring your flashcard illustrations and diagrams remain permanently accessible offline.
* **Incremental Delta Sync:** Cryptographic SHA-256 content hashing guarantees that unchanged Notion pages are skipped during sync cycles.
* **100% Local-First & Masked:** Your API token is stored locally in your SQLite database with partial masking (`ntn_••••••••1234`). It is never transmitted to any third party other than direct calls to `api.notion.com`.

---

## 🛠️ Step-by-Step Setup

### Step 1: Create a Notion Internal Integration

1. Go to the [Notion Developers Portal - My Integrations](https://www.notion.so/profile/integrations).
2. Click **+ New integration**.
3. Select your target **Workspace**.
4. Set the **Name** to `Flashcard Master` (or any name you prefer).
5. Under **Capabilities**, configure the following permissions:
   * **Read content** (Required)
   * *Insert content* and *Update content* can be left disabled (Flashcard Master only reads).
   * *User capabilities* can be set to "No user information".
6. Click **Save** or **Submit**.
7. In the **Secrets** section, click **Show** and copy your **Internal Integration Secret** (starts with `ntn_` or `secret_`).

---

### Step 2: Grant the Integration Access to Your Notion Pages

Notion enforces an explicit opt-in permission model. Integrations cannot read any page or database until you share it:

1. Open **Notion** (web or desktop app).
2. Navigate to the top-level page or database you want to ingest.
3. Click the **`•••`** (More options) button in the upper right corner of the page.
4. Scroll down to **Connections** $\rightarrow$ **Connect to...**
5. Search for your integration name (e.g. `Flashcard Master`) and select it.
6. Confirm the prompt granting access.

> [!TIP]
> **Subpage Inheritance:** In Notion, granting connection access to a parent page automatically cascades read permissions to all nested subpages and sub-databases within it.

---

### Step 3: Configure Your Token in Flashcard Master

You can configure your Notion token through the Web Dashboard or via environment variables:

#### Option A: In the Web Dashboard (Recommended)

1. Launch Flashcard Master:
   ```bash
   flashcard-master serve
   ```
2. Open your browser to `http://127.0.0.1:3000/#/settings` (or click **⚙️ Settings** in the navigation bar).
3. Under the **Notion Integration** card, paste your Integration Secret into the token field.
4. Click **⚡ Test Connection** to verify your token with Notion in real-time.
5. Click **Save Key**. The token is saved in SQLite and immediately active.

#### Option B: Via Environment Variable

Alternatively, export the `NOTION_API_KEY` environment variable in your terminal session or `.env` file:

```bash
export NOTION_API_KEY="ntn_your_notion_integration_token"
```

> [!NOTE]
> **Resolution Priority:** Flashcard Master resolves credentials using a fallback hierarchy:
> 1. SQLite Database Settings (configured via the Web UI)
> 2. Process Environment Variables (`process.env.NOTION_API_KEY`)

---

### Step 4: Add a Notion Source

#### In the Web UI:

1. Navigate to the **🌐 Data Sources** tab.
2. Click **`+ Add Data Source`**.
3. Select the **📓 Notion** radio button.
   * You will see the live status indicator: `✓ Notion Token Active`.
4. In the **URL / Page ID** input, paste:
   * A full Notion page URL: `https://www.notion.so/my-workspace/Software-Design-1234567890abcdef1234567890abcdef`
   * A Notion database URL: `https://www.notion.so/my-workspace/a1b2c3d4e5f6...`
   * Or a bare 32-character hex ID: `1234567890abcdef1234567890abcdef`
5. *(Optional)* Check **"Include subpages as separate documents (recursive crawl up to 3 levels)"** if you want Flashcard Master to automatically crawl child pages.
6. Click **Create Source**.
7. Click **`🔄 Sync`** next to the source in the table to ingest the content.

#### In the CLI:

```bash
# Add a Notion source via CLI
flashcard-master source add \
  --type notion \
  --name "System Architecture Notes" \
  --uri "https://www.notion.so/my-workspace/Architecture-1234567890abcdef1234567890abcdef?recursive=true"

# Synchronize all sources
flashcard-master sync
```

---

## 🔍 Troubleshooting & FAQs

### Error: "Object not found" (HTTP 404) or "Could not find page or database"
* **Cause:** The Notion page has not been shared with your integration.
* **Fix:** In Notion, open the page $\rightarrow$ click `•••` $\rightarrow$ `Connections` $\rightarrow$ `Connect to` $\rightarrow$ add `Flashcard Master`.

### Error: "Unauthorized" (HTTP 401)
* **Cause:** The Notion token is missing, expired, or invalid.
* **Fix:** Go to `http://127.0.0.1:3000/#/settings`, verify that the token starts with `ntn_` or `secret_`, and click **⚡ Test Connection**.

### Are Notion image attachments supported?
* **Yes.** Notion S3 image URLs expire after 1 hour. Flashcard Master automatically localizes all images into your local media directory during sync. The generated flashcards reference permanent local `/api/media/<hash>.webp` URLs, ensuring cards remain intact when offline and during export.

### How deep does recursion go?
* Recursive crawling is capped at **3 levels** deep to prevent infinite loops or accidental massive workspace ingestion. Circular page links are automatically detected and skipped.
