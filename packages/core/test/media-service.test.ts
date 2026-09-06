import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("computes SHA-256 hash and saves image buffer with content-addressed filename", async () => {
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

  it("deduplicates identical image buffers to the same file without duplicate storage", async () => {
    const buffer = Buffer.from("shared-company-logo-pixels");

    const asset1 = await mediaService.saveMedia(buffer, "image/jpeg");
    const asset2 = await mediaService.saveMedia(buffer, "image/jpeg");

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
    expect(mediaService.detectMimeType("other.bin")).toBe("application/octet-stream");
  });

  it("downloads remote image successfully using custom fetch", async () => {
    const imagePayload = Buffer.from("remote-downloaded-image-data");

    const mockFetch = async (url: string | URL | Request) => {
      return new Response(imagePayload, {
        status: 200,
        headers: { "Content-Type": "image/webp" },
      });
    };

    const serviceWithFetch = new MediaService({
      mediaDir: tempDir,
      customFetch: mockFetch as any,
    });

    const asset = await serviceWithFetch.downloadAndSave(
      "/images/arch.webp",
      "https://example.com/blog/article"
    );

    expect(asset).not.toBeNull();
    expect(asset?.mimeType).toBe("image/webp");
    expect(asset?.filename.endsWith(".webp")).toBe(true);
    expect(asset?.byteSize).toBe(imagePayload.length);

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
