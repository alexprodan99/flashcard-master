<script lang="ts">
  import { fetchSourceSyncStatus, updateSource, uploadSourceFile, syncSource } from '../lib/api';
  import type {
    DataSource,
    DataSourceType,
    DocumentSlicingOptions,
    ItemSyncState,
    MediaSourceItem,
    SlicingMode,
    SourceSyncStatusResponse,
    SyncMode,
  } from '../lib/types';
  import { extractClientYouTubeVideoId, getClientItemSyncStatus, parseMediaItemsSummary, parseWebSourceUrlsClient, validateMediaItems } from '../lib/formatters.js';
  import { settingsStore, sourcesStore, toastStore } from '../stores/index.js';
  import { buildNotionUri, parseNotionUri, isValidNotionInput } from '../lib/notion-uri.js';
  import UrlListManager from './UrlListManager.svelte';
  import MediaItemListEditor from './MediaItemListEditor.svelte';
  import SplitSyncButton from './SplitSyncButton.svelte';
  import SyncStatusBadge from './SyncStatusBadge.svelte';
  import TagInput from './TagInput.svelte';

  interface Props {
    isOpen: boolean;
    source: DataSource | null;
    onClose: () => void;
    onSourceUpdated: (source: DataSource) => void;
    onNavigate?: (tab: string, queryParams?: Record<string, string>) => void;
  }

  let { isOpen, source, onClose, onSourceUpdated, onNavigate }: Props = $props();

  let name = $state('');
  let uri = $state('');
  let webUrls = $state<string[]>([]);
  let mediaItems = $state<MediaSourceItem[]>([]);
  let notionRecursive = $state(false);
  let tags = $state<string[]>([]);
  let isSubmitting = $state(false);
  let errorMessage = $state<string | null>(null);
  let isUploadingFile = $state(false);
  let fileInputRef = $state<HTMLInputElement | null>(null);
  let slicingMode = $state<SlicingMode>('timestamps');
  let minutesPerChunk = $state<number | string>(10);
  let syncStatus = $state<SourceSyncStatusResponse | null>(null);
  let syncStatusLoading = $state(false);
  let syncStatusError = $state(false);
  let originalCleanUri = $state('');
  let localFilePaths = $state<string[]>([]);
  let mediaEditorRef = $state<any>(null);
  let baselineSourceSlicing = $state('');
  let baselineMediaConfigByKey = $state<Record<string, string>>({});
  let modalSession = 0;

  function getMediaConfigKey(item: MediaSourceItem, sourceType: DataSourceType): string {
    const vid = sourceType === 'youtube' ? extractClientYouTubeVideoId(item.uri) : null;
    return vid || item.uri;
  }

  function serializeMediaConfig(item: MediaSourceItem): string {
    return JSON.stringify({
      extractionMode: item.extractionMode || 'auto',
      sttProvider: item.sttProvider || '',
      subtitlePath: item.subtitlePath || '',
      slicingMode: item.slicingMode || 'inherit',
      intervalMinutes: item.intervalMinutes ?? null,
      timestampRanges: item.timestampRanges || [],
    });
  }

  const isMediaType = (t: DataSourceType): t is 'audio' | 'video' | 'youtube' =>
    t === 'audio' || t === 'video' || t === 'youtube';

  async function handleFilesAddOrReplace(files: File[]) {
    if (!files || files.length === 0) return;
    const ALLOWED_EXTS = ['.md', '.markdown', '.txt', '.pdf', '.docx', '.epub'];
    for (const file of files) {
      const lastDot = file.name.lastIndexOf('.');
      const ext = lastDot >= 0 ? file.name.slice(lastDot).toLowerCase() : '';
      if (ext === '.doc') {
        errorMessage = 'Legacy pre-2007 Word (.doc) files are not supported. Please convert to .docx or .pdf before uploading.';
        return;
      }
      if (!ALLOWED_EXTS.includes(ext)) {
        errorMessage = 'Only .md, .markdown, .txt, .pdf, .docx, and .epub files are supported.';
        return;
      }
    }

    isUploadingFile = true;
    errorMessage = null;
    const activeSession = modalSession;

    try {
      const uploadedPaths: string[] = [];
      let firstFilename = '';
      for (const file of files) {
        const result = await uploadSourceFile(file);
        if (activeSession !== modalSession || !isOpen) return;
        uploadedPaths.push(result.path);
        if (!firstFilename) firstFilename = result.filename;
      }

      if (localFilePaths.length > 0 || uploadedPaths.length > 1) {
        const existing = localFilePaths.length > 0 ? localFilePaths : (uri.trim() ? [uri.trim()] : []);
        const merged = Array.from(new Set([...existing, ...uploadedPaths]));
        localFilePaths = merged;
        uri = merged.length === 1 ? merged[0] : '';
      } else if (uploadedPaths.length === 1) {
        uri = uploadedPaths[0];
      }
      if (!name.trim() && firstFilename) {
        name = firstFilename.replace(/\.(md|markdown|txt|pdf|docx|epub)$/i, '');
      }
    } catch (err: any) {
      errorMessage = err.message || 'Failed to upload file';
    } finally {
      isUploadingFile = false;
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      void handleFilesAddOrReplace(Array.from(input.files));
    }
  }

  $effect(() => {
    if (isOpen && !settingsStore.hasLoaded && !settingsStore.loading) {
      settingsStore.loadKeys();
    }
  });

  $effect(() => {
    if (isOpen && source) {
      name = source.name || '';
      tags = [...(source.tags || [])];
      errorMessage = null;

      modalSession += 1;
      localFilePaths = [];
      if (source.type === 'web') {
        webUrls = parseWebSourceUrlsClient(source.uri || '');
      } else if (source.type === 'local') {
        const raw = (source.uri || '').trim();
        if (raw.startsWith('[')) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              localFilePaths = parsed.map((u) => String(u || '').trim()).filter(Boolean);
              uri = '';
            } else {
              uri = raw;
            }
          } catch {
            uri = raw;
          }
        } else {
          uri = raw;
        }
        originalCleanUri = raw;
      } else if (isMediaType(source.type)) {
        const parsedMediaItems = parseMediaItemsSummary(source.uri || '', source.type).items;
        const fallbackMode: SlicingMode = source.type === 'youtube' ? 'chapters' : 'timestamps';
        const savedMode = source.defaultSlicingMode;
        let nextSlicingMode: SlicingMode =
          savedMode === 'chapters' || savedMode === 'timestamps' || savedMode === 'none'
            ? savedMode
            : fallbackMode;
        if (source.type !== 'youtube' && nextSlicingMode === 'chapters') {
          nextSlicingMode = 'timestamps';
        }
        const nextMinutesPerChunk = source.defaultIntervalMinutes ?? 10;
        mediaItems = parsedMediaItems;
        slicingMode = nextSlicingMode;
        minutesPerChunk = nextMinutesPerChunk;
        baselineSourceSlicing = JSON.stringify({ mode: nextSlicingMode, interval: nextMinutesPerChunk });
        const baseMap: Record<string, string> = {};
        for (const item of parsedMediaItems) {
          baseMap[getMediaConfigKey(item, source.type)] = serializeMediaConfig(item);
        }
        baselineMediaConfigByKey = baseMap;
      } else if (source.type === 'notion') {
        const parsed = parseNotionUri(source.uri || '', source.tags || []);
        notionRecursive = parsed.isRecursive;
        uri = parsed.cleanUri;
        originalCleanUri = parsed.cleanUri;
      } else {
        uri = source.uri || '';
        originalCleanUri = (source.uri || '').trim();
      }

      let cancelled = false;
      syncStatus = null;
      syncStatusError = false;
      syncStatusLoading = true;
      fetchSourceSyncStatus(source.id)
        .then((res) => {
          if (!cancelled) {
            syncStatus = res;
            syncStatusError = false;
          }
        })
        .catch(() => {
          if (!cancelled) {
            syncStatus = null;
            syncStatusError = true;
          }
        })
        .finally(() => {
          if (!cancelled) {
            syncStatusLoading = false;
          }
        });
      return () => {
        cancelled = true;
      };
    }
  });

  function getSingleUriSyncStatus(): ItemSyncState | null {
    if (!source || syncStatusLoading || syncStatusError) {
      return null;
    }
    if (!syncStatus || !syncStatus.hasSyncedDocuments) {
      return 'new';
    }
    const trimmedUri = uri.trim();
    if (!trimmedUri) return 'new';
    if (source.type === 'local') {
      return getClientItemSyncStatus(trimmedUri, 'local', syncStatus.knownKeys);
    }
    const directMatch = getClientItemSyncStatus(trimmedUri, source.type, syncStatus.knownKeys);
    if (directMatch === 'synced') return 'synced';
    if (originalCleanUri && trimmedUri === originalCleanUri) {
      return 'synced';
    }
    return 'new';
  }

  function handleRequestClose() {
    if (isSubmitting) return;
    onClose();
  }

  const hasReprocessConfigChanges = $derived.by(() => {
    if (!source || !isMediaType(source.type) || !syncStatus?.hasSyncedDocuments) {
      return false;
    }
    const normalizedInterval = slicingMode === 'none' ? null : Math.max(1, Math.min(240, parseInt(String(minutesPerChunk), 10) || 10));
    const currentSlicing = JSON.stringify({ mode: slicingMode, interval: normalizedInterval });
    const parsedBase = baselineSourceSlicing ? JSON.parse(baselineSourceSlicing) : null;
    const normBase = parsedBase ? JSON.stringify({ mode: parsedBase.mode, interval: parsedBase.mode === 'none' ? null : parsedBase.interval }) : '';
    if (normBase && currentSlicing !== normBase) {
      return true;
    }
    for (const item of mediaItems) {
      const key = getMediaConfigKey(item, source.type);
      const baseline = baselineMediaConfigByKey[key];
      if (baseline && baseline !== serializeMediaConfig(item)) {
        return true;
      }
    }
    return false;
  });

  function getMediaSlicingOptions(): DocumentSlicingOptions {
    const mins = Math.max(1, Math.min(240, parseInt(String(minutesPerChunk), 10) || 10));
    if (slicingMode === 'chapters' && source?.type === 'youtube') {
      return { mode: 'chapters', minutesPerChunk: mins };
    }
    if (slicingMode === 'timestamps') {
      return { mode: 'timestamps', minutesPerChunk: mins };
    }
    return { mode: 'none' };
  }

  async function saveChanges(resyncAfter: boolean, syncMode: SyncMode = 'new-only') {
    if (!source || isSubmitting) return;
    const activeSession = modalSession;
    isSubmitting = true;
    errorMessage = null;
    try {
    if (isMediaType(source.type) && mediaEditorRef?.waitForPendingMetadata) {
      await mediaEditorRef.waitForPendingMetadata();
    }
    if (!isOpen || !source || activeSession !== modalSession) return;

    let finalUri = '';
    if (source.type === 'web') {
      const cleanUrls = webUrls.map((u) => u.trim()).filter(Boolean);
      if (cleanUrls.length === 0) {
        errorMessage = 'Please provide at least one valid web URL.';
        return;
      }
      finalUri = cleanUrls.length === 1 ? cleanUrls[0] : JSON.stringify(cleanUrls);
    } else if (isMediaType(source.type)) {
      const validationErr = validateMediaItems(mediaItems, source.type);
      if (validationErr) {
        errorMessage = validationErr;
        return;
      }
      finalUri = JSON.stringify(mediaItems);
    } else if (source.type === 'notion') {
      const rawUri = uri.trim();
      if (!rawUri) {
        errorMessage = 'Please provide a Notion page or database URL.';
        return;
      }
      if (!isValidNotionInput(rawUri)) {
        errorMessage = 'Please provide a valid Notion URL (e.g. notion.so/... or notion.site/...) or a 32-character Notion ID.';
        return;
      }
      finalUri = buildNotionUri(rawUri, { recursive: notionRecursive });
    } else if (source.type === 'local' && localFilePaths.length > 0) {
      const cleanPaths = localFilePaths.map((p) => p.trim()).filter(Boolean);
      finalUri = cleanPaths.length === 1 ? cleanPaths[0] : JSON.stringify(cleanPaths);
    } else {
      finalUri = uri.trim();
    }

    if (!name.trim() || !finalUri) {
      errorMessage = 'Please provide a source name and target URI / path.';
      return;
    }


      let cleanTags = Array.from(
        new Set(
          tags
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0)
        )
      );

      if (source.type === 'notion' && !notionRecursive) {
        cleanTags = cleanTags.filter((t) => t.toLowerCase() !== 'recursive');
      }

      const mediaSlicing = isMediaType(source.type) ? getMediaSlicingOptions() : undefined;
      const updated = await updateSource(source.id, {
        name: name.trim(),
        uri: finalUri,
        tags: cleanTags,
        ...(isMediaType(source.type) && mediaSlicing
          ? {
              defaultSlicingMode: mediaSlicing.mode,
              defaultIntervalMinutes:
                mediaSlicing.mode === 'none' ? null : (mediaSlicing.minutesPerChunk ?? 10),
            }
          : {}),
      });

      if (resyncAfter) {
        try {
          const res: any = await syncSource(updated.id, {
            ...(mediaSlicing ? { slicing: mediaSlicing } : {}),
            syncMode,
          });
          const modeLabel = syncMode === 'full' ? 'full re-sync' : 'incremental sync';
          if (res?.jobId) {
            sourcesStore.setSyncing(updated.id, true, res.jobId);
            toastStore.info(`Saved and queued ${modeLabel} (#${res.jobId.slice(0, 8)}).`);
          } else {
            toastStore.success(`Saved and completed ${modeLabel}.`);
          }
        } catch (syncErr: any) {
          toastStore.warn(`Saved changes, but re-sync failed: ${syncErr?.message || 'Sync error'}`);
        }
      }
      onSourceUpdated(updated);
      onClose();
    } catch (err: any) {
      errorMessage = err.message || 'Failed to update data source';
    } finally {
      isSubmitting = false;
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    await saveChanges(false);
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && isOpen) handleRequestClose(); }} />

