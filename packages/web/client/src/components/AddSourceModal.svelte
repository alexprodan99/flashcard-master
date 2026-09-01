<script lang="ts">
  import { createSource } from '../lib/api';
  import type { DataSource, DataSourceType } from '../lib/types';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSourceCreated: (source: DataSource) => void;
  }

  let { isOpen, onClose, onSourceCreated }: Props = $props();

  let name = $state('');
  let type = $state<DataSourceType>('rss');
  let uri = $state('');
  let targetDeck = $state('Default');
  let tagsInput = $state('');
  let isSubmitting = $state(false);
  let errorMessage = $state<string | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!name.trim() || !uri.trim()) {
      errorMessage = 'Please provide a source name and target URI / path.';
      return;
    }

    isSubmitting = true;
    errorMessage = null;

    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const source = await createSource({
        name: name.trim(),
        type,
        uri: uri.trim(),
        targetDeck: targetDeck.trim() || 'Default',
        tags,
      });

      // Reset form
      name = '';
      uri = '';
      targetDeck = 'Default';
      tagsInput = '';
      onSourceCreated(source);
      onClose();
    } catch (err: any) {
      errorMessage = err.message || 'Failed to create data source';
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" role="presentation" onclick={onClose}>
    <div class="modal-card" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>Add Ingestion Source</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close modal">✕</button>
      </div>

      {#if errorMessage}
        <div class="error-banner">⚠️ {errorMessage}</div>
      {/if}

      <form onsubmit={handleSubmit} class="modal-form">
        <div class="form-group">
          <label for="src-type-group">Source Type</label>
          <div id="src-type-group" class="type-selector">
            <label class="type-option" class:selected={type === 'rss'}>
              <input type="radio" name="sourceType" value="rss" bind:group={type} />
              <span>📡 RSS</span>
            </label>
            <label class="type-option" class:selected={type === 'web'}>
              <input type="radio" name="sourceType" value="web" bind:group={type} />
              <span>🌐 Web</span>
            </label>
            <label class="type-option" class:selected={type === 'local'}>
              <input type="radio" name="sourceType" value="local" bind:group={type} />
              <span>📁 Local</span>
            </label>
            <label class="type-option" class:selected={type === 'sitemap'}>
              <input type="radio" name="sourceType" value="sitemap" bind:group={type} />
              <span>🗺️ Sitemap</span>
            </label>
            <label class="type-option" class:selected={type === 'llms-txt'}>
              <input type="radio" name="sourceType" value="llms-txt" bind:group={type} />
              <span>📜 LLMs.txt</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="src-name">Source Name</label>
          <input
            id="src-name"
            type="text"
            placeholder="e.g. Milan Jovanovic Blog Sitemap"
            bind:value={name}
            required
          />
        </div>

        <div class="form-group">
          <label for="src-uri">
            {type === 'rss'
              ? 'RSS / Atom Feed URL'
              : type === 'web'
              ? 'Article Web URL'
              : type === 'sitemap'
              ? 'XML Sitemap URL'
              : type === 'llms-txt'
              ? 'LLMs.txt Catalog URL'
              : 'Local Directory / Markdown File Path'}
          </label>
          <input
            id="src-uri"
            type="text"
            placeholder={type === 'rss'
              ? 'https://example.com/feed.xml'
              : type === 'web'
              ? 'https://example.com/post'
              : type === 'sitemap'
              ? 'https://example.com/sitemap.xml'
              : type === 'llms-txt'
              ? 'https://example.com/llms-full.txt'
              : 'C:\\path\\to\\notes'}
            bind:value={uri}
            required
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="src-deck">Target Deck</label>
            <input
              id="src-deck"
              type="text"
              placeholder="Default"
              bind:value={targetDeck}
            />
          </div>

          <div class="form-group">
            <label for="src-tags">Tags (comma-separated)</label>
            <input
              id="src-tags"
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
            {isSubmitting ? 'Adding Source...' : 'Add Data Source'}
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

  .modal-header h2 {
    font-size: 20px;
    font-weight: 700;
    color: #f8fafc;
    margin: 0;
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

  .type-selector {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
    gap: 8px;
  }

  .type-option {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    color: #94a3b8;
    transition: all 0.15s ease;
  }

  .type-option input {
    display: none;
  }

  .type-option.selected {
    background: rgba(99, 102, 241, 0.15);
    border-color: #6366f1;
    color: #818cf8;
    font-weight: 600;
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