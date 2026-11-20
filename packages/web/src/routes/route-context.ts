import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DataSourceRepository,
  DocumentRepository,
  MediaService,
  ProviderVerifierPort,
  SettingsService,
  StrategyRegistry,
  SyncStateRepository,
  FlashcardRepository,
} from "@flashcard-master/core";
import type { AnkiConnectHealthCheck } from "../server.js";
import type { JobManager } from "../jobs/index.js";
import type { WorkerExecutor } from "../workers/index.js";
import type { WebServerOptions } from "../server.js";

const DEFAULT_JSON_BODY_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MiB

let cachedVersion: string | null = null;

/**
 * Resolves the `@flashcard-master/web` package version dynamically from package.json.
 */
export function getWebPackageVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(currentDir, "../../package.json"),
      path.resolve(currentDir, "../../../package.json"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, "utf8")) as { version?: unknown };
        if (typeof pkg.version === "string" && pkg.version.trim()) {
          cachedVersion = pkg.version.trim();
          return cachedVersion;
        }
      }
    }
  } catch {
    // Fall back safely if package metadata cannot be read
  }
  cachedVersion = "1.2.0";
  return cachedVersion;
}

/**
 * Validates whether a request `Origin` header belongs to a local loopback or Electron Desktop UI origin.
 * Returns the canonical origin string when allowed, or `null` otherwise (blocking arbitrary third-party CORS access).
 */
export function resolveAllowedCorsOrigin(originHeader?: string | string[]): string | null {
  const rawOrigin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  if (!rawOrigin || typeof rawOrigin !== "string") {
    return null;
  }

  const trimmed = rawOrigin.trim();
  if (!trimmed || trimmed === "null") {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol === "app:") {
    return parsed.host ? `${parsed.protocol}//${parsed.host}` : null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return parsed.origin;
  }

  return null;
}

/**
 * Builds CORS headers restricting cross-origin access strictly to loopback / Desktop origins.
 */
export function buildCorsHeaders(req: http.IncomingMessage): Record<string, string> {
  const allowedOrigin = resolveAllowedCorsOrigin(req.headers.origin);
  if (!allowedOrigin) {
    return {
      Vary: "Origin",
    };
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export interface RouteContext {
  readonly req: http.IncomingMessage;
  readonly res: http.ServerResponse;
  readonly pathname: string;
  readonly method: string;
  readonly query: Record<string, any>;
  readonly options: WebServerOptions;
  readonly jobManager: JobManager | null;
  readonly workerExecutor: WorkerExecutor;
  readonly settingsService: SettingsService;
  readonly providerVerifier: ProviderVerifierPort;
  readonly mediaService: MediaService;
  readonly mediaDir: string;
  readonly localFilesDir: string;
  readonly ankiConnectAdapter: {
    checkHealth(): Promise<AnkiConnectHealthCheck>;
    syncCards(cards: any[], options?: any): Promise<any>;
  };
  sendJson(statusCode: number, data: unknown): void;
  buildCorsHeaders(): Record<string, string>;
  parseBody(): Promise<any>;
  parseJsonBodyStrict(): Promise<any>;
  readRequestBodyBuffer(maxBytes?: number): Promise<Buffer>;
  parseMultipartFormData(bodyBuffer: Buffer, boundary: string): { filename: string; content: Buffer } | null;
  decodeRouteParam(raw: string): string;
}

export function sendJsonResponse(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  statusCode: number,
  data: unknown
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...buildCorsHeaders(req),
  });
  res.end(JSON.stringify(data));
}

