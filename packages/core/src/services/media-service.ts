import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import sharp from "sharp";
import type { MediaAsset, MediaOptimizationOptions, CompactMediaOptions } from "../domain/models.js";
import { getDefaultMediaDirectory } from "../storage/db.js";

// Limit Sharp thread concurrency to avoid 100% CPU starvation during batch ingestion
sharp.concurrency(Math.min(2, os.cpus().length || 2));

export interface MediaServiceOptions extends MediaOptimizationOptions {
  mediaDir?: string;
  customFetch?: typeof fetch;
  timeoutMs?: number;
}

export class MediaService {
  private readonly mediaDir: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly optimizeWebp: boolean;
  private readonly webpQuality: number;
  private readonly maxWidth?: number;
  private readonly maxHeight?: number;

  constructor(options: MediaServiceOptions = {}) {
    this.mediaDir = options.mediaDir || getDefaultMediaDirectory();
    this.fetchFn = options.customFetch || globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.optimizeWebp = options.optimizeWebp ?? true;
    this.webpQuality = Math.min(Math.max(options.webpQuality ?? 80, 1), 100);
    this.maxWidth = options.maxWidth;
    this.maxHeight = options.maxHeight;

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
        if (["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "ico", "bin", "tiff", "bmp"].includes(bareExt)) {
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
        case "image/tiff":
          return "tiff";
        case "image/bmp":
        case "image/x-ms-bmp":
          return "bmp";
        case "image/x-icon":
        case "image/vnd.microsoft.icon":
          return "ico";
        case "application/octet-stream":
          return "bin";
      }
    }

    if (url) {
      try {
        const parsed = new URL(url, "https://dummy.local");
        const ext = path.extname(parsed.pathname).toLowerCase().replace(/^\./, "");
        if (["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "ico", "bin", "tiff", "bmp"].includes(ext)) {
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
      case "tiff":
      case "tif":
        return "image/tiff";
      case "bmp":
        return "image/bmp";
      case "ico":
        return "image/x-icon";
      case "bin":
      default:
        return "application/octet-stream";
    }
  }

  computeHash(buffer: Buffer | Uint8Array): string {
    return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  }

  async optimizeImageBuffer(
    buffer: Buffer | Uint8Array,
    mimeType?: string,
    originalUrl?: string
  ): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
    const nodeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const cleanMime = mimeType ? mimeType.split(";")[0].trim().toLowerCase() : undefined;
    const detectedExt = this.detectExtension(cleanMime, originalUrl);
    const detectedMime =
      cleanMime && cleanMime !== "application/octet-stream"
        ? cleanMime
        : this.detectMimeType(detectedExt);

    // If WebP optimization is disabled, return original buffer
    if (!this.optimizeWebp) {
      return {
        buffer: nodeBuf,
        mimeType: detectedMime,
        ext: detectedExt,
      };
    }

    // Preserve vector graphics (SVG) verbatim without rasterization
    if (detectedExt === "svg" || cleanMime === "image/svg+xml") {
      return {
        buffer: nodeBuf,
        mimeType: "image/svg+xml",
        ext: "svg",
      };
    }

    // Preserve animated GIFs safely without corrupting frames
    if (detectedExt === "gif" || cleanMime === "image/gif") {
      return {
        buffer: nodeBuf,
        mimeType: "image/gif",
        ext: "gif",
      };
    }

    try {
      let pipeline = sharp(nodeBuf, { failOn: "none", limitInputPixels: 40_000_000, animated: true })
        .rotate()
        .toColorspace("srgb");

      if (this.maxWidth || this.maxHeight) {
        pipeline = pipeline.resize({
          width: this.maxWidth,
          height: this.maxHeight,
          fit: "inside",
          withoutEnlargement: true,
        });
      }

      const optimizedBuffer = await pipeline
        .webp({ quality: this.webpQuality, effort: 4 })
        .toBuffer();

      return {
        buffer: optimizedBuffer,
        mimeType: "image/webp",
        ext: "webp",
      };
    } catch (err: any) {
      console.warn(
        `[MediaService] Image optimization failed, falling back to original buffer: ${err?.message || err}`
      );
      return {
        buffer: nodeBuf,
        mimeType: detectedMime,
        ext: detectedExt,
      };
    }
  }

  async saveMedia(
    buffer: Buffer | Uint8Array,
    mimeType?: string,
    originalUrl?: string
  ): Promise<MediaAsset> {
    const nodeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const optimized = await this.optimizeImageBuffer(nodeBuf, mimeType, originalUrl);
    const finalBuf = optimized.buffer;
    const hash = this.computeHash(finalBuf);
    const filename = `${hash}.${optimized.ext}`;
    const targetPath = this.getMediaPath(filename);

    if (!fs.existsSync(targetPath)) {
      await fs.promises.writeFile(targetPath, finalBuf);
    }

    return {
      id: hash,
      filename,
      hash,
      mimeType: optimized.mimeType,
      byteSize: finalBuf.length,
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

  async readMediaAsCompactBase64(
    filename: string,
    options?: CompactMediaOptions
  ): Promise<{ dataUrl: string; mimeType: string } | null> {
    const buffer = await this.readMedia(filename);
    if (!buffer) {
      return null;
    }

    const safeName = this.sanitizeFilename(filename);
    const mimeType = this.detectMimeType(safeName);

    // Preserve vector graphics (SVG) verbatim without rasterization
    if (mimeType === "image/svg+xml" || safeName.endsWith(".svg")) {
      const base64 = buffer.toString("base64");
      return {
        dataUrl: `data:image/svg+xml;base64,${base64}`,
        mimeType: "image/svg+xml",
      };
    }

    const maxWidth = Math.max(1, options?.maxWidth ?? 600);
    const maxHeight = Math.max(1, options?.maxHeight ?? 600);
    const quality = Math.min(Math.max(options?.quality ?? 50, 1), 100);
    const effort = Math.min(Math.max(options?.effort ?? 6, 0), 6);
    const grayscale = options?.grayscale ?? false;
    const isGif = mimeType === "image/gif" || safeName.endsWith(".gif");

    try {
      let pipeline = sharp(buffer, {
        failOn: "none",
        limitInputPixels: 40_000_000,
        pages: isGif ? 1 : undefined,
      })
        .rotate()
        .toColorspace("srgb")
        .resize({
          width: maxWidth,
          height: maxHeight,
          fit: "inside",
          withoutEnlargement: true,
        });

      if (grayscale) {
        pipeline = pipeline.grayscale();
      }

      const compactBuffer = await pipeline
        .webp({ quality, effort })
        .toBuffer();

      const base64 = compactBuffer.toString("base64");
      return {
        dataUrl: `data:image/webp;base64,${base64}`,
        mimeType: "image/webp",
      };
    } catch {
      // Fallback to in-memory Base64 if Sharp compact resizing fails
      const fallbackBase64 = buffer.toString("base64");
      return {
        dataUrl: `data:${mimeType};base64,${fallbackBase64}`,
        mimeType,
      };
    }
  }
}

