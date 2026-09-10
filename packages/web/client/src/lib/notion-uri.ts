/**
 * Utilities for formatting, parsing, and validating Notion source URIs and recursion state.
 */

/**
 * Checks whether an input string is a valid Notion URL or 32-character hexadecimal/UUID string.
 */
export function isValidNotionInput(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (!trimmed) return false;

  // Raw 32-hex string
  if (/^[0-9a-fA-F]{32}$/.test(trimmed)) return true;

  // Standard hyphenated UUID
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed)) return true;

  // Notion HTTP(S) URL
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'notion.so' ||
        host.endsWith('.notion.so') ||
        host === 'notion.site' ||
        host.endsWith('.notion.site') ||
        host === 'notion.com' ||
        host.endsWith('.notion.com')
      ) {
        return true;
      }
      // Check if URL ends with 32-hex ID or UUID
      const pParam = parsed.searchParams.get('p');
      if (pParam && (/^[0-9a-fA-F]{32}$/.test(pParam) || /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(pParam))) {
        return true;
      }
      const last = parsed.pathname.split('/').filter(Boolean).pop() || '';
      return /[0-9a-fA-F]{32}/.test(last) || /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.test(last);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Normalizes a Notion input (URL, UUID, or 32-hex string) and configures the recursion parameter.
 */
export function buildNotionUri(rawInput: string, options: { recursive?: boolean } = {}): string {
  if (!rawInput || typeof rawInput !== 'string') return '';
  let trimmed = rawInput.trim();
  if (!trimmed) return '';

  // If input is a raw 32-hex string or hyphenated UUID, normalize to a standard Notion URL
  if (/^[0-9a-fA-F]{32}$/.test(trimmed) || /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed)) {
    const cleanHex = trimmed.replace(/-/g, '').toLowerCase();
    trimmed = `https://www.notion.so/${cleanHex}`;
  }

  const { recursive = false } = options;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      if (recursive) {
        url.searchParams.set('recursive', 'true');
      } else {
        url.searchParams.delete('recursive');
      }
      return url.toString();
    }
  } catch {
    // Fall back to regex-based manipulation if standard URL parsing fails
  }

  // Fallback for non-standard URIs
  const [baseAndQuery, hash] = trimmed.split('#');
  let cleanBase = baseAndQuery.replace(/([?&])recursive=(true|1)(?:&|$)/i, (match, prefix) => prefix === '?' ? '?' : '');
  cleanBase = cleanBase.replace(/\?&/, '?').replace(/[?&]$/, '');

  if (recursive) {
    const sep = cleanBase.includes('?') ? '&' : '?';
    cleanBase = `${cleanBase}${sep}recursive=true`;
  }

  return hash ? `${cleanBase}#${hash}` : cleanBase;
}

/**
 * Parses a Notion URI to detect recursion status and extract a clean URL for display/editing.
 */
export function parseNotionUri(
  rawUri: string,
  tags: string[] = []
): { cleanUri: string; isRecursive: boolean } {
  if (!rawUri || typeof rawUri !== 'string') {
    return { cleanUri: '', isRecursive: false };
  }

  const trimmed = rawUri.trim();
  let isRecursive = Array.isArray(tags) && tags.includes('recursive');

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const paramVal = url.searchParams.get('recursive');
      if (paramVal === 'true' || paramVal === '1') {
        isRecursive = true;
      }
      url.searchParams.delete('recursive');
      return {
        cleanUri: url.toString(),
        isRecursive,
      };
    }
  } catch {
    // Fall back to regex
  }

  const hasRecursiveParam = /[?&]recursive=(true|1)(&|#|$)/i.test(trimmed);
  if (hasRecursiveParam) {
    isRecursive = true;
  }

  const [baseAndQuery, hash] = trimmed.split('#');
  let cleanBase = baseAndQuery.replace(/([?&])recursive=(true|1)(?:&|$)/i, (match, prefix) => prefix === '?' ? '?' : '');
  cleanBase = cleanBase.replace(/\?&/, '?').replace(/[?&]$/, '');

  return {
    cleanUri: hash ? `${cleanBase}#${hash}` : cleanBase,
    isRecursive,
  };
}