export function parseJsonBodyFromRequest(
  req: http.IncomingMessage,
  maxBytes: number = DEFAULT_JSON_BODY_LIMIT_BYTES
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (req.complete || req.readableEnded || req.headers["content-length"] === "0") {
      return resolve({});
    }
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let rejected = false;

    req.on("data", (chunk) => {
      if (rejected) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (maxBytes > 0 && totalBytes > maxBytes) {
        rejected = true;
        const err = new Error(`JSON payload exceeds maximum allowed size (${maxBytes} bytes)`) as Error & {
          statusCode?: number;
        };
        err.statusCode = 413;
        req.pause();
        reject(err);
        return;
      }
      chunks.push(buf);
    });

    req.on("end", () => {
      if (rejected) return;
      const body = Buffer.concat(chunks).toString("utf-8");
      try {
        resolve(body.trim() ? JSON.parse(body) : {});
      } catch {
        const err = new Error("Invalid JSON body") as Error & { statusCode?: number };
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on("error", (err) => {
      if (!rejected) reject(err);
    });
  });
}

export function readRequestBuffer(
  req: http.IncomingMessage,
  maxBytes: number = Number(process.env.MAX_UPLOAD_BYTES) || 100 * 1024 * 1024
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (maxBytes > 0 && totalBytes > maxBytes) {
        rejected = true;
        const err = new Error(`Upload payload exceeds maximum allowed size (${maxBytes} bytes)`) as Error & {
          statusCode?: number;
        };
        err.statusCode = 413;
        req.pause();
        reject(err);
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
    req.on("error", (err) => {
      if (!rejected) reject(err);
    });
  });
}

export function parseMultipartUpload(
  bodyBuffer: Buffer,
  boundary: string
): { filename: string; content: Buffer } | null {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  let startIdx = bodyBuffer.indexOf(boundaryBuf);
  if (startIdx === -1) return null;

  while (startIdx !== -1) {
    const nextStart = startIdx + boundaryBuf.length;
    if (bodyBuffer.subarray(nextStart, nextStart + 2).toString() === "--") {
      break;
    }

    let partStart = nextStart;
    if (bodyBuffer.subarray(partStart, partStart + 2).toString() === "\r\n") {
      partStart += 2;
    } else if (bodyBuffer[partStart] === 0x0a) {
      partStart += 1;
    }

    const nextBoundaryIdx = bodyBuffer.indexOf(boundaryBuf, partStart);
    if (nextBoundaryIdx === -1) break;

    const partBuffer = bodyBuffer.subarray(partStart, nextBoundaryIdx);

    let headerEndIdx = partBuffer.indexOf("\r\n\r\n");
    let bodyOffset = 4;
    if (headerEndIdx === -1) {
      headerEndIdx = partBuffer.indexOf("\n\n");
      bodyOffset = 2;
    }

    if (headerEndIdx !== -1) {
      const headerText = partBuffer.subarray(0, headerEndIdx).toString("utf-8");
      const cdMatch = headerText.match(/Content-Disposition:[^\r\n]*\sfilename=(?:"([^"]+)"|([^;\s\r\n]+))/i);
      if (cdMatch) {
        let filename = cdMatch[1] || cdMatch[2] || "";
        filename = filename.replace(/^["']|["']$/g, "").trim();

        let fileContent = partBuffer.subarray(headerEndIdx + bodyOffset);
        if (fileContent.length >= 2 && fileContent.subarray(fileContent.length - 2).toString() === "\r\n") {
          fileContent = fileContent.subarray(0, fileContent.length - 2);
        } else if (fileContent.length >= 1 && fileContent[fileContent.length - 1] === 0x0a) {
          fileContent = fileContent.subarray(0, fileContent.length - 1);
        }
        return { filename, content: Buffer.from(fileContent) };
      }
    }

    startIdx = nextBoundaryIdx;
  }
  return null;
}

export function decodeUriParamStrict(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    const err = new Error(`Invalid URL encoding in path parameter: "${raw}"`);
    (err as any).statusCode = 400;
    throw err;
  }
}

// Keep unused imports type-safe for downstream consumers
export type {
  DataSourceRepository,
  DocumentRepository,
  FlashcardRepository,
  StrategyRegistry,
  SyncStateRepository,
};
