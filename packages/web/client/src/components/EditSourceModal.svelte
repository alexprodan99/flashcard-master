<script lang="ts">
  import { updateSource } from '../lib/api';
  import type { DataSource } from '../lib/types';
  import UrlListManager from './UrlListManager.svelte';

  interface Props {
    isOpen: boolean;
    source: DataSource | null;
    onClose: () => void;
    onSourceUpdated: (source: DataSource) => void;
  }

  let { isOpen, source, onClose, onSourceUpdated }: Props = $props();

  let name = $state('');
  let uri = $state('');
  let webUrls = $state<string[]>([]);
  let targetDeck = $state('Default');
  let tagsInput = $state('');
  let isSubmitting = $state(false);
  let errorMessage = $state<string | null>(null);

  $effect(() => {
    if (isOpen && source) {
      name = source.name || '';
      targetDeck = source.targetDeck || 'Default';
      tagsInput = (source.tags || []).join(', ');
      errorMessage = null;

      if (source.type === 'web') {
        const raw = source.uri || '';
        if (raw.trim().startsWith('[') && raw.trim().endsWith(']')) {
          try {
            const parsed = JSON.parse(raw);
            webUrls = Array.isArray(parsed) ? parsed.map((u) => String(u).trim()).filter(Boolean) : [raw.trim()];
          } catch {
            webUrls = raw.split(/[\r\n,]+/).map((u) => u.trim()).filter(Boolean);
          }
        } else if (raw.trim()) {
          webUrls = [raw.trim()];
        } else {
          webUrls = [];
        }
      } else {
        uri = source.uri || '';
      }
    }
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!source || isSubmitting) return;

    let finalUri = '';
    if (source.type === 'web') {
      const cleanUrls = webUrls.map((u) => u.trim()).filter(Boolean);
      if (cleanUrls.length === 0) {
        errorMessage = 'Please provide at least one valid web URL.';
        return;
      }
      finalUri = cleanUrls.length === 1 ? cleanUrls[0] : JSON.stringify(cleanUrls);
    } else {
      finalUri = uri.trim();
    }

    if (!name.trim() || !finalUri) {
      errorMessage = 'Please provide a source name and target URI / path.';
      return;
    }

    isSubmitting = true;
    errorMessage = null;

    try {
      const tags = Array.from(
        new Set(
          tagsInput
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        )
      );

      const updated = await updateSource(source.id, {
        name: name.trim(),
        uri: finalUri,
        targetDeck: targetDeck.trim() || 'Default',
        tags,
      });

      onSourceUpdated(updated);
      onClose();
    } catch (err: any) {
      errorMessage = err.message || 'Failed to update data source';
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if isOpen && source}
  <div class="modal-backdrop" role="presentation" onclick={onClose}>
    <div class="modal-card" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <div class="header-title">
          <h2>Edit Data Source</h2>
          <span class="type-pill {source.type}">{source.type}</span>
        </div>
        <button class="close-btn" onclick={onClose} aria-label="Close modal">✕</button>
      </div>

      {#if errorMessage}
        <div class="error-banner">⚠️ {errorMessage}</div>
      {/if}

      <form onsubmit={handleSubmit} class="modal-form">
        <div class="form-group">
          <label for="edit-src-name">Source Name</label>
          <input
            id="edit-src-name"
            type="text"
            placeholder="e.g. Engineering Architecture Blog"
            bind:value={name}
            required
          />
        </div>

        {#if source.type === 'web'}
          <div class="form-group">
            <UrlListManager
              urls={webUrls}
              onUrlsChange={(next) => (webUrls = next)}
              disabled={isSubmitting}
            />
          </div>
        {:else}
          <div class="form-group">
            <label for="edit-src-uri">
              {source.type === 'rss'
                ? 'RSS / Atom Feed URL'
                : source.type === 'sitemap'
                ? 'XML Sitemap URL'
                : source.type === 'llms-txt'
                ? 'LLMs.txt Catalog URL'
                : 'Local Directory / Markdown File Path'}
            </label>
            <input
              id="edit-src-uri"
              type="text"
              bind:value={uri}
              required
            />
          </div>
        {/if}

        <div class="form-row">
          <div class="form-group">
            <label for="edit-src-deck">Target Deck</label>
            <input
              id="edit-src-deck"
              type="text"
              placeholder="Default"
              bind:value={targetDeck}
            />
          </div>

          <div class="form-group">
            <label for="edit-src-tags">Tags (comma-separated)</label>
            <input
              id="edit-src-tags"
              type="text"
              placeholder="tech, distributed-systems"
              bind:value={tagsInput}
            />
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 16px;
    width: 100%;
    max-width: 540px;
    padding: 28px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .modal-header h2 {
    font-size: 20px;
    font-weight: 700;
    color: #f8fafc;
    margin: 0;
  }

  .type-pill {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 4px;
  }

  .type-pill.web {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .type-pill.rss {
    background: rgba(249, 115, 22, 0.15);
    color: #fb923c;
    border: 1px solid rgba(249, 115, 22, 0.3);
  }

  .type-pill.local {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.3);
  }

  .type-pill.sitemap {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .type-pill.llms-txt {
    background: rgba(236, 72, 153, 0.15);
    color: #f472b6;
    border: 1px solid rgba(236, 72, 153, 0.3);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 18px;
    cursor: pointer;
  }

  .close-btn:hover {
    color: #f1f5f9;
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }

  .form-row {
    display: flex;
    gap: 12px;
  }

  label {
    font-size: 13px;
    font-weight: 500;
    color: #cbd5e1;
  }

  input[type="text"] {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 14px;
    color: #f8fafc;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  input[type="text"]:focus {
    border-color: #6366f1;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 12px;
  }

  .btn {
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .btn-secondary {
    background: #334155;
    color: #cbd5e1;
  }

  .btn-secondary:hover {
    background: #475569;
  }

  .btn-primary {
    background: #6366f1;
    color: #ffffff;
  }

  .btn-primary:hover {
    background: #4f46e5;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 12px;
  }
</style>