{#if isOpen && source}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={handleRequestClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-card" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <div class="header-title">
          <h2>Edit Data Source</h2>
          <span class="type-pill {source.type}">{source.type}</span>
        </div>
        <button class="close-btn" onclick={handleRequestClose} disabled={isSubmitting} aria-label="Close modal">✕</button>
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
              knownKeys={syncStatus?.knownKeys ?? []}
              showSyncStatus={!syncStatusLoading && !syncStatusError}
            />
          </div>
        {:else if source.type === 'local'}
          {@const localStatus = getSingleUriSyncStatus()}
          <div class="form-group">
            <div class="field-label-row">
              <label for="edit-src-uri">Local File / Directory Path</label>
              {#if localFilePaths.length === 0 && localStatus}
                <SyncStatusBadge status={localStatus} />
              {/if}
            </div>
            {#if localFilePaths.length > 0}
              <ul class="local-files-status-list">
                {#each localFilePaths as filePath, fIdx}
                  {@const fileStatus = !syncStatusLoading && !syncStatusError ? getClientItemSyncStatus(filePath, 'local', syncStatus?.knownKeys ?? []) : null}
                  <li class="local-file-status-row">
                    <span class="local-file-path" title={filePath}>{filePath}</span>
                    {#if fileStatus}
                      <SyncStatusBadge status={fileStatus} />
                    {/if}
                    <button
                      type="button"
                      class="btn-inline-settings"
                      disabled={isSubmitting}
                      onclick={() => {
                        localFilePaths = localFilePaths.filter((_, i) => i !== fIdx);
                        if (localFilePaths.length === 1) {
                          uri = localFilePaths[0];
                        } else if (localFilePaths.length === 0) {
                          uri = '';
                        }
                      }}
                    >
                      ✕
                    </button>
                  </li>
                {/each}
              </ul>
              <div style="margin-top: 8px;">
                <label class="btn-browse-replace">
                  {isUploadingFile ? 'Uploading...' : '➕ Add File(s)...'}
                  <input
                    bind:this={fileInputRef}
                    type="file"
                    multiple
                    accept=".md,.markdown,.txt,.pdf,.docx,.epub"
                    onchange={handleFileSelect}
                    disabled={isSubmitting || isUploadingFile}
                    hidden
                  />
                </label>
              </div>
            {:else}
            <div class="local-path-input-group">
              <input
                id="edit-src-uri"
                type="text"
                bind:value={uri}
                required
              />
              <label class="btn-browse-replace">
                {isUploadingFile ? 'Uploading...' : '📁 Add / Replace File(s)...'}
                <input
                  bind:this={fileInputRef}
                  type="file"
                  multiple
                  accept=".md,.markdown,.txt,.pdf,.docx,.epub"
                  onchange={handleFileSelect}
                  disabled={isSubmitting || isUploadingFile}
                  hidden
                />
              </label>
            </div>
            {/if}
            <span class="field-hint">Specify an absolute directory path, custom file path, or click Replace File to upload a new document.</span>
          </div>
        {:else if source.type === 'notion'}
          {@const notionStatus = getSingleUriSyncStatus()}
          <div class="form-group">
            <div class="notion-header-row">
              <div class="label-with-status">
                <label for="edit-src-uri">Notion Page or Database URL</label>
                {#if notionStatus}
                  <SyncStatusBadge status={notionStatus} />
                {/if}
              </div>
              <div class="token-status-wrapper">
                {#if settingsStore.loading && !settingsStore.hasLoaded}
                  <span class="token-badge loading" title="Checking Notion token...">
                    ⏳ Checking...
                  </span>
                {:else if settingsStore.keys.notion?.isConfigured}
                  <span class="token-badge active" title="Notion API token configured">
                    ✓ Notion Token Active
                  </span>
                {:else}
                  <span class="token-badge missing" title="Notion token not configured in Settings">
                    ⚠️ Notion Token Missing
                    {#if onNavigate}
                      <button
                        type="button"
                        class="btn-inline-settings"
                        onclick={() => {
                          onClose();
                          onNavigate('settings');
                        }}
                      >
                        (Configure ⚙️)
                      </button>
                    {/if}
                  </span>
                {/if}
              </div>
            </div>
            <input
              id="edit-src-uri"
              type="text"
              placeholder="https://www.notion.so/workspace/Page-Title-32hex or Database URL"
              bind:value={uri}
              required
            />
            <span class="field-hint">Specify a Notion Page URL, Database URL, or 32-character Notion UUID.</span>

            <div class="notion-options-group">
              <label class="checkbox-label">
                <input type="checkbox" bind:checked={notionRecursive} />
                <span class="checkbox-text">
                  <strong>Include subpages as separate documents</strong>
                  <small>Recursively crawls child pages (up to 6 levels deep) and ingests each as a discrete document.</small>
                </span>
              </label>
            </div>
          </div>
        {:else if isMediaType(source.type)}
          <div class="form-group">
            <MediaItemListEditor
              bind:this={mediaEditorRef}
              sourceType={source.type}
              sourceKey={source.id}
              bind:items={mediaItems}
              disabled={isSubmitting}
              knownKeys={syncStatus?.knownKeys ?? []}
              showSyncStatus={!syncStatusLoading && !syncStatusError}
              {onNavigate}
              onCloseModal={onClose}
              onError={(msg) => (errorMessage = msg)}
            />
          </div>

          <div class="form-group">
            <label for="edit-media-slicing">⏱️ Default Media Transcript Slicing Strategy</label>
            <select id="edit-media-slicing" bind:value={slicingMode} disabled={isSubmitting}>
              {#if source.type === 'youtube'}
                <option value="chapters">Video Chapters (auto-fallback to Time Windows)</option>
              {/if}
              <option value="timestamps">Time Windows (fixed N-minute chunks)</option>
              <option value="none">None (Keep as single document)</option>
            </select>
            {#if slicingMode === 'timestamps' || slicingMode === 'chapters'}
              <div style="margin-top: 8px; display: flex; align-items: center; gap: 10px;">
                <label for="edit-media-interval" style="margin: 0; font-size: 12px; color: #94a3b8;">
                  Minutes per segment:
                </label>
                <input
                  id="edit-media-interval"
                  type="number"
                  min="1"
                  max="240"
                  bind:value={minutesPerChunk}
                  style="width: 90px;"
                  disabled={isSubmitting}
                />
              </div>
            {/if}
            <small class="hint-text">Applied to all items unless overridden per item above. Choose "Full Re-sync (All Items)" in Save &amp; Sync to re-slice existing documents immediately.</small>
          </div>
        {:else}
          {@const feedStatus = getSingleUriSyncStatus()}
          <div class="form-group">
            <div class="field-label-row">
              <label for="edit-src-uri">
                {source.type === 'rss'
                  ? 'RSS / Atom Feed URL'
                  : source.type === 'sitemap'
                  ? 'XML Sitemap URL'
                  : 'LLMs.txt Catalog URL'}
              </label>
              {#if feedStatus}
                <SyncStatusBadge status={feedStatus} />
              {/if}
            </div>
            <input
              id="edit-src-uri"
              type="text"
              bind:value={uri}
              required
            />
          </div>
        {/if}

        <div class="sync-status-panel" data-testid="edit-sync-status-panel">
          {#if syncStatusLoading}
            <span class="sync-summary-muted">⏳ Loading item sync status...</span>
          {:else if syncStatusError}
            <span class="sync-summary-muted">⚠️ Sync status unavailable right now.</span>
          {:else if syncStatus && syncStatus.hasSyncedDocuments}
            <div class="sync-summary-header">
              <SyncStatusBadge status="synced" />
              <span class="sync-summary-text">
                {syncStatus.syncedItems.length} synced item(s) ({syncStatus.syncedDocumentCount} document slice(s) in knowledge base)
              </span>
            </div>
            {#if !isMediaType(source.type) && source.type !== 'web' && syncStatus.syncedItems.length > 0}
              <ul class="synced-items-preview">
                {#each syncStatus.syncedItems.slice(0, 25) as item}
                  <li class="synced-preview-row">
                    <SyncStatusBadge status="synced" />
                    <span class="synced-item-label" title={item.uri}>{item.label}</span>
                  </li>
                {/each}
              </ul>
              {#if syncStatus.syncedItems.length > 25}
                <span class="sync-summary-muted">+{syncStatus.syncedItems.length - 25} more synced item(s)</span>
              {/if}
            {/if}
          {:else}
            <div class="sync-summary-header">
              <SyncStatusBadge status="new" />
              <span class="sync-summary-text">
                Not synced yet — all configured items will be ingested on first sync.
              </span>
            </div>
          {/if}
        </div>

        <div class="form-group">
          <label for="edit-src-tags">Tags</label>
          <TagInput id="edit-src-tags" bind:tags />
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick={handleRequestClose} disabled={isSubmitting}>
            Cancel
          </button>
          <SplitSyncButton
            primaryLabel={hasReprocessConfigChanges ? '♻️ Save & Full Re-sync' : '⚡ Save & Sync'}
            syncingLabel="Saving..."
            syncing={isSubmitting}
            disabled={isSubmitting || isUploadingFile}
            variant="secondary"
            ariaLabel="Modal Save and Sync"
            defaultMode={hasReprocessConfigChanges ? 'full' : 'new-only'}
            title={hasReprocessConfigChanges ? 'Slicing or extraction config changed — click to run Full Re-sync' : 'Save changes and sync new items only'}
            dropUp={true}
            onSync={(mode) => saveChanges(true, mode)}
          />
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
    max-width: 640px;
    max-height: 90vh;
    overflow-y: auto;
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

  .type-pill.notion {
    background: rgba(14, 165, 233, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(14, 165, 233, 0.3);
  }

  .type-pill.audio {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.3);
  }

  .type-pill.video {
    background: rgba(20, 184, 166, 0.15);
    color: #2dd4bf;
    border: 1px solid rgba(20, 184, 166, 0.3);
  }

  .type-pill.youtube {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
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

  input[type="text"],
  input[type="number"],
  select {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 14px;
    color: #f8fafc;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  input[type="text"]:focus,
  input[type="number"]:focus,
  select:focus {
    border-color: #6366f1;
  }

  .hint-text {
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.4;
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

  .local-path-input-group {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .local-path-input-group input {
    flex: 1;
  }

  .btn-browse-replace {
    background: #334155;
    color: #f1f5f9;
    font-size: 13px;
    font-weight: 600;
    padding: 10px 14px;
    border-radius: 8px;
    cursor: pointer;
    white-space: nowrap;
    border: 1px solid #475569;
    transition: all 0.15s ease;
  }

  .btn-browse-replace:hover {
    background: #475569;
    border-color: #6366f1;
  }

  .field-hint {
    font-size: 11px;
    color: #64748b;
  }

  .notion-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .token-status-wrapper {
    display: flex;
    align-items: center;
  }

  .token-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 9999px;
  }

  .token-badge.active {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .token-badge.loading {
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.3);
  }

  .token-badge.missing {
    background: rgba(234, 179, 8, 0.15);
    color: #fde047;
    border: 1px solid rgba(234, 179, 8, 0.3);
  }

  .btn-inline-settings {
    background: transparent;
    border: none;
    color: #38bdf8;
    cursor: pointer;
    font-size: 11px;
    padding: 0;
    text-decoration: underline;
  }

  .btn-inline-settings:hover {
    color: #7dd3fc;
  }

  .notion-options-group {
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 12px;
    margin-top: 10px;
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    margin-top: 3px;
    cursor: pointer;
  }

  .checkbox-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .checkbox-text strong {
    font-size: 13px;
    color: #f1f5f9;
  }

  .checkbox-text small {
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.4;
  }

  .field-label-row,
  .label-with-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .local-files-status-list {
    list-style: none;
    margin: 0;
    padding: 6px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    max-height: 150px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .local-file-status-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(30, 41, 59, 0.6);
    font-size: 12px;
  }

  .local-file-path {
    flex: 1;
    font-family: monospace;
    color: #cbd5e1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sync-status-panel {
    background: rgba(15, 23, 42, 0.55);
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sync-summary-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sync-summary-text {
    font-size: 12px;
    color: #cbd5e1;
  }

  .sync-summary-muted {
    font-size: 11px;
    color: #94a3b8;
  }

  .synced-items-preview {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 120px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .synced-preview-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #cbd5e1;
  }

  .synced-item-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
