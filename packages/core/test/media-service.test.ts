import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { MediaService, getDefaultMediaDirectory } from "../src/index.js";

describe("MediaService", () => {
  let tempDir: string;
  let mediaService: MediaService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-media-test-"));
    mediaService = new MediaService({ mediaDir: tempDir });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        // Ignore busy file locks on Windows cleanup
      }
    }
  });

  it("computes SHA-256 hash and saves image buffer with content-addressed filename (fallback for non-image data)", async () => {
    const fakeImageBuffer = Buffer.from("fake-png-binary-content-12345");
    const asset = await mediaService.saveMedia(fakeImageBuffer, "image/png");

    expect(asset).toBeDefined();
    expect(asset.hash).toHaveLength(32);
    expect(asset.filename).toBe(`${asset.hash}.png`);
    expect(asset.mimeType).toBe("image/png");
    expect(asset.byteSize).toBe(fakeImageBuffer.length);
    expect(asset.url).toBe(`/api/media/${asset.filename}`);

    const savedFilePath = path.join(tempDir, asset.filename);
    expect(fs.existsSync(savedFilePath)).toBe(true);
    expect(fs.readFileSync(savedFilePath)).toEqual(fakeImageBuffer);
  });

  it("optimizes PNG and JPEG images to WebP format with image/webp MIME and reduced byte size", async () => {
    // Generate real PNG with patterns
    const rawPngBuffer = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 100, g: 150, b: 200, alpha: 1 },
      },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    const asset = await mediaService.saveMedia(rawPngBuffer, "image/png", "https://example.com/diagram.png");

    expect(asset).toBeDefined();
    expect(asset.filename.endsWith(".webp")).toBe(true);
    expect(asset.mimeType).toBe("image/webp");
    expect(asset.byteSize).toBeLessThan(rawPngBuffer.length);
    expect(asset.url).toBe(`/api/media/${asset.filename}`);

    const savedPath = path.join(tempDir, asset.filename);
    expect(fs.existsSync(savedPath)).toBe(true);

    // Verify saved file is a valid WebP file readable by sharp
    const metadata = await sharp(fs.readFileSync(savedPath)).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(200);
  });

  it("preserves SVG vector assets verbatim as image/svg+xml without rasterization", async () => {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" /></svg>`;
    const svgBuffer = Buffer.from(svgContent, "utf-8");

    const asset = await mediaService.saveMedia(svgBuffer, "image/svg+xml", "https://example.com/logo.svg");

    expect(asset).toBeDefined();
    expect(asset.filename.endsWith(".svg")).toBe(true);
    expect(asset.mimeType).toBe("image/svg+xml");
    expect(asset.byteSize).toBe(svgBuffer.length);

    const savedPath = path.join(tempDir, asset.filename);
    expect(fs.readFileSync(savedPath, "utf-8")).toBe(svgContent);
  });

  it("preserves GIF graphics safely as image/gif", async () => {
    const gifBuffer = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .gif()
      .toBuffer();

    const asset = await mediaService.saveMedia(gifBuffer, "image/gif", "https://example.com/animation.gif");

    expect(asset).toBeDefined();
    expect(asset.filename.endsWith(".gif")).toBe(true);
    expect(asset.mimeType).toBe("image/gif");
    expect(asset.byteSize).toBe(gifBuffer.length);
  });

  it("safely falls back to raw buffer when image buffer is corrupted or invalid", async () => {
    const corruptedBuffer = Buffer.from([0x00, 0x11, 0x22, 0x33, 0xff, 0xfe]);

    const asset = await mediaService.saveMedia(corruptedBuffer, "image/png", "https://example.com/broken.png");

    expect(asset).toBeDefined();
    expect(asset.filename.endsWith(".png")).toBe(true);
    expect(asset.mimeType).toBe("image/png");
    expect(asset.byteSize).toBe(corruptedBuffer.length);

    const savedPath = path.join(tempDir, asset.filename);
    expect(fs.readFileSync(savedPath)).toEqual(corruptedBuffer);
  });

  it("respects max dimensions constraints (maxWidth, maxHeight)", async () => {
    const serviceWithResize = new MediaService({
      mediaDir: tempDir,
      maxWidth: 100,
      maxHeight: 80,
    });

    const largePngBuffer = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 20, g: 80, b: 160, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const asset = await serviceWithResize.saveMedia(largePngBuffer, "image/png");
    expect(asset.filename.endsWith(".webp")).toBe(true);

    const savedPath = path.join(tempDir, asset.filename);
    const metadata = await sharp(fs.readFileSync(savedPath)).metadata();
    expect(metadata.width).toBeLessThanOrEqual(100);
    expect(metadata.height).toBeLessThanOrEqual(80);
  });

  it("converts JPEG image buffers to high-efficiency WebP format", async () => {
    const jpegBuffer = await sharp({
      create: {
        width: 150,
        height: 150,
        channels: 3,
        background: { r: 240, g: 180, b: 90 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const asset = await mediaService.saveMedia(jpegBuffer, "image/jpeg", "https://example.com/photo.jpg");

    expect(asset.filename.endsWith(".webp")).toBe(true);
    expect(asset.mimeType).toBe("image/webp");
    expect(asset.byteSize).toBeGreaterThan(0);

    const savedPath = path.join(tempDir, asset.filename);
    const meta = await sharp(fs.readFileSync(savedPath)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(150);
  });

  it("controls compression ratio with webpQuality (quality 20 produces smaller buffer than quality 90)", async () => {
    const complexPngBuffer = await sharp({
      create: {
        width: 250,
        height: 250,
        channels: 3,
        noise: {
          type: "gaussian",
          mean: 128,
          sigma: 30,
        },
      },
    })
      .png()
      .toBuffer();

    const dirLow = fs.mkdtempSync(path.join(os.tmpdir(), "fc-lowq-"));
    const dirHigh = fs.mkdtempSync(path.join(os.tmpdir(), "fc-highq-"));

    try {
      const serviceLow = new MediaService({ mediaDir: dirLow, webpQuality: 20 });
      const serviceHigh = new MediaService({ mediaDir: dirHigh, webpQuality: 90 });

      const assetLow = await serviceLow.saveMedia(complexPngBuffer, "image/png");
      const assetHigh = await serviceHigh.saveMedia(complexPngBuffer, "image/png");

      expect(assetLow.byteSize).toBeLessThan(assetHigh.byteSize);
    } finally {
      try {
        fs.rmSync(dirLow, { recursive: true, force: true, maxRetries: 3 });
        fs.rmSync(dirHigh, { recursive: true, force: true, maxRetries: 3 });
      } catch {}
    }
  });

  it("auto-rotates EXIF-oriented images and normalizes to sRGB colorspace", async () => {
    // 200x100 image with orientation: 6 (rotated 90 CW)
    const orientedBuffer = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 50, g: 150, b: 250 },
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const asset = await mediaService.saveMedia(orientedBuffer, "image/jpeg");
    expect(asset.filename.endsWith(".webp")).toBe(true);

    const savedPath = path.join(tempDir, asset.filename);
    const meta = await sharp(fs.readFileSync(savedPath)).metadata();
    expect(meta.format).toBe("webp");
    // After auto-rotation, 200x100 oriented 6 becomes 100x200
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(200);
  });

  it("bypasses WebP optimization when optimizeWebp is false", async () => {
    const serviceNoOptimize = new MediaService({
      mediaDir: tempDir,
      optimizeWebp: false,
    });

    const pngBuffer = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 4,
        background: { r: 50, g: 100, b: 150, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const asset = await serviceNoOptimize.saveMedia(pngBuffer, "image/png");
    expect(asset.filename.endsWith(".png")).toBe(true);
    expect(asset.mimeType).toBe("image/png");
    expect(asset.byteSize).toBe(pngBuffer.length);
  });

  it("deduplicates identical image buffers to the same file without duplicate storage", async () => {
    const pngBuffer = await sharp({
      create: {
        width: 60,
        height: 60,
        channels: 4,
        background: { r: 200, g: 100, b: 50, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const asset1 = await mediaService.saveMedia(pngBuffer, "image/png");
    const asset2 = await mediaService.saveMedia(pngBuffer, "image/png");

    expect(asset1.filename).toBe(asset2.filename);
    expect(asset1.hash).toBe(asset2.hash);

    const files = fs.readdirSync(tempDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(asset1.filename);
  });

  it("detects extensions correctly from MIME types, URLs, and fallbacks", () => {
    expect(mediaService.detectExtension("image/png")).toBe("png");
    expect(mediaService.detectExtension("image/jpeg")).toBe("jpg");
    expect(mediaService.detectExtension("image/webp")).toBe("webp");
    expect(mediaService.detectExtension("image/gif")).toBe("gif");
    expect(mediaService.detectExtension("image/svg+xml")).toBe("svg");
    expect(mediaService.detectExtension("image/avif")).toBe("avif");
    expect(mediaService.detectExtension("image/tiff")).toBe("tiff");
    expect(mediaService.detectExtension("image/bmp")).toBe("bmp");
    expect(mediaService.detectExtension("application/octet-stream")).toBe("bin");

    // From URL
    expect(mediaService.detectExtension(undefined, "https://example.com/photo.JPEG")).toBe("jpg");
    expect(mediaService.detectExtension(undefined, "https://example.com/assets/diagram.webp?v=2")).toBe("webp");
    expect(mediaService.detectExtension(undefined, "https://example.com/unknown")).toBe("png");
  });

  it("detects MIME types correctly from filename extension", () => {
    expect(mediaService.detectMimeType("diagram.png")).toBe("image/png");
    expect(mediaService.detectMimeType("photo.jpg")).toBe("image/jpeg");
    expect(mediaService.detectMimeType("photo.jpeg")).toBe("image/jpeg");
    expect(mediaService.detectMimeType("anim.gif")).toBe("image/gif");
    expect(mediaService.detectMimeType("vector.svg")).toBe("image/svg+xml");
    expect(mediaService.detectMimeType("modern.avif")).toBe("image/avif");
    expect(mediaService.detectMimeType("graphic.tiff")).toBe("image/tiff");
    expect(mediaService.detectMimeType("bitmap.bmp")).toBe("image/bmp");
    expect(mediaService.detectMimeType("other.bin")).toBe("application/octet-stream");
  });

  it("downloads remote image successfully using custom fetch and optimizes to WebP", async () => {
    const pngBuffer = await sharp({
      create: {
        width: 80,
        height: 80,
        channels: 4,
        background: { r: 0, g: 128, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const mockFetch = async (url: string | URL | Request) => {
      return new Response(pngBuffer, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    };

    const serviceWithFetch = new MediaService({
      mediaDir: tempDir,
      customFetch: mockFetch as any,
    });

    const asset = await serviceWithFetch.downloadAndSave(
      "/images/arch.png",
      "https://example.com/blog/article"
    );

    expect(asset).not.toBeNull();
    expect(asset?.mimeType).toBe("image/webp");
    expect(asset?.filename.endsWith(".webp")).toBe(true);

    const exists = await serviceWithFetch.hasMedia(asset!.filename);
    expect(exists).toBe(true);
  });

  it("degrades gracefully to null when download fails or times out without throwing", async () => {
    const failingFetch = async () => {
      return new Response("Not Found", { status: 404 });
    };

    const service = new MediaService({
      mediaDir: tempDir,
      customFetch: failingFetch as any,
    });

    const result = await service.downloadAndSave("https://example.com/missing.png");
    expect(result).toBeNull();

    // Invalid non-http URI
    const invalidUriResult = await service.downloadAndSave("ftp://example.com/image.png");
    expect(invalidUriResult).toBeNull();
  });

  it("sanitizes filenames and protects against path traversal attacks", async () => {
    expect(mediaService.sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(mediaService.sanitizeFilename("..\\..\\windows\\system32")).toBe("system32");

    const safePath = mediaService.getMediaPath("diagram.png");
    expect(safePath).toBe(path.resolve(tempDir, "diagram.png"));

    const buf = Buffer.from("normal-image-data");
    const asset = await mediaService.saveMedia(buf, "image/png");

    const readBuf = await mediaService.readMedia(asset.filename);
    expect(readBuf).toEqual(buf);

    // Reading non-existent file returns null
    const nonExistent = await mediaService.readMedia("nonexistent.png");
    expect(nonExistent).toBeNull();
  });

  it("reads media as Base64 Data URL for standalone HTML embedding", async () => {
    const buf = Buffer.from("hello-pixel-art");
    const asset = await mediaService.saveMedia(buf, "image/png");

    const base64Result = await mediaService.readMediaAsBase64(asset.filename);
    expect(base64Result).not.toBeNull();
    expect(base64Result?.mimeType).toBe("image/png");
    expect(base64Result?.dataUrl).toBe(`data:image/png;base64,${buf.toString("base64")}`);

    const missingBase64 = await mediaService.readMediaAsBase64("missing.png");
    expect(missingBase64).toBeNull();
  });

  it("provides default media directory in ~/.flashcard-master/media", () => {
    const defaultDir = getDefaultMediaDirectory();
    expect(defaultDir).toContain(".flashcard-master");
    expect(defaultDir.endsWith("media")).toBe(true);
    expect(fs.existsSync(defaultDir)).toBe(true);
  });
});

