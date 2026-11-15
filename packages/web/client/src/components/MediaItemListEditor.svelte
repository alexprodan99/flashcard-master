<script lang="ts">
  import { uploadSourceFile } from '../lib/api';
  import type { MediaExtractionMode, MediaSourceItem, SttProvider, TimestampRange } from '../lib/types';
  import { settingsStore } from '../stores/index.js';

  interface Props {
    sourceType: 'audio' | 'video' | 'youtube';
    items?: MediaSourceItem[];
    disabled?: boolean;
    onNavigate?: (tab: string, queryParams?: Record<string, string>) => void;
    onCloseModal?: () => void;
    onError?: (msg: string | null) => void;
  }

  let {
    sourceType,
    items = $bindable<MediaSourceItem[]>([]),
    disabled = false,
    onNavigate,
    onCloseModal,
    onError,
  }: Props = $props();

  const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];
  const VIDEO_EXTS = ['.mp4', '.mkv', '.webm', '.mov'];
  const SUBTITLE_EXTS = ['.srt', '.vtt'];
  const TIMESTAMP_REGEX = /^\d{1,3}:\d{2}(:\d{2})?$/;

  let urlInput = $state('');
  let manualPathInput = $state('');
  let showManualPath = $state(false);
  let isUploading = $state(false);
  let uploadingSubForIndex = $state<number | null>(null);
  let isDragging = $state(false);
  let localError = $state<string | null>(null);
  let mediaFileInputRef = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!settingsStore.hasLoaded && !settingsStore.loading) {
      settingsStore.loadKeys();
    }
  });

  function setError(msg: string | null) {
    localError = msg;
    onError?.(msg);
  }

  function isValidTimestamp(val: string): boolean {
    return TIMESTAMP_REGEX.test(val.trim());
  }

  function inferTitleFromUri(uri: string): string {
    const clean = uri.trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) {
      return '';
    }
    const parts = clean.split(/[/\\]/);
    const filename = parts[parts.length - 1] || '';
    return filename.replace(/\.[^.]+$/, '');
  }

  function defaultExtractionMode(): MediaExtractionMode {
    return sourceType === 'audio' ? 'stt' : 'auto';
  }

  function appendMediaUris(rawUris: string[]) {
    const existing = new Set(items.map((item) => item.uri));
    const additions: MediaSourceItem[] = [];

    for (const raw of rawUris) {
      const clean = raw.trim();
      if (!clean || existing.has(clean)) continue;
      existing.add(clean);
      const inferredTitle = inferTitleFromUri(clean);
      additions.push({
        uri: clean,
        ...(inferredTitle ? { title: inferredTitle } : {}),
        extractionMode: defaultExtractionMode(),
        sttProvider: settingsStore.general.defaultSttProvider || 'openai',
        timestampRanges: [],
      });
    }

    if (additions.length > 0) {
      items = [...items, ...additions];
    }
  }

  function handleAddYoutubeUrls() {
    setError(null);
    const raw = urlInput.trim();
    if (!raw) return;

    const candidates = raw
      .split(/[\r\n,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const invalid = candidates.filter(
      (u) => !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(u)
    );
    if (invalid.length > 0) {
      setError(`Invalid YouTube URL(s): ${invalid.join(', ')}`);
      return;
    }

    appendMediaUris(candidates);
    urlInput = '';
  }

  function handleAddManualPath() {
    setError(null);
    const clean = manualPathInput.trim();
    if (!clean) return;
    appendMediaUris([clean]);
    manualPathInput = '';
  }

  async function handleMediaFiles(files: File[]) {
    if (!files || files.length === 0) return;
    setError(null);

    const allowedExts = sourceType === 'audio' ? AUDIO_EXTS : VIDEO_EXTS;
    for (const file of files) {
      const dot = file.name.lastIndexOf('.');
      const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
      if (!allowedExts.includes(ext)) {
        setError(
          `Unsupported ${sourceType} file "${file.name}". Allowed: ${allowedExts.join(', ')}.`
        );
        return;
      }
    }

    isUploading = true;
    try {
      const uploadedUris: string[] = [];
      for (const file of files) {
        const res = await uploadSourceFile(file);
        uploadedUris.push(res.path);
      }
      appendMediaUris(uploadedUris);
      if (mediaFileInputRef) {
        mediaFileInputRef.value = '';
      }
    } catch (err: any) {
      setError(err.message || `Failed to upload ${sourceType} file(s).`);
    } finally {
      isUploading = false;
    }
  }

  async function handleSubtitleFile(idx: number, files: File[]) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const dot = file.name.lastIndexOf('.');
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
    if (!SUBTITLE_EXTS.includes(ext)) {
      setError(`Unsupported subtitle file "${file.name}". Allowed: ${SUBTITLE_EXTS.join(', ')}.`);
      return;
    }

    setError(null);
    uploadingSubForIndex = idx;
    try {
      const res = await uploadSourceFile(file);
      updateItem(idx, { subtitlePath: res.path });
    } catch (err: any) {
      setError(err.message || 'Failed to upload subtitle file.');
    } finally {
      uploadingSubForIndex = null;
    }
  }

  function updateItem(idx: number, patch: Partial<MediaSourceItem>) {
    items = items.map((item, i) => (i === idx ? { ...item, ...patch } : item));
  }

  function removeItem(idx: number) {
    items = items.filter((_, i) => i !== idx);
  }

  function addTimestampRange(idx: number) {
    const existing = items[idx]?.timestampRanges || [];
    const nextRange: TimestampRange = { start: '00:00', end: '05:00', label: '' };
    updateItem(idx, { timestampRanges: [...existing, nextRange] });
  }

  function updateTimestampRange(idx: number, rangeIdx: number, patch: Partial<TimestampRange>) {
    const existing = items[idx]?.timestampRanges || [];
    const next = existing.map((r, rIdx) => (rIdx === rangeIdx ? { ...r, ...patch } : r));
    updateItem(idx, { timestampRanges: next });
  }

  function removeTimestampRange(idx: number, rangeIdx: number) {
    const existing = items[idx]?.timestampRanges || [];
    updateItem(idx, { timestampRanges: existing.filter((_, rIdx) => rIdx !== rangeIdx) });
  }

  function isMissingSttKey(provider?: SttProvider): boolean {
    if (!settingsStore.hasLoaded) return false;
    if (provider === 'openai') {
      return !settingsStore.keys.openai?.isConfigured;
    }
    if (provider === 'gemini') {
      return !settingsStore.keys.gemini?.isConfigured;
    }
    return false;
  }

  function getFilenameDisplay(uri: string): string {
    if (/^https?:\/\//i.test(uri)) return uri;
    const parts = uri.split(/[/\\]/);
    return parts[parts.length - 1] || uri;
  }
</script>

<div class="media-editor">
  <div class="editor-header">
    <span class="editor-title">
      {#if sourceType === 'youtube'}
        ▶️ YouTube Videos ({items.length})
      {:else if sourceType === 'audio'}
        🎵 Audio Files ({items.length})
      {:else}
        🎬 Video Files ({items.length})
      {/if}
    </span>
    <span class="editor-subtitle">
      Configure extraction mode, STT provider, subtitle pairing, and custom timestamps per item.
    </span>
  </div>

  {#if localError}
    <div class="media-error-banner">⚠️ {localError}</div>
  {/if}

  {#if sourceType === 'youtube'}
    <div class="yt-input-row">
      <textarea
        rows="2"
        placeholder="Paste one or more YouTube URLs (watch, youtu.be, shorts, live) separated by spaces or newlines..."
        bind:value={urlInput}
        disabled={disabled}
      ></textarea>
      <button
        type="button"
        class="btn-add-media"
        onclick={handleAddYoutubeUrls}
        disabled={disabled || !urlInput.trim()}
      >
        + Add Video URL
      </button>
    </div>
  {:else}
    <div
      class="media-dropzone"
      class:dragging={isDragging}
      class:uploading={isUploading}
      ondrop={(e) => {
        e.preventDefault();
        isDragging = false;
        if (e.dataTransfer?.files) handleMediaFiles(Array.from(e.dataTransfer.files));
      }}
      ondragover={(e) => {
        e.preventDefault();
        isDragging = true;
      }}
      ondragleave={(e) => {
        e.preventDefault();
        isDragging = false;
      }}
      role="region"
      aria-label="Media upload dropzone"
    >
      {#if isUploading}
        <span class="drop-icon">⏳ Uploading {sourceType} file(s)...</span>
      {:else}
        <span class="drop-prompt">
          Drag &amp; drop {sourceType === 'audio' ? 'audio (.mp3, .wav, .m4a, .ogg, .flac)' : 'video (.mp4, .mkv, .webm, .mov)'} files here, or
        </span>
        <label class="btn-browse-media">
          Browse {sourceType === 'audio' ? 'Audio' : 'Video'} Files...
          <input
            bind:this={mediaFileInputRef}
            type="file"
            multiple
            accept={sourceType === 'audio' ? AUDIO_EXTS.join(',') : VIDEO_EXTS.join(',')}
            onchange={(e) => {
              const input = e.target as HTMLInputElement;
              if (input.files) handleMediaFiles(Array.from(input.files));
            }}
            hidden
            disabled={disabled || isUploading}
          />
        </label>
      {/if}
    </div>

    <div class="manual-path-toggle">
      <button
        type="button"
        class="btn-toggle-path"
        onclick={() => (showManualPath = !showManualPath)}
      >
        {showManualPath ? '▼ Hide Local Path Input' : '▶ Advanced: Add Local File Path or Glob'}
      </button>
    </div>

    {#if showManualPath}
      <div class="manual-path-row">
        <input
          type="text"
          placeholder={sourceType === 'audio' ? 'C:\\media\\lecture.mp3' : '/home/user/videos/lecture.mp4'}
          bind:value={manualPathInput}
          disabled={disabled}
        />
        <button
          type="button"
          class="btn-add-media"
          onclick={handleAddManualPath}
          disabled={disabled || !manualPathInput.trim()}
        >
          + Add Path
        </button>
      </div>
    {/if}
  {/if}

  {#if items.length > 0}
    <div class="media-items-list">
      {#each items as item, idx (item.uri)}
        {@const activeProvider = item.sttProvider || settingsStore.general.defaultSttProvider || 'openai'}
        {@const showStt = item.extractionMode === 'stt' || item.extractionMode === 'auto'}
        {@const missingKey = showStt && isMissingSttKey(activeProvider)}
        <div class="media-item-card">
          <div class="item-card-top">
            <div class="item-identity">
              <span class="item-index">#{idx + 1}</span>
              <span class="item-uri" title={item.uri}>{getFilenameDisplay(item.uri)}</span>
            </div>
            <button
              type="button"
              class="btn-remove-item"
              onclick={() => removeItem(idx)}
              disabled={disabled}
              aria-label={`Remove media item ${idx + 1}`}
            >
              ✕ Remove
            </button>
          </div>

          <div class="item-fields-grid">
            <div class="field-cell">
              <label for={`media-title-${idx}`}>Optional Custom Title</label>
              <input
                id={`media-title-${idx}`}
                type="text"
                placeholder="Default from file/video metadata"
                value={item.title || ''}
                oninput={(e) => {
                  const val = (e.target as HTMLInputElement).value;
                  updateItem(idx, { title: val.trim() ? val : undefined });
                }}
                disabled={disabled}
              />
            </div>

            <div class="field-cell">
              <label for={`media-mode-${idx}`}>Extraction Mode</label>
              <select
                id={`media-mode-${idx}`}
                value={item.extractionMode}
                onchange={(e) =>
                  updateItem(idx, {
                    extractionMode: (e.target as HTMLSelectElement).value as MediaExtractionMode,
                  })
                }
                disabled={disabled}
              >
                <option value="auto">Auto (Subtitles first, STT fallback)</option>
                <option value="subtitles">Subtitles / Captions Only</option>
                <option value="stt">AI Speech-to-Text (STT) Only</option>
              </select>
            </div>

            {#if showStt}
              <div class="field-cell">
                <label for={`media-stt-${idx}`}>STT Provider</label>
                <select
                  id={`media-stt-${idx}`}
                  value={activeProvider}
                  onchange={(e) =>
                    updateItem(idx, {
                      sttProvider: (e.target as HTMLSelectElement).value as SttProvider,
                    })
                  }
                  disabled={disabled}
                >
                  <option value="openai">OpenAI Whisper (whisper-1)</option>
                  <option value="gemini">Google Gemini Audio</option>
                  <option value="whisper-local">Local Whisper CLI</option>
                </select>
              </div>
            {/if}

            {#if sourceType !== 'youtube' && item.extractionMode !== 'stt'}
              <div class="field-cell subtitle-cell">
                <label for={`media-sub-${idx}`}>Paired Subtitle (.srt / .vtt)</label>
                <div class="subtitle-controls">
                  {#if item.subtitlePath}
                    <span class="subtitle-chip" title={item.subtitlePath}>
                      💬 {getFilenameDisplay(item.subtitlePath)}
                    </span>
                    <button
                      type="button"
                      class="btn-sub-clear"
                      onclick={() => updateItem(idx, { subtitlePath: undefined })}
                      disabled={disabled}
                    >
                      Clear
                    </button>
                  {:else}
                    <label class="btn-upload-sub">
                      {uploadingSubForIndex === idx ? '⏳ Uploading...' : '+ Upload .srt/.vtt'}
                      <input
                        id={`media-sub-${idx}`}
                        type="file"
                        accept=".srt,.vtt"
                        onchange={(e) => {
                          const input = e.target as HTMLInputElement;
                          if (input.files) handleSubtitleFile(idx, Array.from(input.files));
                        }}
                        hidden
                        disabled={disabled || uploadingSubForIndex === idx}
                      />
                    </label>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          {#if missingKey}
            <div class="stt-warning-row">
              <span class="stt-warning-badge">
                ⚠️ {activeProvider === 'openai' ? 'OpenAI' : 'Gemini'} API key is not configured for Speech-to-Text.
              </span>
              {#if onNavigate}
                <button
                  type="button"
                  class="btn-inline-settings"
                  onclick={() => {
                    onCloseModal?.();
                    onNavigate('settings');
                  }}
                >
                  (Configure in Settings ⚙️)
                </button>
              {/if}
            </div>
          {/if}

          <div class="ranges-section">
            <div class="ranges-header">
              <span>⏱️ Custom Timestamp Ranges (Optional)</span>
              <button
                type="button"
                class="btn-add-range"
                onclick={() => addTimestampRange(idx)}
                disabled={disabled}
              >
                + Add Timestamp Range
              </button>
            </div>

            {#if item.timestampRanges && item.timestampRanges.length > 0}
              <div class="ranges-list">
                {#each item.timestampRanges as range, rIdx}
                  {@const startBad = range.start.trim().length > 0 && !isValidTimestamp(range.start)}
                  {@const endBad = range.end.trim().length > 0 && !isValidTimestamp(range.end)}
                  <div class="range-row">
                    <input
                      type="text"
                      placeholder="00:00"
                      class:invalid={startBad}
                      value={range.start}
                      oninput={(e) =>
                        updateTimestampRange(idx, rIdx, { start: (e.target as HTMLInputElement).value })
                      }
                      aria-label="Start timestamp"
                      disabled={disabled}
                    />
                    <span class="range-sep">→</span>
                    <input
                      type="text"
                      placeholder="05:00"
                      class:invalid={endBad}
                      value={range.end}
                      oninput={(e) =>
                        updateTimestampRange(idx, rIdx, { end: (e.target as HTMLInputElement).value })
                      }
                      aria-label="End timestamp"
                      disabled={disabled}
                    />
                    <input
                      type="text"
                      class="range-label-input"
                      placeholder="Section label (optional)"
                      value={range.label || ''}
                      oninput={(e) =>
                        updateTimestampRange(idx, rIdx, {
                          label: (e.target as HTMLInputElement).value || undefined,
                        })
                      }
                      aria-label="Range label"
                      disabled={disabled}
                    />
                    <button
                      type="button"
                      class="btn-remove-range"
                      onclick={() => removeTimestampRange(idx, rIdx)}
                      disabled={disabled}
                      title="Remove timestamp range"
                    >
                      ✕
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .media-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 14px;
  }

  .editor-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .editor-title {
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .editor-subtitle {
    font-size: 11px;
    color: #94a3b8;
  }

  .media-error-banner {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #fca5a5;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 12px;
  }

  .yt-input-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .yt-input-row textarea {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 8px 12px;
    color: #f8fafc;
    font-size: 13px;
    resize: vertical;
    font-family: inherit;
    outline: none;
  }

  .yt-input-row textarea:focus {
    border-color: #6366f1;
  }

  .btn-add-media {
    align-self: flex-start;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid #6366f1;
    color: #c7d2fe;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-add-media:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .media-dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    border: 2px dashed #334155;
    border-radius: 8px;
    background: rgba(30, 41, 59, 0.5);
    text-align: center;
  }

  .media-dropzone.dragging {
    border-color: #6366f1;
    background: rgba(99, 102, 241, 0.1);
  }

  .drop-prompt,
  .drop-icon {
    font-size: 12px;
    color: #94a3b8;
  }

  .btn-browse-media {
    background: #334155;
    color: #f8fafc;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-browse-media:hover {
    background: #475569;
  }

  .manual-path-toggle {
    display: flex;
  }

  .btn-toggle-path {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
  }

  .manual-path-row {
    display: flex;
    gap: 8px;
  }

  .manual-path-row input {
    flex: 1;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 6px 10px;
    color: #f8fafc;
    font-size: 12px;
  }

  .media-items-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 280px;
    overflow-y: auto;
  }

  .media-item-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 12px;
  }

  .item-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .item-identity {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .item-index {
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .item-uri {
    font-size: 12px;
    color: #e2e8f0;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-remove-item {
    background: transparent;
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #fca5a5;
    padding: 3px 8px;
    border-radius: 5px;
    font-size: 11px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .item-fields-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px;
  }

  .field-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-cell label {
    font-size: 11px;
    color: #94a3b8;
    font-weight: 500;
  }

  .field-cell input[type='text'],
  .field-cell select {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 6px 8px;
    color: #f8fafc;
    font-size: 12px;
    outline: none;
  }

  .subtitle-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .subtitle-chip {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.35);
    color: #6ee7b7;
    font-size: 11px;
    padding: 3px 7px;
    border-radius: 4px;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-upload-sub,
  .btn-sub-clear {
    background: #334155;
    border: 1px solid #475569;
    color: #e2e8f0;
    padding: 4px 8px;
    border-radius: 5px;
    font-size: 11px;
    cursor: pointer;
  }

  .stt-warning-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: 6px;
    padding: 6px 8px;
  }

  .stt-warning-badge {
    font-size: 11px;
    color: #fcd34d;
  }

  .btn-inline-settings {
    background: transparent;
    border: none;
    color: #93c5fd;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .ranges-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px dashed #334155;
  }

  .ranges-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #cbd5e1;
  }

  .btn-add-range {
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.35);
    color: #7dd3fc;
    padding: 3px 8px;
    border-radius: 5px;
    font-size: 11px;
    cursor: pointer;
  }

  .ranges-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .range-row {
    display: grid;
    grid-template-columns: 76px auto 76px 1fr auto;
    align-items: center;
    gap: 6px;
  }

  .range-row input {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 5px;
    padding: 5px 7px;
    color: #f8fafc;
    font-size: 12px;
    min-width: 0;
  }

  .range-row input.invalid {
    border-color: #ef4444;
    color: #fca5a5;
  }

  .range-sep {
    color: #94a3b8;
    font-size: 12px;
  }

  .btn-remove-range {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 12px;
    padding: 4px;
  }

  .btn-remove-range:hover {
    color: #fca5a5;
  }
</style>

