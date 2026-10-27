<script lang="ts">
  import { exportDocuments, type DocumentExportParams } from '../lib/api';
  import type { DiscoveredDocument, DocumentExportFormat } from '../lib/types';

  interface Props {
    isOpen: boolean;
    documents: DiscoveredDocument[];
    sourceName?: string;
    sourceId?: string;
    onClose: () => void;
    onExportSuccess?: (filename: string) => void;
  }

  let {
    isOpen = false,
    documents = [],
    sourceName = 'Knowledge Base',
    sourceId,
    onClose,
    onExportSuccess,
  }: Props = $props();

  let format = $state<DocumentExportFormat>('markdown');
  let mode = $state<'merged' | 'split'>('merged');

  $effect(() => {
    if (format === 'epub' && mode !== 'merged') {
      mode = 'merged';
    }
  });
  let includeTableOfContents = $state(true);
  let includeCitations = $state(true);
  let imageQuality = $state<'compact' | 'standard' | 'high'>('compact');
  let grayscale = $state(false);
  let coverImageBase64 = $state<string | null>(null);
  let coverImageName = $state<string | null>(null);
  let isExporting = $state(false);
  let errorMessage = $state<string | null>(null);
  let successNotice = $state<string | null>(null);

  function handleCoverImageChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) {
      coverImageBase64 = null;
      coverImageName = null;
      return;
    }
    const file = target.files[0];
    coverImageName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      coverImageBase64 = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function removeCoverImage() {
    coverImageBase64 = null;
    coverImageName = null;
  }

  let totalWords = $derived(
    documents.reduce((acc, d) => {
      const count = typeof d.wordCount === 'number' && d.wordCount > 0
        ? d.wordCount
        : d.textContent ? d.textContent.trim().split(/\s+/).length : 0;
      return acc + count;
    }, 0)
  );

  async function handleExport() {
    if (documents.length === 0) {
      errorMessage = 'No documents selected for export.';
      return;
    }

    isExporting = true;
    errorMessage = null;
    successNotice = null;

    try {
      const docIds = documents.map((d) => d.id);
      const params: DocumentExportParams = {
        sourceId,
        ids: docIds,
        format,
        mode,
        includeTableOfContents,
        includeCitations,
        imageQuality,
        grayscale,
        coverImage: coverImageBase64 || undefined,
      };

      const { filename } = await exportDocuments(params);
      successNotice = `Successfully downloaded ${filename}!`;
      if (onExportSuccess) {
        onExportSuccess(filename);
      }
      setTimeout(() => {
        onClose();
        successNotice = null;
      }, 1500);
    } catch (err: any) {
      errorMessage = err.message || 'Failed to export documents';
    } finally {
      isExporting = false;
    }
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" role="presentation" onclick={onClose}>
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div class="modal-header">
        <div class="header-title">
          <h2>📤 Export Knowledge Base</h2>
          <p class="subtitle">Export extracted clean document text to EPUB eBook, Markdown, HTML, Plain Text, or JSON</p>
        </div>
        <button type="button" class="btn-close" onclick={onClose} aria-label="Close dialog">✕</button>
      </div>

      {#if errorMessage}
        <div class="alert alert-danger" role="alert">
          <span>⚠️ {errorMessage}</span>
          <button type="button" class="btn-clear-alert" onclick={() => (errorMessage = null)}>✕</button>
        </div>
      {/if}

      {#if successNotice}
        <div class="alert alert-success" role="status">
          <span>✅ {successNotice}</span>
        </div>
      {/if}

      <div class="modal-body">
        <!-- Scope Summary Pill -->
        <div class="scope-summary-box">
          <div class="scope-header">
            <span class="scope-badge">Scope</span>
            <strong>{sourceName}</strong>
          </div>
          <div class="scope-stats">
            <span>📚 <strong>{documents.length}</strong> {documents.length === 1 ? 'document' : 'documents'}</span>
            <span>•</span>
            <span>📊 <strong>{totalWords.toLocaleString()}</strong> words</span>
          </div>
        </div>

        <!-- Format Selector -->
        <div class="form-group">
          <label class="form-label" for="export-format">Export Format</label>
          <div class="format-grid" id="export-format">
            <button
              type="button"
              class="format-btn"
              class:selected={format === 'markdown'}
              onclick={() => (format = 'markdown')}
            >
              <div class="format-icon">📝</div>
              <div class="format-name">Markdown</div>
              <div class="format-ext">.md</div>
            </button>

            <button
              type="button"
              class="format-btn"
              class:selected={format === 'epub'}
              onclick={() => {
                format = 'epub';
                mode = 'merged';
              }}
            >
              <div class="format-icon">📚</div>
              <div class="format-name">EPUB eBook</div>
              <div class="format-ext">.epub</div>
            </button>

            <button
              type="button"
              class="format-btn"
              class:selected={format === 'html'}
              onclick={() => (format = 'html')}
            >
              <div class="format-icon">🌐</div>
              <div class="format-name">HTML Page</div>
              <div class="format-ext">.html</div>
            </button>

            <button
              type="button"
              class="format-btn"
              class:selected={format === 'txt'}
              onclick={() => (format = 'txt')}
            >
              <div class="format-icon">📄</div>
              <div class="format-name">Plain Text</div>
              <div class="format-ext">.txt</div>
            </button>

            <button
              type="button"
              class="format-btn"
              class:selected={format === 'json'}
              onclick={() => (format = 'json')}
            >
              <div class="format-icon">{`{ }`}</div>
              <div class="format-name">JSON Data</div>
              <div class="format-ext">.json</div>
            </button>
          </div>
        </div>

        {#if format === 'epub'}
          <div class="format-callout">
            <div class="callout-header">
              <span class="callout-icon">📚</span>
              <span class="callout-title">EPUB eBook (.epub)</span>
              <span class="badge-ereader">E-Reader</span>
            </div>
            <p class="callout-desc">
              Compiled eBook formatted for Kindle, Apple Books, Kobo, and e-readers.
            </p>
          </div>
        {/if}

        <!-- Packaging Mode Selector -->
        <div class="form-group">
          <div class="mode-header-row">
            <label class="form-label" for="packaging-mode">Packaging Mode</label>
            {#if format === 'epub'}
              <span class="badge-epub-lock">🔒 Merged eBook Only</span>
            {/if}
          </div>
          <div class="mode-options" id="packaging-mode">
            <label class="mode-card" class:active={mode === 'merged'} class:disabled={format === 'epub'}>
              <input
                type="radio"
                name="export-mode"
                value="merged"
                checked={mode === 'merged'}
                disabled={format === 'epub'}
                onchange={() => (mode = 'merged')}
              />
              <div class="mode-info">
                <strong>📑 Merged Master Document</strong>
                <span>Single file compiling all articles with Table of Contents and section dividers</span>
              </div>
            </label>

            <label class="mode-card" class:active={mode === 'split'} class:disabled={format === 'epub'}>
              <input
                type="radio"
                name="export-mode"
                value="split"
                checked={mode === 'split'}
                disabled={format === 'epub'}
                onchange={() => (mode = 'split')}
              />
              <div class="mode-info">
                <strong>📦 Split ZIP Archive (.zip)</strong>
                <span>Individual numbered slug files (<code>01-title.{format === 'markdown' ? 'md' : format}</code>) + README catalog</span>
              </div>
            </label>
          </div>
          {#if format === 'epub'}
            <p class="mode-help-text">
              EPUB packaging is always compiled into a single eBook file. Split archive mode is disabled.
            </p>
          {/if}
        </div>

        <!-- Additional Options -->
        <div class="form-group">
          <span class="form-label">Content Options</span>
          <div class="checkbox-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                bind:checked={includeTableOfContents}
                disabled={format === 'json' || mode === 'split'}
              />
              <span>Include interactive Table of Contents & Jump Anchors</span>
            </label>

            <label class="checkbox-label">
              <input
                type="checkbox"
                bind:checked={includeCitations}
              />
              <span>Include Source Origin URLs & Word Counts in Header</span>
            </label>
          </div>
        </div>

        {#if (format === 'html' || format === 'epub') && mode === 'merged'}
          <div class="form-group">
            <span class="form-label">E-Reader & Kindle Image Optimization</span>
            <div class="checkbox-group">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  checked={imageQuality === 'compact'}
                  onchange={(e) => (imageQuality = e.currentTarget.checked ? 'compact' : 'high')}
                />
                <span><strong>Compact Base64 / Local Inlining</strong> (Downscales images to 600px WebP, shrinks export to ~7MB, prevents Edge crashes)</span>
              </label>

              <label class="checkbox-label">
                <input
                  type="checkbox"
                  bind:checked={grayscale}
                />
                <span><strong>Kindle E-Ink Grayscale</strong> (Convert inlined images to monochrome for black & white e-readers, extra 15% smaller)</span>
              </label>
            </div>
          </div>
        {/if}

        {#if format === 'epub'}
          <div class="form-group">
            <span class="form-label">Custom eBook Cover (Optional)</span>
            <div class="cover-upload-box">
              {#if coverImageBase64}
                <div class="cover-preview-wrapper">
                  <img src={coverImageBase64} alt="Cover Preview" class="cover-preview-thumb" />
                  <div class="cover-preview-info">
                    <span class="cover-name">{coverImageName}</span>
                    <button type="button" class="btn-remove-cover" onclick={removeCoverImage}>Remove Cover</button>
                  </div>
                </div>
              {:else}
                <label class="cover-dropzone-label">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    class="cover-file-input"
                    onchange={handleCoverImageChange}
                  />
                  <div class="cover-dropzone-content">
                    <span class="cover-icon">🖼️</span>
                    <span>Upload Custom Cover Image (JPG, PNG, WebP)</span>
                    <span class="cover-hint">Leave blank to use default SVG title cover</span>
                  </div>
                </label>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick={onClose} disabled={isExporting}>
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          onclick={handleExport}
          disabled={isExporting || documents.length === 0}
        >
          {#if isExporting}
            <span class="spinner-small"></span> {format === 'epub' ? 'Generating eBook...' : 'Generating Export...'}
          {:else}
            📥 Download Export ({format === 'markdown' ? 'Markdown' : format === 'epub' ? 'EPUB' : format.toUpperCase()})
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
    padding: 1rem;
  }

  .modal-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    width: 100%;
    max-width: 580px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #334155;
  }

  .header-title h2 {
    font-size: 1.25rem;
    font-weight: 700;
    color: #f8fafc;
    margin: 0 0 0.25rem 0;
  }

  .subtitle {
    font-size: 0.825rem;
    color: #94a3b8;
    margin: 0;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    transition: all 0.15s ease;
  }

  .btn-close:hover {
    background: #334155;
    color: #f8fafc;
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .scope-summary-box {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 0.85rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .scope-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #f8fafc;
    font-size: 0.95rem;
  }

  .scope-badge {
    background: #0284c7;
    color: #e0f2fe;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
  }

  .scope-stats {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #cbd5e1;
  }

  .format-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.5rem;
  }

  .format-btn {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 0.75rem 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
    transition: all 0.15s ease;
    color: #cbd5e1;
  }

  .format-btn:hover {
    border-color: #6366f1;
    background: #1e293b;
  }

  .format-btn.selected {
    background: rgba(99, 102, 241, 0.15);
    border-color: #6366f1;
    color: #ffffff;
    box-shadow: 0 0 0 1px #6366f1;
  }

  .format-icon {
    font-size: 1.25rem;
  }

  .format-name {
    font-size: 0.8rem;
    font-weight: 600;
  }

  .format-ext {
    font-size: 0.7rem;
    color: #94a3b8;
  }

  .format-callout {
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid rgba(99, 102, 241, 0.25);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .callout-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .callout-icon {
    font-size: 1rem;
  }

  .callout-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: #e0e7ff;
  }

  .badge-ereader {
    background: #059669;
    color: #ecfdf5;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    margin-left: auto;
  }

  .callout-desc {
    font-size: 0.8rem;
    color: #cbd5e1;
    margin: 0;
    line-height: 1.4;
  }

  .mode-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .badge-epub-lock {
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
    border: 1px solid rgba(99, 102, 241, 0.4);
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
  }

  .mode-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .mode-card {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-card:hover:not(.disabled) {
    border-color: #64748b;
  }

  .mode-card.active {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.08);
  }

  .mode-card.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .mode-card.disabled input {
    cursor: not-allowed;
  }

  .mode-card input {
    margin-top: 0.2rem;
  }

  .mode-help-text {
    font-size: 0.75rem;
    color: #94a3b8;
    margin: 0.25rem 0 0 0;
  }

  .mode-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .mode-info strong {
    font-size: 0.9rem;
    color: #f8fafc;
  }

  .mode-info span {
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .mode-info code {
    background: #1e293b;
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
    font-size: 0.75rem;
    color: #38bdf8;
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: #cbd5e1;
    cursor: pointer;
  }

  .checkbox-label input[type='checkbox'] {
    cursor: pointer;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #334155;
  }

  .btn {
    padding: 0.55rem 1.15rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: none;
  }

  .btn-secondary {
    background: #334155;
    color: #cbd5e1;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #475569;
    color: #f8fafc;
  }

  .btn-primary {
    background: #6366f1;
    color: #ffffff;
  }

  .btn-primary:hover:not(:disabled) {
    background: #4f46e5;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .alert {
    padding: 0.65rem 1rem;
    border-radius: 6px;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 1rem 1.5rem 0 1.5rem;
  }

  .alert-danger {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid #ef4444;
    color: #fca5a5;
  }

  .alert-success {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid #10b981;
    color: #6ee7b7;
  }

  .btn-clear-alert {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    display: inline-block;
  }

  .cover-upload-box {
    background: #0f172a;
    border: 1px dashed #475569;
    border-radius: 8px;
    padding: 0.75rem;
    transition: border-color 0.15s ease;
  }

  .cover-upload-box:hover {
    border-color: #38bdf8;
  }

  .cover-dropzone-label {
    display: block;
    cursor: pointer;
  }

  .cover-file-input {
    display: none;
  }

  .cover-dropzone-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: #cbd5e1;
  }

  .cover-icon {
    font-size: 1.5rem;
  }

  .cover-hint {
    font-size: 0.75rem;
    color: #64748b;
  }

  .cover-preview-wrapper {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .cover-preview-thumb {
    width: 48px;
    height: 64px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid #334155;
    box-shadow: 0 2px 4px rgba(0,0,0,0.4);
  }

  .cover-preview-info {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    overflow: hidden;
  }

  .cover-name {
    font-size: 0.825rem;
    font-weight: 500;
    color: #f1f5f9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-remove-cover {
    background: #dc2626;
    color: #fee2e2;
    border: none;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    align-self: flex-start;
  }

  .btn-remove-cover:hover {
    background: #b91c1c;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
