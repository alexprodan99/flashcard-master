import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { MediaAsset } from "../domain/models.js";
import { getDefaultMediaDirectory } from "../storage/db.js";

export interface MediaServiceOptions {
  mediaDir?: string;
  customFetch?: typeof fetch;
  timeoutMs?: number;
}

export class MediaService {
  private readonly mediaDir: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: MediaServiceOptions = {}) {
    this.mediaDir = options.mediaDir || getDefaultMediaDirectory();
    this.fetchFn = options.customFetch || globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10000;

    if (!fs.existsSync(this.mediaDir)) {
      fs.mkdirSync(this.mediaDir, { recursive: true });
    }
  }

  getMediaDirectory(): string {
    return this.mediaDir;
  }

  sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== "string") {
      return "";
    }
    // Extract base filename and strip any null bytes or traversal characters
    const base = path.basename(filename.replace(/\0/g, ""));
    return base;
  }

  getMediaPath(filename: string): string {
    const safeName = this.sanitizeFilename(filename);
    if (!safeName || safeName === "." || safeName === "..") {
      throw new Error(`Invalid media filename: "${filename}"`);
    }
    const resolvedDir = path.resolve(this.mediaDir);
    const targetPath = path.resolve(this.mediaDir, safeName);

    // Verify path does not escape media directory
    if (!targetPath.startsWith(resolvedDir)) {
      throw new Error(`Path traversal attempt detected: "${filename}"`);
    }

    return targetPath;
  }

  detectExtension(mimeType?: string, url?: string): string {
    if (mimeType) {
      const cleanMime = mimeType.split(";")[0].trim().toLowerCase();
      // Handle bare file extension passed in mimeType parameter
      if (!cleanMime.includes("/")) {
        const bareExt = cleanMime.replace(/^\./, "");
        if (["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "ico"].includes(bareExt)) {
          return bareExt === "jpeg" ? "jpg" : bareExt;
        }
      }

      switch (cleanMime) {
        case "image/png":
          return "png";
        case "image/jpeg":
        case "image/jpg":
        case "image/pjpeg":
          return "jpg";
        case "image/webp":
          return "webp";
        case "image/gif":
          return "gif";
        case "image/svg+xml":
          return "svg";
        case "image/avif":
          return "avif";
        case "image/x-icon":
        case "image/vnd.microsoft.icon":
          return "ico";
      }
    }

    if (url) {
      try {
        const parsed = new URL(url, "https://dummy.local");
        const ext = path.extname(parsed.pathname).toLowerCase().replace(/^\./, "");
        if (["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "ico"].includes(ext)) {
          return ext === "jpeg" ? "jpg" : ext;
        }
      } catch {
        // Ignore URL parsing errors
      }
    }

    return "png";
  }

  detectMimeType(filenameOrExt: string): string {
    const ext = filenameOrExt.includes(".")
      ? path.extname(filenameOrExt).toLowerCase().replace(/^\./, "")
      : filenameOrExt.toLowerCase().replace(/^\./, "");

    switch (ext) {
      case "png":
        return "image/png";
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "webp":
        return "image/webp";
      case "gif":
        return "image/gif";
      case "svg":
        return "image/svg+xml";
      case "avif":
        return "image/avif";
      case "ico":
        return "image/x-icon";
      default:
        return "application/octet-stream";
    }
  }

  computeHash(buffer: Buffer | Uint8Array): string {
    return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  }

  async saveMedia(
    buffer: Buffer | Uint8Array,
    mimeType?: string,
    originalUrl?: string
  ): Promise<MediaAsset> {
    const nodeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const hash = this.computeHash(nodeBuf);
    const ext = this.detectExtension(mimeType, originalUrl);
    const filename = `${hash}.${ext}`;
    const detectedMime =
      mimeType && mimeType !== "application/octet-stream"
        ? mimeType.split(";")[0].trim().toLowerCase()
        : this.detectMimeType(filename);
    const targetPath = this.getMediaPath(filename);

    if (!fs.existsSync(targetPath)) {
      await fs.promises.writeFile(targetPath, nodeBuf);
    }

    return {
      id: hash,
      filename,
      hash,
      mimeType: detectedMime,
      byteSize: nodeBuf.length,
      url: `/api/media/${filename}`,
      path: targetPath,
      createdAt: new Date().toISOString(),
    };
  }

  async downloadAndSave(url: string, originUrl?: string): Promise<MediaAsset | null> {
    let targetUrl = url?.trim();
    if (!targetUrl) return null;

    if (originUrl) {
      try {
        targetUrl = new URL(targetUrl, originUrl).href;
      } catch {
        // Keep targetUrl if URL resolution fails
      }
    }

    // Only allow http: and https: protocols
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }
    } catch {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "flashcard-master/1.0 (Mozilla/5.0 Compatible)",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        return null;
      }

      const arrayBuf = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (buffer.length === 0) {
        return null;
      }

      const contentType = response.headers.get("content-type") || undefined;
      return await this.saveMedia(buffer, contentType, targetUrl);
    } catch {
      // Degrade gracefully on network timeout, 404, or any fetch error
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async hasMedia(filename: string): Promise<boolean> {
    try {
      const targetPath = this.getMediaPath(filename);
      return fs.existsSync(targetPath);
    } catch {
      return false;
    }
  }

  async readMedia(filename: string): Promise<Buffer | null> {
    try {
      const targetPath = this.getMediaPath(filename);
      if (!fs.existsSync(targetPath)) {
        return null;
      }
      return await fs.promises.readFile(targetPath);
    } catch {
      return null;
    }
  }

  async readMediaAsBase64(filename: string): Promise<{ dataUrl: string; mimeType: string } | null> {
    const buffer = await this.readMedia(filename);
    if (!buffer) {
      return null;
    }
    const safeName = this.sanitizeFilename(filename);
    const mimeType = this.detectMimeType(safeName);
    const base64 = buffer.toString("base64");
    return {
      dataUrl: `data:${mimeType};base64,${base64}`,
      mimeType,
    };
  }
}
