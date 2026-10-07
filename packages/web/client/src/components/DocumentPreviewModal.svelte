<script lang="ts">
  import type { DiscoveredDocument } from '../lib/types';
  import { formatPageBadge } from '../lib/formatters.js';

  interface Props {
    isOpen: boolean;
    document: DiscoveredDocument | null;
    onClose: () => void;
    onSynthesize?: (doc: DiscoveredDocument) => void;
    onOpenInStudio?: (doc: DiscoveredDocument) => void;
    onDelete?: (doc: DiscoveredDocument) => void;
    onExport?: (doc: DiscoveredDocument) => void;
    isDeleting?: boolean;
  }

  let { isOpen, document, onClose, onSynthesize, onOpenInStudio, onDelete, onExport, isDeleting = false }: Props = $props();

  let viewMode = $state<'reader' | 'raw'>('reader');

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatInlineMarkdown(text: string): string {
    let escaped = escapeHtml(text);
    // Inline code: `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold: **text** or __text__
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Markdown image: ![alt](url)
    escaped = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
      const figcaption = alt ? `<figcaption>${alt}</figcaption>` : '';
      return `<figure class="doc-figure"><img src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" />${figcaption}</figure>`;
    });
    // Markdown link: [label](url)
    escaped = escaped.replace(/(?<!\!)\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+|\.\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1 ↗</a>');
    return escaped;
  }

  function renderMarkdownToHtml(text: string): string {
    const trimmed = text ? text.trim() : '';
    if (!trimmed) return '<p class="empty-text"><em>(No content available in document)</em></p>';

    // Protect code blocks first
    const codeBlocks: string[] = [];
    const placeholderPrefix = `__CODE_BLOCK_${Math.random().toString(36).slice(2)}_`;
    const textWithPlaceholders = trimmed.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (_match, lang, code) => {
      const idx = codeBlocks.length;
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      const escapedCode = escapeHtml(code.trimEnd());
      codeBlocks.push(`<pre><code${langClass}>${escapedCode}</code></pre>`);
      return `\n\n${placeholderPrefix}${idx}\n\n`;
    });

    const rawBlocks = textWithPlaceholders.split(/\n{2,}/);
    const htmlBlocks: string[] = [];

    for (const rawBlock of rawBlocks) {
      const block = rawBlock.trim();
      if (!block) continue;

      // Check code block placeholder
      const codeMatch = block.match(new RegExp(`^${placeholderPrefix}(\\d+)$`));
      if (codeMatch) {
        const idx = parseInt(codeMatch[1], 10);
        if (codeBlocks[idx]) {
          htmlBlocks.push(codeBlocks[idx]);
          continue;
        }
      }

      // Horizontal rule
      if (/^(\-{3,}|\*{3,}|_{3,})$/.test(block)) {
        htmlBlocks.push('<hr />');
        continue;
      }

      // Block image: ![alt](url)
      const imgMatch = block.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch) {
        const alt = imgMatch[1].trim();
        const src = imgMatch[2].trim();
        const figcaption = alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : '';
        htmlBlocks.push(
          `<figure class="doc-figure"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" referrerpolicy="no-referrer" />${figcaption}</figure>`
        );
        continue;
      }

      // Headings (# Heading)
      const headingMatch = block.match(/^(#{1,6})\s+(.+)$/s);
      if (headingMatch && !block.includes('\n')) {
        const level = Math.min(6, headingMatch[1].length + 2); // Shift h1->h3, h2->h4
        const content = formatInlineMarkdown(headingMatch[2].trim());
        htmlBlocks.push(`<h${level}>${content}</h${level}>`);
        continue;
      }

      // Blockquote (> Quote)
      if (block.startsWith('>')) {
        const quoteLines = block
          .split('\n')
          .map((l) => l.replace(/^>\s?/, ''))
          .join('\n');
        const content = formatInlineMarkdown(quoteLines).replace(/\n/g, '<br />');
        htmlBlocks.push(`<blockquote>${content}</blockquote>`);
        continue;
      }

      // Unordered list (- item or * item)
      if (/^[\*\-]\s+/m.test(block) && block.split('\n').every((l) => /^[\*\-]\s+/.test(l.trim()) || l.trim() === '')) {
        const items = block
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => /^[\*\-]\s+/.test(l))
          .map((l) => `<li>${formatInlineMarkdown(l.replace(/^[\*\-]\s+/, ''))}</li>`)
          .join('\n');
        htmlBlocks.push(`<ul>\n${items}\n</ul>`);
        continue;
      }

      // Ordered list (1. item)
      if (/^\d+\.\s+/m.test(block) && block.split('\n').every((l) => /^\d+\.\s+/.test(l.trim()) || l.trim() === '')) {
        const items = block
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => /^\d+\.\s+/.test(l))
          .map((l) => `<li>${formatInlineMarkdown(l.replace(/^\d+\.\s+/, ''))}</li>`)
          .join('\n');
        htmlBlocks.push(`<ol>\n${items}\n</ol>`);
        continue;
      }

      // Standard paragraph
      const formattedPara = formatInlineMarkdown(block).replace(/\n/g, '<br />');
      htmlBlocks.push(`<p>${formattedPara}</p>`);
    }

    return htmlBlocks.join('\n');
  }

  let formattedContent = $derived(renderMarkdownToHtml(document?.textContent || ''));
