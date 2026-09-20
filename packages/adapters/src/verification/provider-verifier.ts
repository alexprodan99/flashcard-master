import { Client, LogLevel, isNotionClientError, APIErrorCode } from "@notionhq/client";
import type {
  ProviderVerifierPort,
  ProviderVerificationResult,
  SecretProvider,
} from "@flashcard-master/core";

export interface ProviderVerifierConfig {
  customFetch?: typeof fetch;
  defaultTimeoutMs?: number;
}

const BRAND_NAMES: Record<string, string> = {
  notion: "Notion",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  ollama: "Ollama",
};

export class ProviderVerifier implements ProviderVerifierPort {
  private readonly fetchFn: typeof fetch;
  private readonly defaultTimeoutMs: number;

  constructor(config: ProviderVerifierConfig = {}) {
    this.fetchFn = config.customFetch ?? globalThis.fetch;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 3000;
  }

  private getBrandName(provider: string): string {
    return BRAND_NAMES[provider.toLowerCase()] || provider;
  }

  private formatTimeoutMessage(provider: string, timeoutMs: number): string {
    const brand = this.getBrandName(provider);
    const durationSec = Math.max(1, Math.round(timeoutMs / 1000));
    return `Connection to ${brand} timed out after ${durationSec} second${durationSec === 1 ? "" : "s"}.`;
  }

  async verify(options: {
    provider: SecretProvider | string;
    key?: string | null;
    endpoint?: string | null;
    timeoutMs?: number;
  }): Promise<ProviderVerificationResult> {
    if (!options || typeof options !== "object") {
      return {
        success: false,
        message: "Options object is required.",
      };
    }

    const provider = (options.provider || "").trim().toLowerCase();
    const key = typeof options.key === "string" && options.key.trim().length > 0 ? options.key.trim() : null;
    const endpoint = typeof options.endpoint === "string" && options.endpoint.trim().length > 0 ? options.endpoint.trim() : null;
    const timeoutMs = typeof options.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : this.defaultTimeoutMs;

    switch (provider) {
      case "notion":
        return this.verifyNotion(key, endpoint, timeoutMs);
      case "openai":
        return this.verifyOpenAI(key, endpoint, timeoutMs);
      case "anthropic":
        return this.verifyAnthropic(key, endpoint, timeoutMs);
      case "gemini":
        return this.verifyGemini(key, endpoint, timeoutMs);
      case "ollama":
        return this.verifyOllama(key, endpoint, timeoutMs);
      default:
        return {
          success: false,
          message: `Unsupported provider "${options.provider}".`,
        };
    }
  }

  private async verifyNotion(
    key: string | null,
    endpoint: string | null,
    timeoutMs: number
  ): Promise<ProviderVerificationResult> {
    if (!key) {
      return {
        success: false,
        message: "No Notion API token provided. Please enter an integration secret.",
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error("timed out"));
    }, timeoutMs);

    try {
      const client = new Client({
        auth: key,
        baseUrl: endpoint || undefined,
        timeoutMs,
        logLevel: LogLevel.ERROR,
        fetch: (url, init) => this.fetchFn(url, { ...init, signal: controller.signal }),
      });

      const me = await client.users.me({});
      clearTimeout(timeoutId);

      const botName = (me as any)?.name || "Bot";
      const workspaceName = (me as any)?.bot?.workspace_name || undefined;

      const message = workspaceName
        ? `Connected to Notion: Bot "${botName}" in "${workspaceName}".`
        : `Connected to Notion: Bot "${botName}".`;

      return {
        success: true,
        message,
        details: {
          botName,
          workspaceName,
          userId: me?.id,
        },
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (controller.signal.aborted || err?.name === "AbortError" || err?.message?.includes("timed out")) {
        return {
          success: false,
          message: this.formatTimeoutMessage("notion", timeoutMs),
        };
      }

      if (isNotionClientError(err)) {
        if (err.code === APIErrorCode.Unauthorized) {
          return {
            success: false,
            message: "Notion authentication failed: invalid API token.",
          };
        }
        if (err.code === APIErrorCode.RateLimited) {
          return {
            success: false,
            message: "Notion rate limit exceeded.",
          };
        }
      }

      return {
        success: false,
        message: `Failed to connect to Notion: ${err?.message || String(err)}`,
      };
    }
  }

