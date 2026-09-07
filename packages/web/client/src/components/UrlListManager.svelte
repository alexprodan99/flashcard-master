<script lang="ts">
  interface Props {
    urls: string[];
    onUrlsChange: (urls: string[]) => void;
    disabled?: boolean;
  }

  let { urls = [], onUrlsChange, disabled = false }: Props = $props();

  let inputVal = $state('');
  let warningMessage = $state<string | null>(null);
  let warningTimer: ReturnType<typeof setTimeout> | null = null;

  function showWarning(msg: string) {
    if (warningTimer) clearTimeout(warningTimer);
    warningMessage = msg;
    warningTimer = setTimeout(() => {
      warningMessage = null;
      warningTimer = null;
    }, 4000);
  }

  function parseInputTokens(text: string): string[] {
    if (!text || !text.trim()) return [];
    const trimmed = text.trim();

    let rawTokens: string[] = [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          rawTokens = parsed.map((u) => (typeof u === 'string' ? u.trim() : ''));
        }
      } catch {
        rawTokens = [trimmed.replace(/^\[|\]$/g, '').trim()];
      }
    } else {
      rawTokens = [trimmed];
    }

    const candidates: string[] = [];
    for (const token of rawTokens) {
      if (!token) continue;
      const lines = token.split(/[\r\n]+/);
      for (const line of lines) {
        const l = line.trim();
        if (!l) continue;
        const splitByUrls = l.split(/[\s,]+(?=[<"']?https?:\/\/)/i);
        for (const piece of splitByUrls) {
          const p = piece.trim().replace(/^[<"']|[>"']$/g, '');
          if (p) candidates.push(p);
        }
      }
    }

    const validUrls: string[] = [];
    for (const item of candidates) {
      try {
        const parsed = new URL(item);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          validUrls.push(parsed.href);
        }
      } catch {
        // Skip invalid URL syntax
      }
    }

    return validUrls;
  }

  function addUrlsFromTokens(newTokens: string[]) {
    if (newTokens.length === 0) {
      showWarning('Please enter a valid HTTP(S) URL.');
      return;
    }

    const currentSet = new Set(urls);
    const duplicates: string[] = [];
    const toAdd: string[] = [];

    for (const u of newTokens) {
      if (currentSet.has(u)) {
        duplicates.push(u);
      } else {
        currentSet.add(u);
        toAdd.push(u);
      }
    }

    if (toAdd.length > 0) {
      const nextUrls = [...urls, ...toAdd];
      onUrlsChange(nextUrls);
      inputVal = '';
    }

    if (duplicates.length > 0) {
      if (toAdd.length > 0) {
        showWarning(`Added ${toAdd.length} new URL(s). Skipped ${duplicates.length} duplicate(s).`);
      } else {
        showWarning(`URL already in list: ${duplicates[0]}`);
      }
    } else {
      warningMessage = null;
    }
  }

  function handleAdd() {
    if (!inputVal.trim()) return;
    const tokens = parseInputTokens(inputVal);
    addUrlsFromTokens(tokens);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const pastedText = e.clipboardData?.getData('text');
    if (pastedText && (pastedText.includes('\n') || pastedText.includes(','))) {
      e.preventDefault();
      const tokens = parseInputTokens(pastedText);
      addUrlsFromTokens(tokens);
    }
  }

  function removeUrl(index: number) {
    const nextUrls = urls.filter((_, i) => i !== index);
    onUrlsChange(nextUrls);
    warningMessage = null;
  }

  function clearAll() {
    onUrlsChange([]);
    warningMessage = null;
  }
</script>

<div class="url-list-manager">
  <div class="manager-header">
    <div class="header-left">
      <span class="label-text">Article Web URLs</span>
      <span class="count-badge" class:has-items={urls.length > 0}>
        {urls.length} {urls.length === 1 ? 'URL' : 'URLs'}
      </span>
    </div>
    {#if urls.length >= 2 && !disabled}
      <button type="button" class="clear-btn" onclick={clearAll}>Clear All</button>
    {/if}
  </div>

  <div class="input-row">
    <input
      type="text"
      placeholder="Paste single URL or multiline / comma list..."
      bind:value={inputVal}
      onkeydown={handleKeyDown}
      onpaste={handlePaste}
      {disabled}
    />
    <button
      type="button"
      class="btn-add"
      onclick={handleAdd}
      disabled={disabled || !inputVal.trim()}
    >
      + Add URL
    </button>
  </div>

  <div class="hint-text">
    💡 <strong>Tip:</strong> Paste multiple URLs or lines at once to batch add articles.
  </div>

  {#if warningMessage}
    <div class="warning-banner">⚠️ {warningMessage}</div>
  {/if}

  <div class="urls-container">
    {#if urls.length === 0}
      <div class="empty-urls">
        <span>No URLs added yet. Enter or paste URLs above to populate this source.</span>
      </div>
    {:else}
      <ul class="urls-list">
        {#each urls as url, index}
          <li class="url-item">
            <span class="url-index">#{index + 1}</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              class="url-link"
              title={url}
            >
              {url}
            </a>
            {#if !disabled}
              <button
                type="button"
                class="remove-btn"
                onclick={() => removeUrl(index)}
                aria-label="Remove URL"
                title="Remove URL"
              >
                ✕
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .url-list-manager {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .manager-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .label-text {
    font-size: 13px;
    font-weight: 500;
    color: #cbd5e1;
  }

  .count-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 12px;
    background: #334155;
    color: #94a3b8;
  }

  .count-badge.has-items {
    background: rgba(99, 102, 241, 0.2);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.3);
  }

  .clear-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .clear-btn:hover {
    color: #fca5a5;
  }

  .input-row {
    display: flex;
    gap: 8px;
  }

  input[type="text"] {
    flex: 1;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 9px 12px;
    color: #f8fafc;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }

  input[type="text"]:focus {
    border-color: #6366f1;
  }

  input[type="text"]:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-add {
    background: #334155;
    color: #f8fafc;
    border: 1px solid #475569;
    border-radius: 8px;
    padding: 9px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .btn-add:hover:not(:disabled) {
    background: #475569;
    border-color: #6366f1;
    color: #ffffff;
  }

  .btn-add:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hint-text {
    font-size: 11px;
    color: #64748b;
  }

  .warning-banner {
    background: rgba(234, 179, 8, 0.15);
    border: 1px solid rgba(234, 179, 8, 0.3);
    color: #fde047;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
  }

  .urls-container {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    max-height: 170px;
    overflow-y: auto;
    padding: 6px;
  }

  .empty-urls {
    padding: 16px 12px;
    text-align: center;
    font-size: 12px;
    color: #64748b;
  }

  .urls-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .url-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid rgba(51, 65, 85, 0.5);
    border-radius: 6px;
    font-size: 12px;
  }

  .url-index {
    color: #64748b;
    font-family: monospace;
    font-weight: 600;
    font-size: 11px;
    min-width: 24px;
  }

  .url-link {
    flex: 1;
    color: #60a5fa;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
  }

  .url-link:hover {
    text-decoration: underline;
  }

  .remove-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .remove-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }
</style>