</script>

{#if isOpen && document}
  <div class="preview-backdrop" role="presentation" onclick={onClose}>
    <div
      class="preview-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && onClose()}
    >
      <div class="preview-header">
        <div class="header-details">
          <h3>{document.title}</h3>
          <div class="preview-meta">
            {#if formatPageBadge(document)}
              <span class="meta-pill page-pill">📄 {formatPageBadge(document)}</span>
            {/if}
            <span class="meta-pill">📝 {document.wordCount.toLocaleString()} words</span>
            {#if (document.cardCount || 0) > 0}
              <span class="meta-pill card-pill">🎴 {document.cardCount} cards generated</span>
            {/if}
            {#if document.url}
              <a href={document.url} target="_blank" rel="noopener noreferrer" class="meta-url">
                🔗 {document.url}
              </a>
            {:else}
              <span class="meta-local">📖 Local Document</span>
            {/if}
          </div>
        </div>

        <div class="header-actions">
          <div class="view-toggle" role="group" aria-label="Content view mode">
            <button
              type="button"
              class="toggle-btn"
              class:active={viewMode === 'reader'}
              onclick={() => (viewMode = 'reader')}
              title="Formatted Article Reader View"
            >
              📖 Reader View
            </button>
            <button
              type="button"
              class="toggle-btn"
              class:active={viewMode === 'raw'}
              onclick={() => (viewMode = 'raw')}
              title="Plain Raw Text View"
            >
              📄 Raw Text
            </button>
          </div>
          <button class="btn-close" onclick={onClose} aria-label="Close Preview">✕</button>
        </div>
      </div>

      <div class="preview-content">
        {#if viewMode === 'reader'}
          <div class="reader-view">
            {@html formattedContent}
          </div>
        {:else}
          <pre class="raw-view">{document.textContent || '(No content)'}</pre>
        {/if}
      </div>

      <div class="preview-footer">
        {#if onDelete}
          <div class="footer-left">
            <button
              type="button"
              class="btn btn-danger"
              disabled={isDeleting}
              aria-label="Delete document"
              onclick={() => {
                if (document) onDelete(document);
              }}
            >
              <span aria-hidden="true">🗑️</span> {isDeleting ? 'Deleting...' : 'Delete Document'}
            </button>
          </div>
        {/if}
        <div class="footer-right">
          <button type="button" class="btn btn-secondary" onclick={onClose}>Close</button>
          {#if onExport}
            <button
              type="button"
              class="btn btn-secondary"
              onclick={() => {
                if (document) onExport(document);
              }}
            >
              📤 Export Document
            </button>
          {/if}
          {#if onOpenInStudio}
            <button
              type="button"
              class="btn btn-secondary"
              onclick={() => {
                if (document) onOpenInStudio(document);
              }}
            >
              ⚡ Open in Studio ↗
            </button>
          {/if}
          {#if onSynthesize}
            <button
              type="button"
              class="btn btn-primary"
              onclick={() => {
                if (document) onSynthesize(document);
              }}
            >
              ⚡ Configure & Synthesize
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .preview-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(4px);
    z-index: 1200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .preview-modal {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 12px;
    width: 860px;
    max-width: 95vw;
    height: 85vh;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8);
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.98); }
    to { opacity: 1; transform: scale(1); }
  }

  .preview-header {
    padding: 16px 20px;
    border-bottom: 1px solid #1e293b;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .header-details h3 {
    margin: 0 0 6px 0;
    font-size: 16px;
    color: #f8fafc;
    line-height: 1.3;
  }

  .preview-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12px;
  }

  .meta-pill {
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
  }

  .meta-pill.page-pill {
    background: rgba(14, 165, 233, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(14, 165, 233, 0.3);
  }

  .meta-pill.card-pill {
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.3);
  }

  .meta-url {
    color: #60a5fa;
    text-decoration: none;
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta-url:hover {
    text-decoration: underline;
  }

  .meta-local {
    color: #94a3b8;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .view-toggle {
    display: inline-flex;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }

  .toggle-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .toggle-btn:hover {
    color: #f8fafc;
  }

  .toggle-btn.active {
    background: #6366f1;
    color: #ffffff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .btn-close:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }

  .preview-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px 28px;
    background: #0b0f19;
  }

  .raw-view {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    color: #cbd5e1;
    line-height: 1.6;
  }

  /* Reader View Typography */
  .reader-view {
    max-width: 780px;
    margin: 0 auto;
    color: #cbd5e1;
    font-size: 14.5px;
    line-height: 1.75;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
  }

  .reader-view :global(p) {
    margin: 0 0 16px 0;
    color: #cbd5e1;
  }

  .reader-view :global(p:last-child) {
    margin-bottom: 0;
  }

  .reader-view :global(.empty-text) {
    color: #64748b;
    font-style: italic;
    text-align: center;
    padding: 30px 0;
  }

  .reader-view :global(h3) {
    font-size: 1.25rem;
    font-weight: 700;
    color: #38bdf8;
    margin: 24px 0 10px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid #1e293b;
    line-height: 1.35;
  }

  .reader-view :global(h4) {
    font-size: 1.1rem;
    font-weight: 600;
    color: #f1f5f9;
    margin: 20px 0 8px 0;
    line-height: 1.4;
  }

  .reader-view :global(h5),
  .reader-view :global(h6) {
    font-size: 0.95rem;
    font-weight: 600;
    color: #94a3b8;
    margin: 16px 0 6px 0;
  }

  .reader-view :global(pre) {
    background: #060911;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 14px 16px;
    overflow-x: auto;
    margin: 16px 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12.5px;
    line-height: 1.5;
    color: #e2e8f0;
  }

  .reader-view :global(code) {
    background: rgba(255, 255, 255, 0.08);
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 12.5px;
    color: #93c5fd;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .reader-view :global(pre code) {
    background: transparent;
    padding: 0;
    color: inherit;
  }

  .reader-view :global(blockquote) {
    border-left: 4px solid #6366f1;
    padding: 8px 14px;
    background: rgba(99, 102, 241, 0.08);
    border-radius: 0 6px 6px 0;
    margin: 16px 0;
    color: #94a3b8;
    font-style: italic;
  }

  .reader-view :global(ul),
  .reader-view :global(ol) {
    margin: 0 0 16px 0;
    padding-left: 24px;
  }

  .reader-view :global(li) {
    margin-bottom: 6px;
  }

  .reader-view :global(hr) {
    border: none;
    border-top: 1px solid #1e293b;
    margin: 24px 0;
  }

  .reader-view :global(a) {
    color: #38bdf8;
    text-decoration: none;
  }

  .reader-view :global(a:hover) {
    text-decoration: underline;
  }

  .reader-view :global(.doc-figure) {
    margin: 20px 0;
    text-align: center;
  }

  .reader-view :global(.doc-figure img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    border: 1px solid #334155;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
    display: block;
    margin: 0 auto;
  }

  .reader-view :global(.doc-figure figcaption) {
    margin-top: 8px;
    font-size: 12px;
    color: #94a3b8;
    font-style: italic;
  }

  .preview-footer {
    padding: 14px 20px;
    border-top: 1px solid #1e293b;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .footer-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .footer-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .btn-primary {
    background: #6366f1;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #4f46e5;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
    border-color: #334155;
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
  }

  .btn-danger {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .btn-danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.25);
    border-color: rgba(239, 68, 68, 0.5);
    color: #fee2e2;
  }

  .btn:disabled {
    opacity: 0.5 !important;
    cursor: not-allowed !important;
    pointer-events: none !important;
  }
</style>
