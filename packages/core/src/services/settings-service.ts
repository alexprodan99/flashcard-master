import type { SettingsRepository } from "../ports/index.js";
import {
  type ProviderKeyStatus,
  type SecretProvider,
  type GeneralSettings,
  type GeneralSettingsResponse,
  type SettingSource,
  ProviderKeyStatusSchema,
  GeneralSettingsSchema,
  GeneralSettingsResponseSchema,
} from "../domain/models.js";

export const SUPPORTED_PROVIDERS: SecretProvider[] = [
  "openai",
  "anthropic",
  "gemini",
  "ollama",
  "notion",
];

const ENV_KEY_MAP: Record<SecretProvider, string[]> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  gemini: ["GEMINI_API_KEY"],
  notion: ["NOTION_API_KEY"],
  ollama: ["OLLAMA_API_KEY"],
};

const ENV_ENDPOINT_MAP: Record<SecretProvider, string[]> = {
  openai: ["OPENAI_BASE_URL"],
  anthropic: ["ANTHROPIC_BASE_URL"],
  gemini: ["GEMINI_BASE_URL"],
  notion: [],
  ollama: ["OLLAMA_HOST", "OLLAMA_BASE_URL"],
};

export interface GeneralSettingMeta<T> {
  key: keyof GeneralSettings;
  dbKey: string;
  envKeys: string[];
  defaultValue: T;
  parse: (val: string) => T;
}

export const GENERAL_SETTINGS_REGISTRY: GeneralSettingMeta<any>[] = [
  // Anki Desktop Integration
  {
    key: "ankiconnectUrl",
    dbKey: "ankiconnect_url",
    envKeys: ["ANKI_CONNECT_URL", "ANKICONNECT_URL"],
    defaultValue: "http://127.0.0.1:8765",
    parse: (v: string) => v.trim(),
  },
  {
    key: "ankiconnectApiKey",
    dbKey: "ankiconnect_api_key",
    envKeys: ["ANKI_CONNECT_API_KEY", "ANKICONNECT_API_KEY"],
    defaultValue: "",
    parse: (v: string) => v.trim(),
  },
  {
    key: "ankiconnectTimeoutMs",
    dbKey: "ankiconnect_timeout_ms",
    envKeys: ["ANKI_CONNECT_TIMEOUT_MS", "ANKICONNECT_TIMEOUT_MS"],
    defaultValue: 3000,
    parse: (v: string) => {
      const n = parseInt(v, 10);
      return Number.isNaN(n) || n <= 0 ? 3000 : n;
    },
  },
  // AI Generation Defaults
  {
    key: "defaultAiProvider",
    dbKey: "default_ai_provider",
    envKeys: ["DEFAULT_AI_PROVIDER"],
    defaultValue: "ollama",
    parse: (v: string) => v.trim(),
  },
  {
    key: "defaultAiModel",
    dbKey: "default_ai_model",
    envKeys: ["DEFAULT_AI_MODEL"],
    defaultValue: "phi4-mini",
    parse: (v: string) => v.trim(),
  },
  {
    key: "defaultPersona",
    dbKey: "default_persona",
    envKeys: ["DEFAULT_PERSONA"],
    defaultValue: "socratic-mentor",
    parse: (v: string) => v.trim(),
  },
  {
    key: "defaultDifficulty",
    dbKey: "default_difficulty",
    envKeys: ["DEFAULT_DIFFICULTY"],
    defaultValue: "intermediate",
    parse: (v: string) => (["beginner", "intermediate", "expert", "mixed"].includes(v.trim()) ? v.trim() : "intermediate"),
  },
  {
    key: "defaultCardLimit",
    dbKey: "default_card_limit",
    envKeys: ["DEFAULT_CARD_LIMIT"],
    defaultValue: 5,
    parse: (v: string) => {
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? 5 : Math.max(1, Math.min(50, n));
    },
  },
  {
    key: "defaultGroundingEnforced",
    dbKey: "default_grounding_enforced",
    envKeys: ["DEFAULT_GROUNDING_ENFORCED"],
    defaultValue: true,
    parse: (v: string) => v === "true" || v === "1",
  },
  // Worker Pool & Task Processing
  {
    key: "maxGenerationWorkers",
    dbKey: "max_generation_workers",
    envKeys: ["MAX_GENERATION_WORKERS"],
    defaultValue: 2,
    parse: (v: string) => {
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? 2 : Math.max(1, Math.min(16, n));
    },
  },
  {
    key: "maxSyncWorkers",
    dbKey: "max_sync_workers",
    envKeys: ["MAX_SYNC_WORKERS"],
    defaultValue: 2,
    parse: (v: string) => {
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? 2 : Math.max(1, Math.min(16, n));
    },
  },
  {
    key: "maxExportWorkers",
    dbKey: "max_export_workers",
    envKeys: ["MAX_EXPORT_WORKERS"],
    defaultValue: 2,
    parse: (v: string) => {
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? 2 : Math.max(1, Math.min(16, n));
    },
  },
  {
    key: "workerTimeoutMinutes",
    dbKey: "worker_timeout_minutes",
    envKeys: ["WORKER_TIMEOUT_MINUTES"],
    defaultValue: 15,
    parse: (v: string) => {
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? 15 : Math.max(1, Math.min(120, n));
    },
  },
  // Slicing Defaults
  {
    key: "defaultSlicingMode",
    dbKey: "default_slicing_mode",
    envKeys: ["DEFAULT_SLICING_MODE"],
    defaultValue: "outline",
    parse: (v: string) => (["outline", "budget", "none"].includes(v.trim()) ? v.trim() : "outline"),
  },
  {
    key: "defaultPageBudget",
    dbKey: "default_page_budget",
    envKeys: ["DEFAULT_PAGE_BUDGET"],
    defaultValue: 10,
    parse: (v: string) => {
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? 10 : Math.max(1, Math.min(100, n));
    },
  },
  // EPUB Publishing Metadata
  {
    key: "epubDefaultAuthor",
    dbKey: "epub_default_author",
    envKeys: ["EPUB_DEFAULT_AUTHOR"],
    defaultValue: "Flashcard Master",
    parse: (v: string) => v.trim(),
  },
  {
    key: "epubDefaultPublisher",
    dbKey: "epub_default_publisher",
    envKeys: ["EPUB_DEFAULT_PUBLISHER"],
    defaultValue: "Flashcard Master Studio",
    parse: (v: string) => v.trim(),
  },
];

