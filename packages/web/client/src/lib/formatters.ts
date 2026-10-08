import type { DiscoveredDocument } from './types.js';

/**
 * Formats a user-friendly page coordinate badge for a document.
 * Returns null if startPage is missing or null.
 */
export function formatPageBadge(doc: { startPage?: number | null; endPage?: number | null }): string | null {
  if (doc.startPage == null) {
    return null;
  }

  if (doc.endPage != null && doc.endPage > doc.startPage) {
    return `Pages ${doc.startPage}-${doc.endPage}`;
  }

  return `Page ${doc.startPage}`;
}