  private async verifyOpenAI(
    key: string | null,
    endpoint: string | null,
    timeoutMs: number
  ): Promise<ProviderVerificationResult> {
    const baseUrl = (endpoint || "https://api.openai.com/v1").replace(/\/+$/, "");
    const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");

    if (!key && !isLocal) {
      return {
        success: false,
        message: "No OpenAI API key provided. Please enter an API key.",
      };
    }

    const url = `${baseUrl}/models`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error("timed out")), timeoutMs);

    try {
      const headers: Record<string, string> = {};
      if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      }

      const response = await this.fetchFn(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = (await response.json().catch(() => null)) as any;

      if (response.ok) {
        if (data && (Array.isArray(data.data) || data.object === "list")) {
          const modelCount = Array.isArray(data.data) ? data.data.length : undefined;
          return {
            success: true,
            message: "Connected to OpenAI successfully.",
            details: modelCount !== undefined ? { modelCount } : undefined,
          };
        }
        return {
          success: false,
          message: "Connected to endpoint, but received an unexpected response format from OpenAI.",
        };
      }

      if (response.status === 401) {
        return {
          success: false,
          message: "OpenAI authentication failed: invalid API key.",
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          message: "OpenAI rate limit or quota exceeded.",
        };
      }

      const extractedError = data?.error?.message || response.statusText || "Request failed";
      return {
        success: false,
        message: `OpenAI error (${response.status}): ${extractedError}`,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted || err?.name === "AbortError" || err?.message?.includes("timed out")) {
        return {
          success: false,
          message: this.formatTimeoutMessage("openai", timeoutMs),
        };
      }
      return {
        success: false,
        message: `Cannot connect to OpenAI at ${baseUrl}: ${err?.message || "network error"}.`,
      };
    }
  }

  private async verifyAnthropic(
    key: string | null,
    endpoint: string | null,
    timeoutMs: number
  ): Promise<ProviderVerificationResult> {
    if (!key) {
      return {
        success: false,
        message: "No Anthropic API key provided. Please enter an API key.",
      };
    }

    const baseUrl = (endpoint || "https://api.anthropic.com/v1").replace(/\/+$/, "");
    const url = `${baseUrl}/models`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error("timed out")), timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => null)) as any;

      if (response.ok) {
        clearTimeout(timeoutId);
        if (data && (Array.isArray(data.data) || data.data !== undefined)) {
          const modelCount = Array.isArray(data.data) ? data.data.length : undefined;
          return {
            success: true,
            message: "Connected to Anthropic successfully.",
            details: modelCount !== undefined ? { modelCount } : undefined,
          };
        }
        return {
          success: false,
          message: "Connected to endpoint, but received an unexpected response format from Anthropic.",
        };
      }

      // If 404 (e.g. proxy without /models endpoint), fallback to minimal 1-token message probe
      if (response.status === 404) {
        const fallbackRes = await this.fetchFn(`${baseUrl}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const fallbackData = (await fallbackRes.json().catch(() => null)) as any;

        if (fallbackRes.ok) {
          return {
            success: true,
            message: "Connected to Anthropic successfully.",
          };
        }

        if (fallbackRes.status === 401) {
          return {
            success: false,
            message: "Anthropic authentication failed: invalid API key.",
          };
        }
        if (fallbackRes.status === 429) {
          return {
            success: false,
            message: "Anthropic rate limit or quota exceeded.",
          };
        }
        const extractedFallback = fallbackData?.error?.message || fallbackRes.statusText || "Request failed";
        return {
          success: false,
          message: `Anthropic error (${fallbackRes.status}): ${extractedFallback}`,
        };
      }

      clearTimeout(timeoutId);
      if (response.status === 401) {
        return {
          success: false,
          message: "Anthropic authentication failed: invalid API key.",
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          message: "Anthropic rate limit or quota exceeded.",
        };
      }

      const extractedError = data?.error?.message || response.statusText || "Request failed";
      return {
        success: false,
        message: `Anthropic error (${response.status}): ${extractedError}`,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted || err?.name === "AbortError" || err?.message?.includes("timed out")) {
        return {
          success: false,
          message: this.formatTimeoutMessage("anthropic", timeoutMs),
        };
      }
      return {
        success: false,
        message: `Cannot connect to Anthropic at ${baseUrl}: ${err?.message || "network error"}.`,
      };
    }
  }

  private async verifyGemini(
    key: string | null,
    endpoint: string | null,
    timeoutMs: number
  ): Promise<ProviderVerificationResult> {
    if (!key) {
      return {
        success: false,
        message: "No Google Gemini API key provided. Please enter an API key.",
      };
    }

    const baseUrl = (endpoint || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    const url = `${baseUrl}/models`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error("timed out")), timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = (await response.json().catch(() => null)) as any;

      if (response.ok) {
        if (data && Array.isArray(data.models)) {
          const modelCount = data.models.length;
          return {
            success: true,
            message: "Connected to Google Gemini successfully.",
            details: { modelCount },
          };
        }
        return {
          success: false,
          message: "Connected to endpoint, but received an unexpected response format from Google Gemini.",
        };
      }

      const errorMsg = data?.error?.message || "";
      if (
        response.status === 401 ||
        response.status === 403 ||
        (response.status === 400 && errorMsg.toLowerCase().includes("api key"))
      ) {
        return {
          success: false,
          message: "Google Gemini authentication failed: invalid API key.",
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          message: "Google Gemini rate limit or quota exceeded.",
        };
      }

      const extractedError = errorMsg || response.statusText || "Request failed";
      return {
        success: false,
        message: `Google Gemini error (${response.status}): ${extractedError}`,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted || err?.name === "AbortError" || err?.message?.includes("timed out")) {
        return {
          success: false,
          message: this.formatTimeoutMessage("gemini", timeoutMs),
        };
      }
      return {
        success: false,
        message: `Cannot connect to Google Gemini: ${err?.message || "network error"}.`,
      };
    }
  }

  private async verifyOllama(
    key: string | null,
    endpoint: string | null,
    timeoutMs: number
  ): Promise<ProviderVerificationResult> {
    const baseUrl = (endpoint || "http://localhost:11434").replace(/\/+$/, "");
    const url = `${baseUrl}/api/tags`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error("timed out")), timeoutMs);

    try {
      const headers: Record<string, string> = {};
      if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      }

      const response = await this.fetchFn(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = (await response.json().catch(() => null)) as any;

      if (response.ok) {
        if (data && Array.isArray(data.models)) {
          const modelNames: string[] = data.models
            .map((m: any) => m?.name)
            .filter((n: any) => typeof n === "string" && n.length > 0);

          const message =
            modelNames.length > 0
              ? `Connected to Ollama (${modelNames.length} models installed: ${modelNames.slice(0, 3).join(", ")}${modelNames.length > 3 ? "..." : ""}).`
              : "Connected to Ollama (no models currently installed).";

          return {
            success: true,
            message,
            details: {
              models: modelNames,
            },
          };
        }
        return {
          success: false,
          message: "Connected to endpoint, but received an unexpected response format from Ollama.",
        };
      }

      if (response.status === 401) {
        return {
          success: false,
          message: "Ollama authentication failed: invalid or missing API key/token.",
        };
      }

      return {
        success: false,
        message: `Cannot connect to Ollama at ${baseUrl}: HTTP ${response.status} ${response.statusText}.`,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted || err?.name === "AbortError" || err?.message?.includes("timed out")) {
        return {
          success: false,
          message: this.formatTimeoutMessage("ollama", timeoutMs),
        };
      }
      return {
        success: false,
        message: `Cannot connect to Ollama at ${baseUrl}: instance unreachable or offline.`,
      };
    }
  }
}