export class SettingsService {
  constructor(
    private readonly settingsRepo: SettingsRepository,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) { }

  private getEnvValue(keys: string[]): string | null {
    for (const k of keys) {
      const val = this.env[k];
      if (val && typeof val === "string" && val.trim().length > 0) {
        return val.trim();
      }
    }
    return null;
  }

  maskSecret(secret: string): string {
    if (!secret || typeof secret !== "string") {
      return "";
    }
    const trimmed = secret.trim();
    if (trimmed.length === 0) {
      return "";
    }
    if (trimmed.length <= 10) {
      return "****";
    }
    return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
  }

  getSecret(provider: string): string | null {
    const p = (provider || "").trim().toLowerCase() as SecretProvider;
    // 1. Check SQLite database first
    const dbKey = this.settingsRepo.get(`${p}_api_key`);
    if (dbKey && dbKey.trim().length > 0) {
      return dbKey.trim();
    }

    // 2. Check environment variable fallback
    const envKeys = ENV_KEY_MAP[p] || [`${p.toUpperCase()}_API_KEY`];
    return this.getEnvValue(envKeys);
  }

  getEndpoint(provider: string): string | null {
    const p = (provider || "").trim().toLowerCase() as SecretProvider;
    const dbKeyName = p === "ollama" ? "ollama_host" : `${p}_endpoint`;

    // 1. Check SQLite database
    const dbEndpoint = this.settingsRepo.get(dbKeyName);
    if (dbEndpoint && dbEndpoint.trim().length > 0) {
      return dbEndpoint.trim();
    }

    // 2. Check environment fallback
    const envKeys = ENV_ENDPOINT_MAP[p] || [`${p.toUpperCase()}_BASE_URL`];
    const envVal = this.getEnvValue(envKeys);
    if (envVal) {
      return envVal;
    }

    if (p === "ollama") {
      return "http://localhost:11434";
    }

    return null;
  }

