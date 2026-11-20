import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SUPPORTED_PROVIDERS } from "@flashcard-master/core";
import { AudioTrimmer, LocalWhisperSttAdapter, defaultCommandRunner } from "@flashcard-master/adapters";
import type { RouteContext } from "./route-context.js";

/**
 * Handles `/api/settings/*` routes.
 */
export async function handleSettingsRoutes(ctx: RouteContext): Promise<boolean> {
  const { pathname, method, jobManager, settingsService, providerVerifier } = ctx;

  // 15a. GET /api/settings/keys
  if (pathname === "/api/settings/keys" && method === "GET") {
    const keys = settingsService.getAllKeyStatuses();
    const providers = settingsService.listProviderStatuses();
    ctx.sendJson(200, { keys, providers });
    return true;
  }

  // 15d. POST /api/settings/keys/test
  if (pathname === "/api/settings/keys/test" && method === "POST") {
    const body = await ctx.parseBody();
    if (!body || typeof body !== "object" || !body.provider || typeof body.provider !== "string") {
      ctx.sendJson(400, { error: "Field 'provider' is required and must be a string." });
      return true;
    }

    const provider = body.provider.trim().toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(provider as any)) {
      ctx.sendJson(400, {
        error: `Unsupported provider "${body.provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
      });
      return true;
    }

    if (
      ("key" in body && typeof body.key !== "string" && body.key !== null) ||
      ("endpoint" in body && typeof body.endpoint !== "string" && body.endpoint !== null)
    ) {
      ctx.sendJson(400, { error: "'key' and 'endpoint' must be strings or null." });
      return true;
    }

    const candidateKey = typeof body.key === "string" && body.key.trim().length > 0 ? body.key.trim() : null;
    const candidateEndpoint =
      typeof body.endpoint === "string" && body.endpoint.trim().length > 0 ? body.endpoint.trim() : null;

    const keyToTest = candidateKey || settingsService.getSecret(provider);
    const endpointToTest = candidateEndpoint || settingsService.getEndpoint(provider);

    const isLocalOpenAI =
      provider === "openai" &&
      endpointToTest &&
      (endpointToTest.includes("localhost") || endpointToTest.includes("127.0.0.1"));

    if (["openai", "anthropic", "gemini", "notion"].includes(provider) && !keyToTest && !isLocalOpenAI) {
      ctx.sendJson(200, {
        success: false,
        message: `No API key configured for ${provider}. Please enter a key to test.`,
      });
      return true;
    }

    const timeoutMs =
      typeof body.timeoutMs === "number" && body.timeoutMs > 0
        ? Math.min(Math.max(body.timeoutMs, 500), 10000)
        : 3000;

    try {
      const result = await providerVerifier.verify({
        provider,
        key: keyToTest,
        endpoint: endpointToTest,
        timeoutMs,
      });
      ctx.sendJson(200, result);
    } catch (err: any) {
      ctx.sendJson(200, {
        success: false,
        message: `Verification failed: ${err?.message || String(err)}`,
      });
    }
    return true;
  }

  // 15b. POST /api/settings/keys
  if (pathname === "/api/settings/keys" && method === "POST") {
    const body = await ctx.parseBody();
    if (!body || typeof body !== "object" || !body.provider || typeof body.provider !== "string") {
      ctx.sendJson(400, { error: "Field 'provider' is required and must be a string." });
      return true;
    }

    const provider = body.provider.trim().toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(provider as any)) {
      ctx.sendJson(400, {
        error: `Unsupported provider "${body.provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
      });
      return true;
    }

    if (
      ("key" in body && typeof body.key !== "string" && body.key !== null) ||
      ("endpoint" in body && typeof body.endpoint !== "string" && body.endpoint !== null)
    ) {
      ctx.sendJson(400, { error: "'key' and 'endpoint' must be strings or null." });
      return true;
    }

    const rawKey = typeof body.key === "string" ? body.key.trim() : body.key === null ? null : undefined;
    const rawEndpoint =
      typeof body.endpoint === "string" ? body.endpoint.trim() : body.endpoint === null ? null : undefined;

    if (rawKey === undefined && rawEndpoint === undefined) {
      ctx.sendJson(400, { error: "At least one of 'key' or 'endpoint' must be provided." });
      return true;
    }

    settingsService.setProviderSecret(provider, rawKey, rawEndpoint);
    const status = settingsService.getKeyStatus(provider);
    ctx.sendJson(200, { success: true, ...status });
    return true;
  }

  // 15c. DELETE /api/settings/keys/:provider
  if (pathname.startsWith("/api/settings/keys/") && method === "DELETE") {
    const providerRaw = pathname.slice("/api/settings/keys/".length);
    if (!providerRaw || providerRaw.trim().length === 0) {
      ctx.sendJson(400, { error: "Provider is required in URL path." });
      return true;
    }

    const provider = providerRaw.replace(/\/+$/, "").trim().toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(provider as any)) {
      ctx.sendJson(400, {
        error: `Unsupported provider "${providerRaw}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
      });
      return true;
    }

    settingsService.deleteProviderSecret(provider);
    const status = settingsService.getKeyStatus(provider);
    ctx.sendJson(200, { success: true, ...status });
    return true;
  }

  // 15e. GET /api/settings/logging
  if (pathname === "/api/settings/logging" && method === "GET") {
    ctx.sendJson(200, {
      verbose: settingsService.isVerboseLogging(),
      logLevel: settingsService.getLogLevel(),
    });
    return true;
  }

  // 15f. PUT /api/settings/logging
  if (pathname === "/api/settings/logging" && (method === "PUT" || method === "POST")) {
    const body = await ctx.parseBody();
    if (!body || typeof body !== "object") {
      ctx.sendJson(400, { error: "Request body must be an object." });
      return true;
    }

    if ("verbose" in body && typeof body.verbose === "boolean") {
      settingsService.setVerboseLogging(body.verbose);
    }

    if ("logLevel" in body && typeof body.logLevel === "string") {
      const level = body.logLevel.trim().toLowerCase();
      if (!["debug", "info", "warn", "error"].includes(level)) {
        ctx.sendJson(400, { error: "Field 'logLevel' must be one of: debug, info, warn, error" });
        return true;
      }
      settingsService.setLogLevel(level);
    }

    ctx.sendJson(200, {
      success: true,
      verbose: settingsService.isVerboseLogging(),
      logLevel: settingsService.getLogLevel(),
    });
    return true;
  }

  // 15g. GET /api/settings/general
  if (pathname === "/api/settings/general" && method === "GET") {
    ctx.sendJson(200, settingsService.getGeneralSettings());
    return true;
  }

  // 15h. PUT /api/settings/general & POST /api/settings/general
  if (pathname === "/api/settings/general" && (method === "PUT" || method === "POST")) {
    const body = await ctx.parseBody();
    if (!body || typeof body !== "object") {
      ctx.sendJson(400, { error: "Request body must be an object." });
      return true;
    }

    const updated = settingsService.updateGeneralSettings(body);
    if (jobManager) {
      jobManager.updateConcurrencyLimits(settingsService.getWorkerConcurrencyLimits());
    }
    ctx.sendJson(200, updated);
    return true;
  }

  // 15i. POST /api/settings/anki/test
  if (pathname === "/api/settings/anki/test" && method === "POST") {
    const body = await ctx.parseBody();
    const configured = settingsService.getAnkiConnectOptions();

    const endpointUrl =
      typeof body?.endpointUrl === "string" && body.endpointUrl.trim().length > 0
        ? body.endpointUrl.trim()
        : configured.endpointUrl;

    let parsedEndpoint: URL;
    try {
      parsedEndpoint = new URL(endpointUrl);
    } catch {
      ctx.sendJson(200, {
        online: false,
        error: `Invalid AnkiConnect URL "${endpointUrl}".`,
        latencyMs: 0,
      });
      return true;
    }

    if (parsedEndpoint.protocol !== "http:" && parsedEndpoint.protocol !== "https:") {
      ctx.sendJson(200, {
        online: false,
        error: `Unsupported AnkiConnect URL protocol "${parsedEndpoint.protocol}". Expected http: or https:.`,
        latencyMs: 0,
      });
      return true;
    }

    const isMaskedApiKey =
      typeof body?.apiKey === "string" &&
      (body.apiKey.startsWith("***") || body.apiKey === "****" || body.apiKey.includes("..."));
    const apiKey =
      typeof body?.apiKey === "string" && !isMaskedApiKey && body.apiKey.trim().length > 0
        ? body.apiKey.trim()
        : configured.apiKey;

    const timeoutMs =
      typeof body?.timeoutMs === "number" && body.timeoutMs > 0
        ? Math.max(500, Math.min(30000, body.timeoutMs))
        : configured.timeoutMs;

    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const payload: Record<string, any> = { action: "version", version: 6 };
      if (apiKey) payload.key = apiKey;

      const ankiRes = await fetch(parsedEndpoint.href, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;
      if (!ankiRes.ok) {
        ctx.sendJson(200, {
          online: false,
          error: `AnkiConnect HTTP error: ${ankiRes.status} ${ankiRes.statusText}`,
          latencyMs,
        });
        return true;
      }

      const json = (await ankiRes.json()) as any;
      if (json.error) {
        ctx.sendJson(200, {
          online: false,
          error: json.error,
          latencyMs,
        });
        return true;
      }

      ctx.sendJson(200, {
        online: true,
        version: json.result ?? 6,
        latencyMs,
      });
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = err.name === "AbortError";
      ctx.sendJson(200, {
        online: false,
        error: isTimeout
          ? `Connection to AnkiConnect timed out after ${timeoutMs}ms.`
          : err.message || "Failed to reach AnkiConnect",
        latencyMs,
      });
    } finally {
      clearTimeout(timer);
    }
    return true;
  }

  // 15j. GET /api/settings/media/diagnostics
  if (pathname === "/api/settings/media/diagnostics" && method === "GET") {
    const general = settingsService.getGeneralSettings().settings;

    const [ffmpegStatus, whisperStatus, ytDlpStatus] = await Promise.all([
      new AudioTrimmer()
        .probeFfmpeg()
        .then((res) => ({
          available: res.available,
          details: res.version,
          error: res.error,
        }))
        .catch((err: any) => ({
          available: false,
          error: err?.message?.split(/\r?\n/)[0] || "Failed to check ffmpeg availability.",
        })),
      new LocalWhisperSttAdapter({
        endpoint: general.localWhisperEndpoint || undefined,
        model: general.localWhisperModel,
      })
        .probeAvailability()
        .catch((err: any) => ({
          available: false,
          mode: "cli" as const,
          error: err?.message?.split(/\r?\n/)[0] || "Failed to check whisper-local availability.",
        })),
      (async () => {
        const ytDlpCmd = process.env.YT_DLP_PATH?.trim() || "yt-dlp";
        try {
          const res = await defaultCommandRunner(ytDlpCmd, ["--version"], { timeoutMs: 4000 });
          if (res.exitCode === 0) {
            const ver = (res.stdout || res.stderr).split(/\r?\n/)[0]?.trim();
            return {
              available: true,
              mode: "system" as const,
              details: ver ? `yt-dlp ${ver}` : "yt-dlp available on PATH",
            };
          }
        } catch {
          // Fall through to cached binary check
        }

        const cachedName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
        const cachedPath = path.join(os.homedir(), ".flashcard-master", "yt-dlp", cachedName);
        if (fs.existsSync(cachedPath)) {
          return {
            available: true,
            mode: "cached" as const,
            details: "Managed yt-dlp binary cached",
          };
        }

        return {
          available: false,
          mode: "auto-download" as const,
          details: "Not installed on PATH; auto-downloads on first YouTube fallback",
        };
      })(),
    ]);

    ctx.sendJson(200, {
      ffmpeg: ffmpegStatus,
      ytDlp: ytDlpStatus,
      whisperLocal: whisperStatus,
      openaiStt: { configured: Boolean(settingsService.getSecret("openai")) },
      geminiStt: { configured: Boolean(settingsService.getSecret("gemini")) },
    });
    return true;
  }

  return false;
}
