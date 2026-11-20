import dns from "node:dns/promises";
import net from "node:net";

export const DEFAULT_MAX_TEXT_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MiB
export const DEFAULT_MAX_BINARY_RESPONSE_BYTES = 25 * 1024 * 1024; // 25 MiB

const NATIVE_GLOBAL_FETCH = typeof globalThis.fetch === "function" ? globalThis.fetch : undefined;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata",
]);

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local + cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmarking)
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateOrReservedIpv6(rawIp: string): boolean {
  const clean = rawIp.toLowerCase().split("%")[0];
  if (clean === "::" || clean === "::1") return true;

  // IPv4-mapped (::ffff:...) and IPv4-translated (::ffff:0:...)
  if (clean.startsWith("::ffff:")) {
    const tail = clean.startsWith("::ffff:0:") ? clean.slice("::ffff:0:".length) : clean.slice("::ffff:".length);
    if (net.isIPv4(tail)) {
      return isPrivateOrReservedIpv4(tail);
    }
    const hexParts = tail.split(":");
    if (hexParts.length === 2) {
      const hi = Number.parseInt(hexParts[0], 16);
      const lo = Number.parseInt(hexParts[1], 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateOrReservedIpv4(ipv4);
      }
    }
    return true;
  }

  // IPv4-compatible IPv6 (::7f00:1, ::127.0.0.1), NAT64 (64:ff9b::), 6to4 (2002::), unique-local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8)
  if (/^::(?:[0-9a-f]{1,4}:)?[0-9a-f]{1,4}$/i.test(clean) || /^::\d+\.\d+\.\d+\.\d+$/.test(clean)) return true;
  if (/^(?:64:ff9b:|2002:|fc|fd|ff)/i.test(clean)) return true;
  if (/^fe[89ab][0-9a-f]/i.test(clean)) return true;
  return false;
}

/**
 * Validates that an outbound URL uses HTTP/HTTPS and does not target loopback,
 * link-local, cloud metadata, or private/internal network destinations (SSRF guard).
 */
export function assertSafePublicHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL blocked: "${rawUrl}"`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked unsupported outbound protocol "${parsed.protocol}" for "${rawUrl}"`);
  }

  if (parsed.username || parsed.password) {
    throw new Error(`Blocked outbound URL containing embedded credentials`);
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "").toLowerCase();
  if (!host) {
    throw new Error(`Blocked outbound URL with empty hostname`);
  }

  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error(`Blocked outbound request to local/internal host "${host}"`);
  }

  const ipType = net.isIP(host);
  if (ipType === 4 && isPrivateOrReservedIpv4(host)) {
    throw new Error(`Blocked outbound request to private/loopback IPv4 address "${host}"`);
  }
  if (ipType === 6 && isPrivateOrReservedIpv6(host)) {
    throw new Error(`Blocked outbound request to private/loopback IPv6 address "${host}"`);
  }

  return parsed;
}

async function assertSafeResolvedHostnameIfNative(url: URL, fetchFn: typeof fetch): Promise<void> {
  if (!NATIVE_GLOBAL_FETCH || fetchFn !== NATIVE_GLOBAL_FETCH) {
    return;
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "").toLowerCase();
  if (!host || net.isIP(host) !== 0) {
    return;
  }
  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    return;
  }
  for (const rec of records) {
    if (
      (rec.family === 4 && isPrivateOrReservedIpv4(rec.address)) ||
      (rec.family === 6 && isPrivateOrReservedIpv6(rec.address))
    ) {
      throw new Error(`Blocked outbound request resolving to private/loopback IP "${rec.address}"`);
    }
  }
}

function stripSensitiveHeadersOnCrossOrigin(headers: HeadersInit | undefined): HeadersInit | undefined {
  if (!headers) return undefined;
  const sanitized = new Headers(headers);
  sanitized.delete("authorization");
  sanitized.delete("cookie");
  sanitized.delete("proxy-authorization");
  return sanitized;
}

/**
 * Performs an HTTP(S) fetch with SSRF validation on both the initial target and every redirect hop,
 * forcing `redirect: "manual"`, cancelling 3xx bodies, and stripping credentials on cross-origin hops.
 */
export async function fetchSafePublicResponse(
  fetchFn: typeof fetch,
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 5
): Promise<Response> {
  let currentParsed = assertSafePublicHttpUrl(rawUrl);
  let currentUrl = currentParsed.href;
  const { redirect: _ignoredRedirect, headers: initialHeaders, ...restInit } = init;
  let currentHeaders = initialHeaders;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertSafeResolvedHostnameIfNative(currentParsed, fetchFn);

    const res = await fetchFn(currentUrl, {
      ...restInit,
      ...(currentHeaders ? { headers: currentHeaders } : {}),
      redirect: "manual",
    });

    if (res.url && /^https?:\/\//i.test(res.url)) {
      assertSafePublicHttpUrl(res.url);
    }

    if (typeof res.status === "number" && res.status >= 300 && res.status < 400) {
      const location = res.headers?.get?.("location");
      await res.body?.cancel?.().catch(() => {});
      if (!location) {
        return res;
      }
      if (hop === maxRedirects) {
        throw new Error(`Too many redirects (${maxRedirects}) fetching "${rawUrl}"`);
      }
      const nextUrl = new URL(location, currentUrl).href;
      const nextParsed = assertSafePublicHttpUrl(nextUrl);
      if (nextParsed.origin !== currentParsed.origin) {
        currentHeaders = stripSensitiveHeadersOnCrossOrigin(currentHeaders);
      }
      currentParsed = nextParsed;
      currentUrl = nextParsed.href;
      continue;
    }

    return res;
  }

  throw new Error(`Too many redirects fetching "${rawUrl}"`);
}

/**
 * Reads an HTTP response body into a Buffer up to `maxBytes` to prevent memory exhaustion.
 */
export async function readResponseBufferWithLimit(
  res: Response,
  maxBytes = DEFAULT_MAX_BINARY_RESPONSE_BYTES
): Promise<Buffer> {
  const declaredLenHeader = res.headers?.get?.("content-length");
  if (declaredLenHeader) {
    const declaredLen = Number(declaredLenHeader);
    if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
      await res.body?.cancel?.().catch(() => {});
      throw new Error(`Response content-length (${declaredLen} bytes) exceeds limit (${maxBytes} bytes).`);
    }
  }

  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    let totalBytes = 0;
    const chunks: Buffer[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error(`Response body exceeded maximum allowed size of ${maxBytes} bytes.`);
          }
          chunks.push(Buffer.from(value));
        }
      }
      return Buffer.concat(chunks);
    } finally {
      reader.releaseLock();
    }
  }

  if (typeof res.arrayBuffer === "function") {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(`Response body exceeded maximum allowed size of ${maxBytes} bytes.`);
    }
    return buf;
  }

  const text = await res.text();
  const buf = Buffer.from(text, "utf-8");
  if (buf.length > maxBytes) {
    throw new Error(`Response body exceeded maximum allowed size of ${maxBytes} bytes.`);
  }
  return buf;
}

/**
 * Reads a text HTTP response body up to `maxBytes` (default 10 MiB) to prevent memory exhaustion.
 */
export async function readResponseTextWithLimit(
  res: Response,
  maxBytes = DEFAULT_MAX_TEXT_RESPONSE_BYTES
): Promise<string> {
  const buf = await readResponseBufferWithLimit(res, maxBytes);
  return buf.toString("utf-8");
}
