import Database from "better-sqlite3";
import JSZip from "jszip";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Flashcard } from "@flashcard-master/core";
import type { ExporterPort, ExportOptions, ExportResult } from "@flashcard-master/core";

export class AnkiPackageExporter implements ExporterPort {
  readonly format = "apkg" as const;

  private computeFieldChecksum(str: string): number {
    const hash = crypto.createHash("sha1").update(str).digest("hex");
    return parseInt(hash.substring(0, 8), 16);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/\n/g, "<br>");
  }

  async export(cards: Flashcard[], options: ExportOptions = {}): Promise<ExportResult> {
    const deckName = options.targetDeck || (cards.length > 0 ? cards[0].targetDeck : "Default") || "Default";
    const includeCitation = options.includeCitationFootnotes ?? true;

    // Create unique temp file for the anki2 sqlite db
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "anki-export-"));
    const ankiDbPath = path.join(tempDir, "collection.anki2");

    const db = new Database(ankiDbPath);

    try {
      // 1. Initialize Anki SQLite schema
      db.exec(`
        CREATE TABLE col (
          id INTEGER PRIMARY KEY,
          crt INTEGER,
          mod INTEGER,
          scm INTEGER,
          ver INTEGER,
          dty INTEGER,
          usn INTEGER,
          ls INTEGER,
          conf TEXT,
          models TEXT,
          decks TEXT,
          dconf TEXT,
          tags TEXT
        );

        CREATE TABLE notes (
          id INTEGER PRIMARY KEY,
          guid TEXT NOT NULL,
          mid INTEGER NOT NULL,
          mod INTEGER NOT NULL,
          usn INTEGER NOT NULL,
          tags TEXT NOT NULL,
          flds TEXT NOT NULL,
          sfld TEXT NOT NULL,
          csum INTEGER,
          flags INTEGER NOT NULL,
          data TEXT NOT NULL
        );

        CREATE TABLE cards (
          id INTEGER PRIMARY KEY,
          nid INTEGER NOT NULL,
          did INTEGER NOT NULL,
          ord INTEGER NOT NULL,
          mod INTEGER NOT NULL,
          usn INTEGER NOT NULL,
          type INTEGER NOT NULL,
          queue INTEGER NOT NULL,
          due INTEGER NOT NULL,
          ivl INTEGER NOT NULL,
          factor INTEGER NOT NULL,
          reps INTEGER NOT NULL,
          lapses INTEGER NOT NULL,
          left INTEGER NOT NULL,
          odue INTEGER NOT NULL,
          odid INTEGER NOT NULL,
          flags INTEGER NOT NULL,
          data TEXT NOT NULL
        );

        CREATE TABLE revlog (
          id INTEGER PRIMARY KEY,
          cid INTEGER NOT NULL,
          usn INTEGER NOT NULL,
          ease INTEGER NOT NULL,
          ivl INTEGER NOT NULL,
          lastIvl INTEGER NOT NULL,
          factor INTEGER NOT NULL,
          time INTEGER NOT NULL,
          type INTEGER NOT NULL
        );

        CREATE TABLE graves (
          usn INTEGER NOT NULL,
          oid INTEGER NOT NULL,
          type INTEGER NOT NULL
        );

        CREATE INDEX ix_notes_usn ON notes (usn);
        CREATE INDEX ix_cards_usn ON cards (usn);
        CREATE INDEX ix_cards_nid ON cards (nid);
        CREATE INDEX ix_cards_sched ON cards (did, queue, due);
        CREATE INDEX ix_revlog_usn ON revlog (usn);
        CREATE INDEX ix_revlog_cid ON revlog (cid);
        CREATE INDEX ix_notes_csum ON notes (csum);
      `);

      const nowMs = Date.now();
      const nowSec = Math.floor(nowMs / 1000);
      const deckId = 1600000000001;
      const modelId = 1600000000002;

      const modelConfig = {
        [modelId]: {
          id: modelId,
          name: "Flashcard Master Basic",
          type: 0,
          mod: nowSec,
          usn: -1,
          sortf: 0,
          did: deckId,
          tmpls: [
            {
              name: "Card 1",
              ord: 0,
              qfmt: "{{Front}}",
              afmt: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
              bqfmt: "",
              bafmt: "",
              did: null,
            },
          ],
          flds: [
            { name: "Front", ord: 0, sticky: false, rtl: false, font: "Arial", size: 20 },
            { name: "Back", ord: 1, sticky: false, rtl: false, font: "Arial", size: 20 },
          ],
          css: `.card {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 20px;
            text-align: center;
            color: #0f172a;
            background-color: #ffffff;
            padding: 24px;
          }
          .citation {
            margin-top: 20px;
            font-size: 14px;
            color: #475569;
            text-align: left;
            border-left: 3px solid #2563eb;
            padding-left: 12px;
            font-style: italic;
          }
          .keywords {
            margin-top: 14px;
            font-size: 12px;
            color: #475569;
            text-align: left;
          }
          .keyword-badge {
            background-color: #e0e7ff;
            color: #3730a3;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            display: inline-block;
            margin: 2px 2px 2px 0;
          }`,
          req: [[0, "all", [0]]],
        },
      };

      const deckConfig = {
        [deckId]: {
          id: deckId,
          name: deckName,
          desc: "Exported from Flashcard Master",
          mod: nowSec,
          usn: -1,
          collapsed: false,
          browserCollapsed: false,
        },
      };

      db.prepare(`
        INSERT INTO col (
          id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        1,
        nowSec,
        nowMs,
        nowMs,
        11,
        0,
        0,
        0,
        "{}",
        JSON.stringify(modelConfig),
        JSON.stringify(deckConfig),
        "{}",
        "{}"
      );

      // 2. Insert Notes and Cards
      const insertNote = db.prepare(`
        INSERT INTO notes (
          id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertCard = db.prepare(`
        INSERT INTO cards (
          id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertAll = db.transaction((flashcards: Flashcard[]) => {
        for (let i = 0; i < flashcards.length; i++) {
          const c = flashcards[i];
          const noteId = nowMs + i * 2;
          const cardId = nowMs + i * 2 + 1;
          const guid = crypto.randomBytes(6).toString("base64").replace(/[+/=]/g, "_");

          const frontHtml = this.escapeHtml(c.question);
          let backHtml = this.escapeHtml(c.answer);

          if (includeCitation && c.sourceQuote) {
            const locatorHtml = c.sourceLocator ? ` <em>(${this.escapeHtml(c.sourceLocator)})</em>` : "";
            backHtml += `<div class="citation"><strong>Source Citation:</strong> "${this.escapeHtml(c.sourceQuote)}"${locatorHtml}</div>`;
          }

          if (c.keywords && c.keywords.length > 0) {
            const kwBadges = c.keywords.map((k) => `<span class="keyword-badge">${this.escapeHtml(k)}</span>`).join(" ");
            backHtml += `<div class="keywords"><strong>Keywords:</strong> ${kwBadges}</div>`;
          }

          const flds = `${frontHtml}\x1f${backHtml}`;
          const sfld = c.question;
          const csum = this.computeFieldChecksum(sfld);

          const keywordTags = (c.keywords || [])
            .map((k) => k.trim().replace(/\s+/g, "-"))
            .filter(Boolean);
          const allTags = Array.from(new Set([...(c.tags || []), ...keywordTags]));
          const tagsStr = allTags.join(" ");

          insertNote.run(
            noteId,
            guid,
            modelId,
            nowSec,
            -1,
            tagsStr,
            flds,
            sfld,
            csum,
            0,
            ""
          );

          insertCard.run(
            cardId,
            noteId,
            deckId,
            0,
            nowSec,
            -1,
            0, // type: new
            0, // queue: new
            i + 1, // due
            0, // ivl
            2500, // factor
            0, // reps
            0, // lapses
            0, // left
            0, // odue
            0, // odid
            0, // flags
            ""
          );
        }
      });

      insertAll(cards);
    } finally {
      db.close();
    }

    // 3. Package into ZIP container (.apkg)
    const dbBuffer = fs.readFileSync(ankiDbPath);

    // Clean up temp dir
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }

    const zip = new JSZip();
    zip.file("collection.anki2", dbBuffer);
    zip.file("media", "{}");

    const apkgBuffer = await zip.generateAsync({ type: "nodebuffer" });

    if (options.outputPath) {
      const targetDir = path.dirname(options.outputPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(options.outputPath, apkgBuffer);
    }

    return {
      format: "apkg",
      successCount: cards.length,
      outputPath: options.outputPath,
      data: apkgBuffer,
      message: `Successfully exported ${cards.length} cards to Anki package (${deckName}).`,
    };
  }
}
