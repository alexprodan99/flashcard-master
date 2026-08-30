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
  duplicateOrFailedCards: number;
  noteIds: Array<number | null>;
  error?: string;
}

export class AnkiConnectAdapter implements ExporterPort {
  readonly format = "ankiconnect" as const;
  private readonly endpointUrl: string;
  private readonly timeoutMs: number;
  private readonly apiKey?: string;

  constructor(options: AnkiConnectOptions = {}) {
    this.endpointUrl = options.endpointUrl || "http://127.0.0.1:8765";
    this.timeoutMs = options.timeoutMs || 3000;
    this.apiKey = options.apiKey;
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload: Record<string, any> = {
        action,
        version: 6,
        params,
      };

      if (this.apiKey) {
        payload.key = this.apiKey;
      }

      const res = await fetch(this.endpointUrl, {
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
        duplicateOrFailedCards: 0,
        noteIds: [],
      };
    }

    const health = await this.checkHealth();
    if (!health.isOnline) {
      return {
        totalCards: cards.length,
        addedCards: 0,
        duplicateOrFailedCards: cards.length,
        noteIds: [],
        error: `AnkiConnect is offline or unreachable: ${health.error}`,
      };
    }

    const deckName = options.targetDeck || cards[0].targetDeck || "Default";
    const includeCitation = options.includeCitationFootnotes ?? true;

    try {
      // 1. Ensure deck exists in Anki
      await this.createDeck(deckName);

      // 2. Format notes array
      const notes = cards.map((c) => {
        let backHtml = this.escapeHtml(c.answer);
        if (includeCitation && c.sourceQuote) {
          backHtml += `<div class="citation"><strong>Source Citation:</strong> "${this.escapeHtml(c.sourceQuote)}"</div>`;
        }

        return {
          deckName,
          modelName: "Basic",
          fields: {
            Front: this.escapeHtml(c.question),
            Back: backHtml,
          },
          tags: c.tags || [],
          options: {
            allowDuplicate: false,
            duplicateScope: "deck",
          },
        };
      });

      // 3. Send batch addNotes request
      const results = await this.invoke<Array<number | null>>("addNotes", { notes });

      const addedCards = results.filter((id) => id !== null).length;
      const duplicateOrFailedCards = results.filter((id) => id === null).length;

      return {
        totalCards: cards.length,
        addedCards,
        duplicateOrFailedCards,
        noteIds: results,
      };
    } catch (err: any) {
      return {
        totalCards: cards.length,
        addedCards: 0,
        duplicateOrFailedCards: cards.length,
        noteIds: [],
        error: err.message,
      };
    }
  }

  async export(cards: Flashcard[], options: ExportOptions = {}): Promise<ExportResult> {
    const result = await this.syncCards(cards, options);

    if (result.error) {
      return {
        format: "ankiconnect",
        successCount: result.addedCards,
        message: `AnkiConnect live sync failed: ${result.error}`,
      };
    }

    return {
      format: "ankiconnect",
      successCount: result.addedCards,
      message: `Successfully synced ${result.addedCards} cards to Anki (${result.duplicateOrFailedCards} duplicates/skipped).`,
    };
  }
}