  setProviderSecret(provider: string, secret?: string | null, endpoint?: string | null): void {
    const p = (provider || "").trim().toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(p as SecretProvider)) {
      throw new Error(`Unsupported secret provider: "${provider}". Must be one of: ${SUPPORTED_PROVIDERS.join(", ")}`);
    }
    if (secret !== undefined) {
      if (secret !== null && secret.trim().length > 0) {
        this.settingsRepo.set(`${p}_api_key`, secret.trim());
      } else {
        this.settingsRepo.delete(`${p}_api_key`);
      }
    }

    const endpointKeyName = p === "ollama" ? "ollama_host" : `${p}_endpoint`;
    if (endpoint !== undefined) {
      if (endpoint !== null && endpoint.trim().length > 0) {
        this.settingsRepo.set(endpointKeyName, endpoint.trim());
      } else {
        this.settingsRepo.delete(endpointKeyName);
      }
    }
  }

  deleteProviderSecret(provider: string): boolean {
    const p = (provider || "").trim().toLowerCase();
    const keyDeleted = this.settingsRepo.delete(`${p}_api_key`);
    const endpointKeyName = p === "ollama" ? "ollama_host" : `${p}_endpoint`;
    const endpointDeleted = this.settingsRepo.delete(endpointKeyName);
    return keyDeleted || endpointDeleted;
  }

  getKeyStatus(provider: string): ProviderKeyStatus {
    const p = (provider || "").trim().toLowerCase() as SecretProvider;
    const dbKeyMeta = this.settingsRepo.getWithMetadata ? this.settingsRepo.getWithMetadata(`${p}_api_key`) : null;
    const dbKey = dbKeyMeta ? dbKeyMeta.value : this.settingsRepo.get(`${p}_api_key`);

    const dbEndpointKeyName = p === "ollama" ? "ollama_host" : `${p}_endpoint`;
    const dbEndpointMeta = this.settingsRepo.getWithMetadata ? this.settingsRepo.getWithMetadata(dbEndpointKeyName) : null;
    const dbEndpoint = dbEndpointMeta ? dbEndpointMeta.value : this.settingsRepo.get(dbEndpointKeyName);

    const envKeys = ENV_KEY_MAP[p] || [`${p.toUpperCase()}_API_KEY`];
    const envKey = this.getEnvValue(envKeys);
    const envEndpoints = ENV_ENDPOINT_MAP[p] || [`${p.toUpperCase()}_BASE_URL`];
    const envEndpoint = this.getEnvValue(envEndpoints);

    let isConfigured = false;
    let maskedValue = "";
    let source: "database" | "environment" | "none" = "none";
    let updatedAt: string | undefined = undefined;

    if (dbKey && dbKey.trim().length > 0) {
      isConfigured = true;
      maskedValue = this.maskSecret(dbKey);
      source = "database";
      updatedAt = dbKeyMeta?.updatedAt;
    } else if (envKey && envKey.trim().length > 0) {
      isConfigured = true;
      maskedValue = this.maskSecret(envKey);
      source = "environment";
    } else if (p === "ollama" && dbEndpoint && dbEndpoint.trim().length > 0) {
      isConfigured = true;
      maskedValue = "";
      source = "database";
      updatedAt = dbEndpointMeta?.updatedAt;
    } else if (p === "ollama" && envEndpoint && envEndpoint.trim().length > 0) {
      isConfigured = true;
      maskedValue = "";
      source = "environment";
    }

    const endpoint = (dbEndpoint && dbEndpoint.trim().length > 0 ? dbEndpoint.trim() : null) ?? envEndpoint ?? (p === "ollama" ? "http://localhost:11434" : null);

    const status: ProviderKeyStatus = {
      provider: p,
      isConfigured,
      maskedValue,
      source,
      endpoint: endpoint || null,
      updatedAt,
    };

    return ProviderKeyStatusSchema.parse(status);
  }

  getAllKeyStatuses(): Record<string, ProviderKeyStatus> {
    const result: Record<string, ProviderKeyStatus> = {};
    for (const p of SUPPORTED_PROVIDERS) {
      result[p] = this.getKeyStatus(p);
    }
    return result;
  }

  listProviderStatuses(): ProviderKeyStatus[] {
    return SUPPORTED_PROVIDERS.map((p) => this.getKeyStatus(p));
  }

  getSetting(key: string): string | null {
    return this.settingsRepo.get(key);
  }

  setSetting(key: string, value: string): void {
    this.settingsRepo.set(key, value);
  }

  deleteSetting(key: string): boolean {
    return this.settingsRepo.delete(key);
  }

  isVerboseLogging(): boolean {
    const dbVal = this.settingsRepo.get("verbose_logging");
    if (dbVal !== null) {
      return dbVal === "true" || dbVal === "1";
    }
    const envVal = this.env.VERBOSE || this.env.DEBUG || this.env.LOG_LEVEL;
    return (
      envVal === "true" ||
      envVal === "1" ||
      envVal === "*" ||
      (typeof envVal === "string" && envVal.toLowerCase() === "debug")
    );
  }

  setVerboseLogging(enabled: boolean): void {
    this.settingsRepo.set("verbose_logging", enabled ? "true" : "false");
    if (enabled) {
      this.settingsRepo.set("log_level", "debug");
    } else if (this.settingsRepo.get("log_level") === "debug") {
      this.settingsRepo.set("log_level", "info");
    }
  }

  getLogLevel(): "debug" | "info" | "warn" | "error" {
    const dbVal = this.settingsRepo.get("log_level");
    if (dbVal && ["debug", "info", "warn", "error"].includes(dbVal.toLowerCase())) {
      return dbVal.toLowerCase() as "debug" | "info" | "warn" | "error";
    }
    if (this.isVerboseLogging()) {
      return "debug";
    }
    return "info";
  }

  setLogLevel(level: string): void {
    const norm = (level || "").trim().toLowerCase();
    if (["debug", "info", "warn", "error"].includes(norm)) {
      this.settingsRepo.set("log_level", norm);
      if (norm === "debug") {
        this.settingsRepo.set("verbose_logging", "true");
      } else {
        this.settingsRepo.set("verbose_logging", "false");
      }
    }
  }

  getRawAnkiApiKey(): string | undefined {
    const dbKey = this.settingsRepo.get("ankiconnect_api_key");
    if (dbKey && dbKey.trim().length > 0) {
      return dbKey.trim();
    }
    const envKey = this.getEnvValue(["ANKI_CONNECT_API_KEY", "ANKICONNECT_API_KEY"]);
    if (envKey && envKey.trim().length > 0) {
      return envKey.trim();
    }
    return undefined;
  }

  getGeneralSettings(): GeneralSettingsResponse {
    const settings: Record<string, any> = {};
    const sources: Record<string, SettingSource> = {};

    for (const meta of GENERAL_SETTINGS_REGISTRY) {
      const dbVal = this.settingsRepo.get(meta.dbKey);
      if (dbVal !== null && dbVal.trim().length > 0) {
        settings[meta.key] = meta.parse(dbVal);
        sources[meta.key] = "database";
      } else {
        const envVal = this.getEnvValue(meta.envKeys);
        if (envVal !== null && envVal.trim().length > 0) {
          settings[meta.key] = meta.parse(envVal);
          sources[meta.key] = "environment";
        } else {
          settings[meta.key] = meta.defaultValue;
          sources[meta.key] = "default";
        }
      }
    }

    const rawApiKey = this.getRawAnkiApiKey() || "";
    const maskedApiKey = this.maskSecret(rawApiKey);
    settings.ankiconnectApiKey = maskedApiKey;

    return GeneralSettingsResponseSchema.parse({
      settings: GeneralSettingsSchema.parse(settings),
      sources,
      maskedApiKey,
    });
  }

  updateGeneralSettings(updates: Partial<GeneralSettings>): GeneralSettingsResponse {
    for (const meta of GENERAL_SETTINGS_REGISTRY) {
      if (!(meta.key in updates)) continue;
      const val = (updates as any)[meta.key];

      if (meta.key === "ankiconnectApiKey") {
        if (typeof val === "string") {
          const trimmed = val.trim();
          if (
            trimmed.startsWith("***") ||
            trimmed === "****" ||
            trimmed.includes("...") ||
            (trimmed.length >= 7 && trimmed.slice(3, -4) === "...")
          ) {
            continue;
          }
          if (trimmed.length === 0) {
            this.settingsRepo.delete(meta.dbKey);
          } else {
            this.settingsRepo.set(meta.dbKey, trimmed);
          }
        } else if (val === null) {
          this.settingsRepo.delete(meta.dbKey);
        }
        continue;
      }

      if (val === null || val === undefined) {
        this.settingsRepo.delete(meta.dbKey);
      } else {
        const parsed = meta.parse(String(val));
        this.settingsRepo.set(meta.dbKey, String(parsed));
      }
    }

    return this.getGeneralSettings();
  }

  getAnkiConnectOptions(): { endpointUrl: string; apiKey?: string; timeoutMs: number } {
    const general = this.getGeneralSettings().settings;
    return {
      endpointUrl: general.ankiconnectUrl,
      apiKey: this.getRawAnkiApiKey(),
      timeoutMs: general.ankiconnectTimeoutMs,
    };
  }

  getWorkerConcurrencyLimits(): {
    maxGenerationWorkers: number;
    maxSyncWorkers: number;
    maxExportWorkers: number;
    workerTimeoutMinutes: number;
  } {
    const s = this.getGeneralSettings().settings;
    return {
      maxGenerationWorkers: s.maxGenerationWorkers,
      maxSyncWorkers: s.maxSyncWorkers,
      maxExportWorkers: s.maxExportWorkers,
      workerTimeoutMinutes: s.workerTimeoutMinutes,
    };
  }

  getAiDefaults() {
    const s = this.getGeneralSettings().settings;
    return {
      provider: s.defaultAiProvider,
      model: s.defaultAiModel,
      persona: s.defaultPersona,
      difficulty: s.defaultDifficulty,
      cardLimit: s.defaultCardLimit,
      groundingEnforced: s.defaultGroundingEnforced,
    };
  }

  getSlicingDefaults() {
    const s = this.getGeneralSettings().settings;
    return {
      mode: s.defaultSlicingMode,
      pageBudget: s.defaultPageBudget,
    };
  }

  getEpubDefaults() {
    const s = this.getGeneralSettings().settings;
    return {
      author: s.epubDefaultAuthor,
      publisher: s.epubDefaultPublisher,
    };
  }

  get(key: string): string | null {
    const meta = GENERAL_SETTINGS_REGISTRY.find((m) => m.dbKey === key || m.key === key);
    if (meta) {
      const dbVal = this.settingsRepo.get(meta.dbKey);
      if (dbVal !== null && dbVal.trim().length > 0) return dbVal.trim();
      const envVal = this.getEnvValue(meta.envKeys);
      if (envVal !== null && envVal.trim().length > 0) return envVal.trim();
      return String(meta.defaultValue);
    }
    const dbVal = this.settingsRepo.get(key);
    if (dbVal !== null && dbVal.trim().length > 0) return dbVal.trim();
    const envVal = this.env[key] || this.env[key.toUpperCase()];
    if (envVal && typeof envVal === "string" && envVal.trim().length > 0) return envVal.trim();
    return null;
  }
}


