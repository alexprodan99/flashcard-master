import type { Flashcard, ExporterPort, ExportOptions, ExportResult } from "@flashcard-master/core";

export interface AnkiConnectOptions {
  endpointUrl?: string;
  timeoutMs?: number;
  apiKey?: string;
}

export interface AnkiConnectHealth {
  isOnline: boolean;
  version?: number;
  error?: string;
}

export interface AnkiConnectSyncResult {
  totalCards: number;
  addedCards: number;
  updatedCards: number;
  duplicateOrFailedCards: number;
  noteIds: Array<number | null>;
  error?: string;
}

export type AnkiConnectOptionsResolver = AnkiConnectOptions | (() => AnkiConnectOptions);

export class AnkiConnectAdapter implements ExporterPort {
  readonly format = "ankiconnect" as const;
  private readonly optionsResolver: AnkiConnectOptionsResolver;

  constructor(options: AnkiConnectOptionsResolver = {}) {
    this.optionsResolver = options;
  }

  getOptions(): { endpointUrl: string; timeoutMs: number; apiKey?: string } {
    const opts = typeof this.optionsResolver === "function" ? this.optionsResolver() : this.optionsResolver;
    return {
      endpointUrl: opts?.endpointUrl || "http://127.0.0.1:8765",
      timeoutMs: opts?.timeoutMs || 3000,
      apiKey: opts?.apiKey,
    };
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/\n/g, "<br>");
  }

  async invoke<T = any>(action: string, params: Record<string, any> = {}): Promise<T> {
    const { endpointUrl, timeoutMs, apiKey } = this.getOptions();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const payload: Record<string, any> = {
        action,
        version: 6,
        params,
      };

      if (apiKey) {
        payload.key = apiKey;
      }

      const res = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`AnkiConnect HTTP error: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as { result: T; error: string | null };

      if (json.error) {
        throw new Error(`AnkiConnect error: ${json.error}`);
      }

      return json.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async checkHealth(): Promise<AnkiConnectHealth> {
    try {
      const version = await this.invoke<number>("version");
      return {
        isOnline: true,
        version,
      };
    } catch (err: any) {
      return {
        isOnline: false,
        error: err.name === "AbortError" ? "Connection to AnkiConnect timed out." : err.message,
      };
    }
  }

  async createDeck(deckName: string): Promise<number> {
    return this.invoke<number>("createDeck", { deck: deckName });
  }

  async syncCards(cards: Flashcard[], options: ExportOptions = {}): Promise<AnkiConnectSyncResult> {
    if (!cards || cards.length === 0) {
      return {
        totalCards: 0,
        addedCards: 0,
        updatedCards: 0,
        duplicateOrFailedCards: 0,
        noteIds: [],
      };
    }

    const health = await this.checkHealth();
    if (!health.isOnline) {
      return {
        totalCards: cards.length,
        addedCards: 0,
        updatedCards: 0,
        duplicateOrFailedCards: cards.length,
        noteIds: [],
        error: `AnkiConnect is offline or unreachable: ${health.error}`,
      };
    }

    const includeCitation = options.includeCitationFootnotes ?? true;

    try {
      // 1. Format notes array with per-card or override deck
      const notes = cards.map((c) => {
        const cardDeck = options.targetDeck || c.targetDeck || "Default";
        let backHtml = this.escapeHtml(c.answer);
        if (includeCitation && c.sourceQuote) {
          const locatorHtml = c.sourceLocator ? ` <em>(${this.escapeHtml(c.sourceLocator)})</em>` : "";
          backHtml += `<div class="citation"><strong>Source Citation:</strong> "${this.escapeHtml(c.sourceQuote)}"${locatorHtml}</div>`;
        }
        if (c.keywords && c.keywords.length > 0) {
          const kwBadges = c.keywords.map((k) => `<span class="keyword-badge">${this.escapeHtml(k)}</span>`).join(" ");
          backHtml += `<div class="keywords"><strong>Keywords:</strong> ${kwBadges}</div>`;
        }

        const keywordTags = (c.keywords || [])
          .map((k) => k.trim().replace(/\s+/g, "-"))
          .filter(Boolean);
        const allTags = Array.from(new Set([...(c.tags || []), ...keywordTags]));

        return {
          deckName: cardDeck,
          modelName: "Basic",
          fields: {
            Front: this.escapeHtml(c.question),
            Back: backHtml,
          },
          tags: allTags,
          options: {
            allowDuplicate: false,
            duplicateScope: "deck",
          },
        };
      });

      // 2. Ensure all distinct target decks exist in Anki
      const distinctDecks = Array.from(new Set(notes.map((n) => n.deckName)));
      for (const d of distinctDecks) {
        await this.createDeck(d);
      }

      // 3. Query canAddNotes to safely distinguish new cards from existing cards
      let canAddFlags: boolean[] = [];
      try {
        canAddFlags = await this.invoke<boolean[]>("canAddNotes", { notes });
      } catch {
        canAddFlags = new Array(notes.length).fill(true);
      }

      const results: Array<number | null> = new Array(cards.length).fill(null);
      let addedCards = 0;
      let updatedCards = 0;
      let duplicateOrFailedCards = 0;

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const note = notes[i];
        const canAdd = canAddFlags[i] ?? true;

        if (canAdd) {
          try {
            const noteId = await this.invoke<number>("addNote", { note });
            results[i] = noteId;
            addedCards++;
          } catch {
            duplicateOrFailedCards++;
          }
        } else {
          // Existing note in Anki: look up existing note ID and update fields
          try {
            const escapedQuestion = card.question.replace(/["\\]/g, "\\$&");
            const escapedDeck = note.deckName.replace(/["\\]/g, "\\$&");
            let existingIds = await this.invoke<number[]>("findNotes", {
              query: `deck:"${escapedDeck}" "Front:${escapedQuestion}"`,
            });
            if (!existingIds || existingIds.length === 0) {
              existingIds = await this.invoke<number[]>("findNotes", {
                query: `deck:"${escapedDeck}" "${escapedQuestion}"`,
              });
            }

            if (existingIds && existingIds.length > 0) {
              const noteId = existingIds[0];
              await this.invoke("updateNoteFields", {
                note: {
                  id: noteId,
                  fields: note.fields,
                },
              });
              if (card.tags && card.tags.length > 0) {
                try {
                  await this.invoke("setNoteTags", {
                    note: noteId,
                    tags: card.tags.join(" "),
                  });
                } catch {
                  // Ignore tag errors if unsupported
                }
              }
              results[i] = noteId;
              updatedCards++;
            } else {
              duplicateOrFailedCards++;
            }
          } catch {
            duplicateOrFailedCards++;
          }
        }
      }

      return {
        totalCards: cards.length,
        addedCards,
        updatedCards,
        duplicateOrFailedCards,
        noteIds: results,
      };
    } catch (err: any) {
      return {
        totalCards: cards.length,
        addedCards: 0,
        updatedCards: 0,
        duplicateOrFailedCards: cards.length,
        noteIds: [],
        error: err.message,
      };
    }
  }

  async export(cards: Flashcard[], options: ExportOptions = {}): Promise<ExportResult> {
    const result = await this.syncCards(cards, options);

    const totalSuccessful = result.addedCards + result.updatedCards;

    if (result.error) {
      return {
        format: "ankiconnect",
        successCount: totalSuccessful,
        message: `AnkiConnect live sync failed: ${result.error}`,
      };
    }

    const details: string[] = [];
    if (result.addedCards > 0) details.push(`${result.addedCards} added`);
    if (result.updatedCards > 0) details.push(`${result.updatedCards} updated`);
    if (result.duplicateOrFailedCards > 0) details.push(`${result.duplicateOrFailedCards} skipped`);

    return {
      format: "ankiconnect",
      successCount: totalSuccessful,
      message: `Successfully synced ${totalSuccessful} cards to Anki (${details.join(", ") || "up to date"}).`,
    };
  }
}
