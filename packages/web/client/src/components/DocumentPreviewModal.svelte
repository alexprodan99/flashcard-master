<script lang="ts">
  import type { DiscoveredDocument } from '../lib/types';

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
        <button class="btn-close" onclick={onClose} aria-label="Close Preview">✕</button>
      </div>

      <div class="preview-content">
        <pre>{document.textContent}</pre>
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
    width: 820px;
    max-width: 95vw;
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

  .meta-pill.card-pill {
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.3);
  }

  .meta-url {
    color: #60a5fa;
    text-decoration: none;
    max-width: 380px;
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
    padding: 20px;
    background: #0b0f19;
  }

  .preview-content pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: 13px;
    color: #cbd5e1;
    line-height: 1.6;
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
