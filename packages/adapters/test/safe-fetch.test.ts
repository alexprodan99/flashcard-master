import { describe, it, expect, vi } from "vitest";
import {
  assertSafePublicHttpUrl,
  fetchSafePublicResponse,
  readResponseTextWithLimit,
} from "../src/index.js";

describe("safe-fetch SSRF & bounded response guards (Action Item 3)", () => {
  it("allows valid public HTTP/HTTPS URLs and blocks loopback, private IP, link-local, metadata, and non-HTTP schemes", () => {
    expect(assertSafePublicHttpUrl("https://example.com/feed.xml").href).toBe("https://example.com/feed.xml");
    expect(assertSafePublicHttpUrl("http://docs.python.org/sitemap.xml").href).toBe("http://docs.python.org/sitemap.xml");

    const blocked = [
      "file:///etc/passwd",
      "ftp://example.com/a",
      "http://localhost:3000/api/health",
      "http://sub.localhost/secret",
      "http://127.0.0.1:8765/",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/internal",
      "http://172.16.4.2/admin",
      "http://192.168.1.1/",
      "http://[::1]:8080/",
      "http://[fe80::1]/",
      "https://metadata.google.internal/computeMetadata/v1/",
      "https://user:pass@example.com/private",
    ];
    for (const url of blocked) {
      expect(() => assertSafePublicHttpUrl(url)).toThrow();
    }
  });

  it("blocks HTTP redirects targeting private or loopback destinations", async () => {
    const fetchSpy = vi.fn(async () => ({
      status: 302,
      ok: false,
      headers: new Headers({ location: "http://169.254.169.254/latest/meta-data" }),
      text: async () => "",
    })) as unknown as typeof fetch;

    await expect(fetchSafePublicResponse(fetchSpy, "https://example.com/start")).rejects.toThrow(/IPv4|Blocked/i);
  });

  it("caps response text reads at the configured byte limit for both streamed and buffered bodies", async () => {
    const bigStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
        controller.close();
      },
    });
    const streamRes = new Response(bigStream, { status: 200 });
    await expect(readResponseTextWithLimit(streamRes, 1024)).rejects.toThrow(/exceeded maximum allowed size/i);

    const smallMockRes = {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => "ok-body",
    } as unknown as Response;
    await expect(readResponseTextWithLimit(smallMockRes, 1024)).resolves.toBe("ok-body");
  });
});
