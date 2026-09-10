import type { SettingsRepository } from "../ports/index.js";
import {
  type ProviderKeyStatus,
  type SecretProvider,
  ProviderKeyStatusSchema,
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

export class SettingsService {
  constructor(
    private readonly settingsRepo: SettingsRepository,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

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
}