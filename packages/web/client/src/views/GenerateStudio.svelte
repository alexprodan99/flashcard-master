<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchSources, fetchSourceDocuments, fetchDocuments, fetchDocumentDetails, syncSource, generateCards, fetchJobDetails } from '../lib/api';
  import type { DataSource, DiscoveredDocument, Flashcard, GenerationResult, DifficultyLevel, PersonaType, CardDepthMode } from '../lib/types';
  import GenerationConfigFields from '../components/GenerationConfigFields.svelte';
  import DocumentPreviewModal from '../components/DocumentPreviewModal.svelte';
  import { generateStore, toastStore, taskStore } from '../stores/index.js';

  interface Props {
    onNavigate?: (tab: string) => void;
  }

  let { onNavigate }: Props = $props();

  // Active sources list
  let sources = $state<DataSource[]>([]);

  // Preview Modal State
  let previewDoc = $state<DiscoveredDocument | null>(null);
  let isPreviewOpen = $state(false);

  // Computed Scope Metrics from universal generateStore
  let selectedDocCount = $derived(
    Object.keys(generateStore.selectedDocIds).filter((id) => generateStore.selectedDocIds[id]).length
  );

  let selectedTotalWords = $derived(
    Object.values(generateStore.sourceDocuments)
      .flat()
      .filter((doc) => generateStore.selectedDocIds[doc.id])
      .reduce((sum, doc) => sum + (doc.wordCount || 0), 0)
  );

  // Auto-save configuration changes to localStorage
  $effect(() => {
    generateStore.provider;
    generateStore.model;
    generateStore.apiKey;
    generateStore.persona;
    generateStore.difficulty;
    generateStore.depthMode;
    generateStore.chunkMultiplier;
    generateStore.limit;
    generateStore.targetDeck;
    generateStore.enforceGrounding;
    generateStore.save();
  });

  async function loadSources() {
    try {
      const all = await fetchSources();
      sources = all.filter((s) => s.isActive);
      
      // Check for deep-link query params (?docId=... or ?sourceId=...)
      const params = new URLSearchParams(window.location.search);
      const deepDocId = params.get('docId');
      const deepSourceId = params.get('sourceId');

      if (deepDocId) {
        try {
          const docData = await fetchDocumentDetails(deepDocId);
          if (docData.document) {
            const doc = docData.document;
            generateStore.expandedSources[doc.sourceId] = true;
            await loadDocumentsForSource(doc.sourceId);
            generateStore.selectedDocIds[doc.id] = true;
            if (!generateStore.selectedSourceIds.includes(doc.sourceId)) {
              generateStore.selectedSourceIds = [...generateStore.selectedSourceIds, doc.sourceId];
            }
          }
        } catch {
          if (generateStore.selectedSourceIds.length === 0) {
            generateStore.selectedSourceIds = sources.map((s) => s.id);
          }
        }
      } else if (deepSourceId) {
        generateStore.expandedSources[deepSourceId] = true;
        await loadDocumentsForSource(deepSourceId);
        generateStore.selectedSourceIds = [deepSourceId];
        selectAllDocsForSource(deepSourceId);
      } else {
        // Only set default if user has not made any selection yet
        if (generateStore.selectedSourceIds.length === 0 && Object.keys(generateStore.selectedDocIds).length === 0) {
          generateStore.selectedSourceIds = sources.map((s) => s.id);
        }
      }

      // If any sources are currently marked as expanded, ensure their documents are loaded and up to date
      for (const s of sources) {
        if (generateStore.expandedSources[s.id]) {
          loadDocumentsForSource(s.id);
        }
      }
    } catch (err: any) {
      generateStore.errorMessage = 'Failed to load active data sources: ' + err.message;
    }
  }

  async function loadDocumentsForSource(sourceId: string) {
    generateStore.loadingDocs[sourceId] = true;
    try {
      const data = await fetchSourceDocuments(sourceId);
      generateStore.sourceDocuments[sourceId] = data.documents;
    } catch (err: any) {
      console.error(`Failed to load docs for source ${sourceId}:`, err);
    } finally {
      generateStore.loadingDocs[sourceId] = false;
    }
  }

  async function handleRefreshSourceDocuments(sourceId: string) {
    await loadDocumentsForSource(sourceId);
    toastStore.info(`Refreshed documents (${generateStore.sourceDocuments[sourceId]?.length || 0} found).`);
  }

  async function handleToggleExpand(sourceId: string) {
    generateStore.expandedSources[sourceId] = !generateStore.expandedSources[sourceId];
    if (generateStore.expandedSources[sourceId]) {
      // Reload if not loaded or if previously recorded as empty
      if (!generateStore.sourceDocuments[sourceId] || generateStore.sourceDocuments[sourceId].length === 0) {
        await loadDocumentsForSource(sourceId);
        if (generateStore.selectedSourceIds.includes(sourceId) && generateStore.sourceDocuments[sourceId]) {
          generateStore.sourceDocuments[sourceId].forEach((doc) => {
            if (generateStore.selectedDocIds[doc.id] === undefined) {
              generateStore.selectedDocIds[doc.id] = true;
            }
          });
        }
      }
    }
  }

  async function handleQuickSyncSource(sourceId: string) {
    generateStore.syncingSources[sourceId] = true;
    try {
      const result: any = await syncSource(sourceId);
      if (result.jobId) {
        toastStore.info(`⚡ Sync task queued (#${result.jobId.slice(0, 8)}). Ingesting in background...`);
        const pollInterval = 1500;
        let attempts = 0;
        while (generateStore.syncingSources[sourceId] && attempts < 240) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          try {
            const { job } = await fetchJobDetails(result.jobId);
            if (job.status === 'completed' || job.status === 'completed_with_warnings') {
              break;
            } else if (job.status === 'failed' || job.status === 'cancelled') {
              break;
            }
          } catch {}
          attempts++;
        }
      }
      await loadDocumentsForSource(sourceId);
      selectAllDocsForSource(sourceId);
    } catch (err: any) {
      toastStore.error('Sync failed: ' + err.message);
    } finally {
      generateStore.syncingSources[sourceId] = false;
    }
  }

  function selectAllDocsForSource(sourceId: string) {
    const docs = generateStore.sourceDocuments[sourceId] || [];
    docs.forEach((doc) => {
      generateStore.selectedDocIds[doc.id] = true;
    });
  }

  function deselectAllDocsForSource(sourceId: string) {
    const docs = generateStore.sourceDocuments[sourceId] || [];
    docs.forEach((doc) => {
      generateStore.selectedDocIds[doc.id] = false;
    });
  }

  function isSourceFullyChecked(source: DataSource): boolean {
    const docs = generateStore.sourceDocuments[source.id];
    if (!docs || docs.length === 0) {
      return generateStore.selectedSourceIds.includes(source.id);
    }
    return docs.every((doc) => generateStore.selectedDocIds[doc.id]);
  }

  function isSourceIndeterminate(source: DataSource): boolean {
    const docs = generateStore.sourceDocuments[source.id];
    if (!docs || docs.length === 0) return false;
    const someChecked = docs.some((doc) => generateStore.selectedDocIds[doc.id]);
    const allChecked = docs.every((doc) => generateStore.selectedDocIds[doc.id]);
    return someChecked && !allChecked;
  }

  async function toggleSourceCheck(source: DataSource) {
    const fullyChecked = isSourceFullyChecked(source);
    if (!generateStore.sourceDocuments[source.id]) {
      await loadDocumentsForSource(source.id);
    }

    if (fullyChecked) {
      generateStore.selectedSourceIds = generateStore.selectedSourceIds.filter((id) => id !== source.id);
      deselectAllDocsForSource(source.id);
    } else {
      if (!generateStore.selectedSourceIds.includes(source.id)) {
        generateStore.selectedSourceIds = [...generateStore.selectedSourceIds, source.id];
      }
      selectAllDocsForSource(source.id);
    }
  }

  let lastCheckedDocId = $state<string | null>(null);

  // Global Scope Search across all sources & documents
  let globalSearchQuery = $state('');
  let globalSearchDebounce: ReturnType<typeof setTimeout> | null = null;
  let isGlobalSearching = $state(false);

  function normalizeSearchText(str: string | null | undefined): string {
    if (!str) return '';
    return str
      .normalize('NFKD')
      .replace(/[\u00a0\s]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  const SEARCH_STOP_WORDS = new Set(['article', 'articles', 'the', 'a', 'an', 'post', 'posts', 'doc', 'docs']);

  function matchesDocQuery(doc: DiscoveredDocument, rawQuery: string): boolean {
    const q = normalizeSearchText(rawQuery);
    if (!q) return true;
    const allTokens = q.split(' ').filter(Boolean);
    const nonStop = allTokens.filter((t) => !SEARCH_STOP_WORDS.has(t));
    const tokens = nonStop.length > 0 ? nonStop : allTokens;

    const titleNorm = normalizeSearchText(doc.title);
    const urlNorm = normalizeSearchText(doc.url);
    const textNorm = doc.textContent ? normalizeSearchText(doc.textContent.slice(0, 4000)) : '';

    return tokens.every((token) => {
      if (titleNorm.includes(token) || urlNorm.includes(token) || textNorm.includes(token)) {
        return true;
      }
      // Plural/singular tolerance (e.g. 'slices' vs 'slice', 'articles' vs 'article')
      if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
        const singular = token.slice(0, -1);
        if (titleNorm.includes(singular) || urlNorm.includes(singular) || textNorm.includes(singular)) {
          return true;
        }
      } else if (token.length > 3 && !token.endsWith('s')) {
        const plural = token + 's';
        if (titleNorm.includes(plural) || urlNorm.includes(plural) || textNorm.includes(plural)) {
          return true;
        }
      }
      return false;
    });
  }

  let totalGlobalMatches = $derived.by(() => {
    const q = globalSearchQuery.trim();
    if (!q) return 0;
    let count = 0;
    for (const s of sources) {
      const docs = generateStore.sourceDocuments[s.id] || [];
      count += docs.filter((d) => matchesDocQuery(d, q)).length;
    }
    return count;
  });

  let matchingSourcesCount = $derived.by(() => {
    const q = globalSearchQuery.trim();
    if (!q) return 0;
    let count = 0;
    for (const s of sources) {
      const docs = generateStore.sourceDocuments[s.id] || [];
      if (docs.some((d) => matchesDocQuery(d, q)) || normalizeSearchText(s.name).includes(normalizeSearchText(q))) {
        count++;
      }
    }
    return count;
  });

  async function handleGlobalSearchInput(e: Event) {
    globalSearchQuery = (e.target as HTMLInputElement).value;
    if (globalSearchDebounce) clearTimeout(globalSearchDebounce);
    const q = globalSearchQuery.trim();
    if (!q) return;

    globalSearchDebounce = setTimeout(async () => {
      isGlobalSearching = true;
      try {
        const res = await fetchDocuments(undefined, q);
        if (res.documents && res.documents.length > 0) {
          const bySource: Record<string, DiscoveredDocument[]> = {};
          res.documents.forEach((d) => {
            if (!bySource[d.sourceId]) bySource[d.sourceId] = [];
            bySource[d.sourceId].push(d);
          });
          for (const sId of Object.keys(bySource)) {
            generateStore.expandedSources[sId] = true;
            if (!generateStore.sourceDocuments[sId] || generateStore.sourceDocuments[sId].length === 0) {
              await loadDocumentsForSource(sId);
            }
          }
        }
      } catch (err) {
        console.error('Global search error:', err);
      } finally {
        isGlobalSearching = false;
      }
    }, 250);
  }

  function clearGlobalSearch() {
    globalSearchQuery = '';
    if (globalSearchDebounce) clearTimeout(globalSearchDebounce);
    isGlobalSearching = false;
  }

  let traySearching = $state<Record<string, boolean>>({});
  let traySearchDebounce: Record<string, ReturnType<typeof setTimeout>> = {};

  function handleTrayFilterInput(sourceId: string, e: Event) {
    const val = (e.target as HTMLInputElement).value;
    generateStore.sourceFilterQuery[sourceId] = val;

    if (traySearchDebounce[sourceId]) clearTimeout(traySearchDebounce[sourceId]);

    const q = val.trim();
    traySearching[sourceId] = true;
    // Query the server directly so backend SQLite search is used as live backing (parity with Data Sources dashboard)
    traySearchDebounce[sourceId] = setTimeout(async () => {
      try {
        const res = await fetchSourceDocuments(sourceId, q || undefined);
        if (res.documents) {
          if (q) {
            const existing = generateStore.sourceDocuments[sourceId] || [];
            const map = new Map(existing.map((d) => [d.id, d]));
            res.documents.forEach((d) => map.set(d.id, d));
            generateStore.sourceDocuments[sourceId] = Array.from(map.values());
          } else {
            generateStore.sourceDocuments[sourceId] = res.documents;
          }
        }
      } catch (err) {
        console.error(`Error querying documents for source ${sourceId}:`, err);
      } finally {
        traySearching[sourceId] = false;
      }
    }, 150);
  }

  function handleClearTrayFilter(sourceId: string) {
    generateStore.sourceFilterQuery[sourceId] = '';
    if (traySearchDebounce[sourceId]) clearTimeout(traySearchDebounce[sourceId]);
    traySearching[sourceId] = false;
    loadDocumentsForSource(sourceId);
  }

  function getFilteredDocs(sourceId: string): DiscoveredDocument[] {
    const docs = generateStore.sourceDocuments[sourceId] || [];
    const localQuery = (generateStore.sourceFilterQuery[sourceId] || '').trim();
    const query = localQuery || globalSearchQuery.trim();
    if (!query) return docs;

    const filtered = docs.filter((d) => matchesDocQuery(d, query));
    const qNorm = normalizeSearchText(query);
    return filtered.sort((a, b) => {
      const aTitle = normalizeSearchText(a.title);
      const bTitle = normalizeSearchText(b.title);
      const aRank = aTitle === qNorm ? 0 : aTitle.includes(qNorm) ? 1 : 2;
      const bRank = bTitle === qNorm ? 0 : bTitle.includes(qNorm) ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      return 0;
    });
  }

  function getSelectedCountForSource(sourceId: string): number {
    const docs = generateStore.sourceDocuments[sourceId] || [];
    return docs.filter((d) => generateStore.selectedDocIds[d.id]).length;
  }

  function selectFilteredDocs(sourceId: string) {
    const docs = getFilteredDocs(sourceId);
    docs.forEach((d) => {
      generateStore.selectedDocIds[d.id] = true;
    });
    if (docs.length > 0 && !generateStore.selectedSourceIds.includes(sourceId)) {
      generateStore.selectedSourceIds = [...generateStore.selectedSourceIds, sourceId];
    }
  }

  function deselectFilteredDocs(sourceId: string) {
    const docs = getFilteredDocs(sourceId);
    docs.forEach((d) => {
      generateStore.selectedDocIds[d.id] = false;
    });
    const allSourceDocs = generateStore.sourceDocuments[sourceId] || [];
    const anyChecked = allSourceDocs.some((d) => generateStore.selectedDocIds[d.id]);
    if (!anyChecked) {
      generateStore.selectedSourceIds = generateStore.selectedSourceIds.filter((id) => id !== sourceId);
    }
  }

  function handleDocRowClick(doc: DiscoveredDocument, sourceId: string, e: MouseEvent) {
    if (generateStore.isGenerating) return;
    const filtered = getFilteredDocs(sourceId);
    const targetState = !generateStore.selectedDocIds[doc.id];

    if (e.shiftKey && lastCheckedDocId && lastCheckedDocId !== doc.id) {
      const lastIdx = filtered.findIndex((d) => d.id === lastCheckedDocId);
      const currIdx = filtered.findIndex((d) => d.id === doc.id);
      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        for (let i = start; i <= end; i++) {
          generateStore.selectedDocIds[filtered[i].id] = targetState;
        }
      } else {
        generateStore.selectedDocIds[doc.id] = targetState;
      }
    } else {
      generateStore.selectedDocIds[doc.id] = targetState;
    }

    lastCheckedDocId = doc.id;

    // Sync source checkbox
    const allDocs = generateStore.sourceDocuments[sourceId] || [];
    const anyChecked = allDocs.some((d) => generateStore.selectedDocIds[d.id]);
    if (anyChecked && !generateStore.selectedSourceIds.includes(sourceId)) {
      generateStore.selectedSourceIds = [...generateStore.selectedSourceIds, sourceId];
    } else if (!anyChecked) {
      generateStore.selectedSourceIds = generateStore.selectedSourceIds.filter((id) => id !== sourceId);
    }
  }

  function toggleDocCheck(doc: DiscoveredDocument, sourceId: string) {
    generateStore.selectedDocIds[doc.id] = !generateStore.selectedDocIds[doc.id];
    const docs = generateStore.sourceDocuments[sourceId] || [];
    const anyChecked = docs.some((d) => generateStore.selectedDocIds[d.id]);
    if (anyChecked && !generateStore.selectedSourceIds.includes(sourceId)) {
      generateStore.selectedSourceIds = [...generateStore.selectedSourceIds, sourceId];
    } else if (!anyChecked) {
      generateStore.selectedSourceIds = generateStore.selectedSourceIds.filter((id) => id !== sourceId);
    }
  }

  async function toggleSelectAllGlobal() {
    const allSourcesSelected = sources.every((s) => isSourceFullyChecked(s));
    if (allSourcesSelected) {
      generateStore.selectedSourceIds = [];
      Object.keys(generateStore.selectedDocIds).forEach((k) => (generateStore.selectedDocIds[k] = false));
    } else {
      generateStore.selectedSourceIds = sources.map((s) => s.id);
      for (const s of sources) {
        if (!generateStore.sourceDocuments[s.id]) {
          await loadDocumentsForSource(s.id);
        }
        selectAllDocsForSource(s.id);
      }
    }
  }

  async function handleOpenPreview(doc: DiscoveredDocument) {
    try {
      const details = await fetchDocumentDetails(doc.id);
      previewDoc = details.document;
      isPreviewOpen = true;
    } catch (err: any) {
      alert('Failed to load document preview: ' + err.message);
    }
  }

  async function handleGenerate(e: Event) {
    e.preventDefault();
    if (generateStore.isGenerating) return;
    const targetedDocIds = Object.keys(generateStore.selectedDocIds).filter((id) => generateStore.selectedDocIds[id]);

    if (targetedDocIds.length === 0 && generateStore.selectedSourceIds.length === 0) {
      generateStore.errorMessage = 'Please select at least one document or data source to synthesize cards from.';
      return;
    }

    generateStore.startGenerating();

    try {
      const payload: any = {
        provider: generateStore.provider,
        model: generateStore.model.trim() || undefined,
        apiKey: generateStore.apiKey.trim() || undefined,
        persona: generateStore.persona,
        difficulty: generateStore.difficulty,
        depthMode: generateStore.depthMode,
        chunkMultiplier: generateStore.chunkMultiplier,
        limit: generateStore.limit,
        targetDeck: generateStore.targetDeck.trim() || undefined,
        enforceGrounding: generateStore.enforceGrounding,
      };

      if (targetedDocIds.length > 0) {
        payload.documentIds = targetedDocIds;
      } else {
        payload.sourceIds = generateStore.selectedSourceIds;
      }

      const result: any = await generateCards(payload);
      if (result.jobId) {
        generateStore.setActiveJob(result.jobId);
        toastStore.info(`⚡ Task queued (#${result.jobId.slice(0, 8)}). Synthesizing cards in background...`);
        pollJobCompletion(result.jobId);
      } else {
        generateStore.finishGenerating(result);
        toastStore.success(`🎉 Generated ${result.cardsCreated ?? 0} cards (${result.duplicatesSkipped ?? 0} duplicates skipped)`);
      }
    } catch (err: any) {
      const msg = err.message || 'Generation failed';
      generateStore.finishGenerating(null, msg);
      toastStore.error(`⚠️ Generation failed: ${msg}`);
    }
  }

  async function pollJobCompletion(jobId: string) {
    const pollInterval = 1500;
    const maxAttempts = 240;
    let attempts = 0;

    while (generateStore.isGenerating && generateStore.activeJobId === jobId && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      if (!generateStore.isGenerating || generateStore.activeJobId !== jobId) {
        break;
      }
      try {
        const { job } = await fetchJobDetails(jobId);
        if (job.status === 'completed' || job.status === 'completed_with_warnings') {
          if (generateStore.isGenerating && generateStore.activeJobId === jobId) {
            const summary = job.resultSummary || {};
            const cardsCreated = summary.cardsCreated ?? 0;
            const duplicatesSkipped = summary.duplicatesSkipped ?? 0;
            generateStore.finishGenerating({
              success: true,
              cardsCreated,
              totalDraftsGenerated: summary.totalDraftsGenerated ?? cardsCreated,
              duplicatesSkipped,
              newCards: summary.newCards || [],
            });
            if (job.status === 'completed_with_warnings') {
              toastStore.warn(`⚠️ Partial output saved: ${cardsCreated} cards generated (${duplicatesSkipped} duplicates skipped). Token limit was reached.`);
            } else {
              toastStore.success(`🎉 Generated ${cardsCreated} cards (${duplicatesSkipped} duplicates skipped)`);
            }
          }
          break;
        } else if (job.status === 'failed') {
          if (generateStore.isGenerating && generateStore.activeJobId === jobId) {
            const msg = job.errorMessage || 'Generation failed';
            generateStore.finishGenerating(null, msg);
            toastStore.error(`⚠️ Generation failed: ${msg}`);
          }
          break;
        } else if (job.status === 'cancelled') {
          if (generateStore.isGenerating && generateStore.activeJobId === jobId) {
            generateStore.finishGenerating(null, 'Generation task was cancelled');
            toastStore.warn(`⏹️ Generation task was cancelled.`);
          }
          break;
        }
      } catch {
        // Retry silently on transient poll error
      }
      attempts++;
    }
  }

  onMount(() => {
    loadSources();
    if (generateStore.isGenerating && generateStore.activeJobId) {
      pollJobCompletion(generateStore.activeJobId);
    }
  });
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h1 class="view-title">⚡ AI Card Generation Studio</h1>
      <p class="view-subtitle">Synthesize atomic, factually grounded Q&A flashcards from ingested sources & documents.</p>
    </div>
  </div>

  <div class="studio-layout">
    <div class="card form-panel">
      <form onsubmit={handleGenerate} class="studio-form">
        <!-- 1. Hierarchical Source & Document Scope Selection -->
        <div class="form-section">
          <div class="section-header">
            <span class="section-label">1. Target Scope (Sources & Documents)</span>
            <div class="header-actions">
              <span class="selection-badge">
                {#if selectedDocCount > 0}
                  🎯 {selectedDocCount} docs selected (~{selectedTotalWords.toLocaleString()} words)
                {:else}
                  📁 {generateStore.selectedSourceIds.length} / {sources.length} sources
                {/if}
              </span>
              <button type="button" class="btn btn-xs btn-secondary" onclick={toggleSelectAllGlobal} disabled={generateStore.isGenerating}>
                {generateStore.selectedSourceIds.length === sources.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>

          {#if sources.length === 0}
            <div class="no-sources-warning">
              <span>⚠️ No active data sources found. Please add or enable a data source first.</span>
            </div>
          {:else}
            <!-- Top-Level Global Search across all sources & documents -->
            <div class="scope-global-search">
              <div class="search-box-wrapper">
                <span class="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search across all sources & documents (by title, topic, URL)..."
                  value={globalSearchQuery}
                  oninput={handleGlobalSearchInput}
                  class="scope-global-input"
                  disabled={generateStore.isGenerating}
                />
                {#if isGlobalSearching}
                  <span class="spinner-inline global-spinner"></span>
                {/if}
                {#if globalSearchQuery}
                  <button
                    type="button"
                    class="search-clear-btn"
                    onclick={clearGlobalSearch}
                    title="Clear search"
                  >
                    ✕
                  </button>
                {/if}
              </div>
              {#if globalSearchQuery}
                <div class="global-search-status">
                  {#if isGlobalSearching}
                    <span class="search-status-text">Searching database...</span>
                  {:else if totalGlobalMatches > 0}
                    <span class="search-status-text highlight">
                      Found <strong>{totalGlobalMatches}</strong> matching doc{totalGlobalMatches === 1 ? '' : 's'} across <strong>{matchingSourcesCount}</strong> source{matchingSourcesCount === 1 ? '' : 's'}
                    </span>
                  {:else}
                    <span class="search-status-text muted">
                      No documents match "<em>{globalSearchQuery}</em>"
                    </span>
                  {/if}
                </div>
              {/if}
            </div>

            <div class="scope-tree-container">
              {#each sources as s (s.id)}
                {@const isSourceMatch = !globalSearchQuery || normalizeSearchText(s.name).includes(normalizeSearchText(globalSearchQuery)) || (generateStore.sourceDocuments[s.id] && generateStore.sourceDocuments[s.id].some((d) => matchesDocQuery(d, globalSearchQuery)))}
                <div class="source-node" class:expanded={generateStore.expandedSources[s.id]} class:dimmed={!!globalSearchQuery && !isSourceMatch}>
                  <div class="source-node-header">
                    <label class="checkbox-container">
                      <input
                        type="checkbox"
                        checked={isSourceFullyChecked(s)}
                        indeterminate={isSourceIndeterminate(s)}
                        onchange={() => toggleSourceCheck(s)}
                        disabled={generateStore.isGenerating}
                      />
                    </label>

                    <button
                      type="button"
                      class="accordion-toggle"
                      onclick={() => handleToggleExpand(s.id)}
                    >
                      <span class="toggle-icon">{generateStore.expandedSources[s.id] ? '▼' : '▶'}</span>
                      <span class="type-badge {s.type}">{s.type}</span>
                      <span class="source-title">{s.name}</span>
                      {#if globalSearchQuery && generateStore.sourceDocuments[s.id]}
                        {@const matchCount = generateStore.sourceDocuments[s.id].filter((d) => matchesDocQuery(d, globalSearchQuery)).length}
                        {#if matchCount > 0}
                          <span class="match-pill">🎯 {matchCount} match{matchCount === 1 ? '' : 'es'}</span>
                        {/if}
                      {/if}
                      {#if generateStore.sourceDocuments[s.id]}
                        {@const selCount = getSelectedCountForSource(s.id)}
                        {#if selCount > 0}
                          <span class="selected-pill">✓ {selCount} / {generateStore.sourceDocuments[s.id].length}</span>
                        {:else}
                          <span class="doc-count-pill">{generateStore.sourceDocuments[s.id].length} docs</span>
                        {/if}
                      {/if}
                    </button>
                  </div>

                  <!-- Expanded Document List -->
                  {#if generateStore.expandedSources[s.id]}
                    <div class="source-documents-tray">
                      {#if generateStore.loadingDocs[s.id]}
                        <div class="tray-loading">
                          <span class="spinner-inline"></span>
                          <span>Loading discovered documents...</span>
                        </div>
                      {:else if !generateStore.sourceDocuments[s.id] || generateStore.sourceDocuments[s.id].length === 0}
                        <div class="tray-empty">
                          <span>No documents discovered yet.</span>
                          <button
                            type="button"
                            class="btn btn-xs btn-primary"
                            disabled={generateStore.syncingSources[s.id] || generateStore.isGenerating}
                            onclick={() => handleQuickSyncSource(s.id)}
                          >
                            {#if generateStore.syncingSources[s.id]}
                              <span class="spinner-inline"></span> Syncing...
                            {:else}
                              ⚡ Sync Now
                            {/if}
                          </button>
                        </div>
                      {:else}
                        {@const filteredDocs = getFilteredDocs(s.id)}
                        {@const allDocs = generateStore.sourceDocuments[s.id] || []}
                        {@const selCount = getSelectedCountForSource(s.id)}

                        <div class="tray-toolbar">
                          <div class="tray-search-box">
                            <span class="search-icon">🔍</span>
                            <input
                              type="text"
                              placeholder="Filter by title, URL or text..."
                              value={generateStore.sourceFilterQuery[s.id] || ''}
                              oninput={(e) => handleTrayFilterInput(s.id, e)}
                              class="tray-filter-input"
                              disabled={generateStore.isGenerating}
                            />
                            {#if traySearching[s.id]}
                              <span class="spinner-inline tray-spinner"></span>
                            {/if}
                            {#if generateStore.sourceFilterQuery[s.id]}
                              <button
                                type="button"
                                class="tray-filter-clear"
                                onclick={() => handleClearTrayFilter(s.id)}
                                title="Clear filter"
                              >
                                ✕
                              </button>
                            {/if}
                          </div>

                          <div class="tray-actions-row">
                            <div class="tray-stat-count">
                              Showing <strong>{filteredDocs.length}</strong> of <strong>{allDocs.length}</strong> docs
                              {#if selCount > 0}
                                <span class="sel-highlight">({selCount} selected)</span>
                              {/if}
                            </div>
                            <div class="tray-bulk-buttons">
                              <button
                                type="button"
                                class="btn-tray-action"
                                onclick={() => handleRefreshSourceDocuments(s.id)}
                                disabled={generateStore.loadingDocs[s.id] || generateStore.isGenerating}
                                title="Reload latest documents from database"
                              >
                                {#if generateStore.loadingDocs[s.id]}
                                  <span class="spinner-inline"></span>
                                {:else}
                                  🔄 Refresh
                                {/if}
                              </button>
                              <button
                                type="button"
                                class="btn-tray-action"
                                onclick={() => selectFilteredDocs(s.id)}
                                disabled={generateStore.isGenerating || filteredDocs.length === 0}
                                title="Select all filtered documents (Shift+Click rows to multi-select ranges)"
                              >
                                Select All
                              </button>
                              <button
                                type="button"
                                class="btn-tray-action"
                                onclick={() => deselectFilteredDocs(s.id)}
                                disabled={generateStore.isGenerating || filteredDocs.length === 0}
                                title="Clear selection for filtered documents"
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        </div>

                        {#if filteredDocs.length === 0}
                          <div class="tray-no-match">
                            <span>No documents match "<em>{generateStore.sourceFilterQuery[s.id] || globalSearchQuery}</em>"</span>
                            <div class="no-match-actions">
                              <button
                                type="button"
                                class="btn-clear-filter"
                                onclick={() => { handleClearTrayFilter(s.id); globalSearchQuery = ''; }}
                              >
                                Reset Filter
                              </button>
                              <button
                                type="button"
                                class="btn-clear-filter"
                                onclick={() => handleRefreshSourceDocuments(s.id)}
                              >
                                🔄 Reload Docs
                              </button>
                            </div>
                          </div>
                        {:else}
                          <div class="tray-doc-list">
                            {#each filteredDocs as doc (doc.id)}
                              <!-- svelte-ignore a11y_interactive_supports_focus -->
                              <div
                                class="tray-doc-row"
                                class:selected={generateStore.selectedDocIds[doc.id]}
                                onclick={(e) => handleDocRowClick(doc, s.id, e)}
                                role="checkbox"
                                aria-checked={!!generateStore.selectedDocIds[doc.id]}
                                tabindex="0"
                                onkeydown={(e) => {
                                  if (e.key === ' ' || e.key === 'Enter') {
                                    e.preventDefault();
                                    handleDocRowClick(doc, s.id, e as any);
                                  }
                                }}
                              >
                                <div class="tray-doc-left">
                                  <input
                                    type="checkbox"
                                    class="doc-checkbox"
                                    checked={!!generateStore.selectedDocIds[doc.id]}
                                    onclick={(e) => e.stopPropagation()}
                                    onchange={() => toggleDocCheck(doc, s.id)}
                                    disabled={generateStore.isGenerating}
                                    tabindex="-1"
                                    aria-label={`Select ${doc.title}`}
                                  />
                                  <div class="tray-doc-info">
                                    <div class="tray-doc-title" title={doc.title}>
                                      {doc.title}
                                    </div>
                                    <div class="tray-doc-meta-row">
                                      <span class="meta-item word-count">
                                        📝 {(doc.wordCount || 0).toLocaleString()} words
                                      </span>
                                      {#if doc.cardCount && doc.cardCount > 0}
                                        <span class="meta-item card-count">
                                          🎴 {doc.cardCount} cards
                                        </span>
                                      {/if}
                                      {#if doc.url}
                                        <span class="meta-item doc-url" title={doc.url}>
                                          🔗 {doc.url.replace(/^https?:\/\/(www\.)?/, '')}
                                        </span>
                                      {/if}
                                    </div>
                                  </div>
                                </div>

                                <div class="tray-doc-right">
                                  <button
                                    type="button"
                                    class="btn-preview-mini"
                                    onclick={(e) => {
                                      e.stopPropagation();
                                      handleOpenPreview(doc);
                                    }}
                                    title="Preview Document Content"
                                  >
                                    👁️ Preview
                                  </button>
                                </div>
                              </div>
                            {/each}
                          </div>
                        {/if}
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- 2-5. AI Engine, Pedagogy, Depth & Deck Configuration (Story 11.1) -->
        <GenerationConfigFields
          bind:provider={generateStore.provider}
          bind:model={generateStore.model}
          bind:apiKey={generateStore.apiKey}
          bind:persona={generateStore.persona}
          bind:difficulty={generateStore.difficulty}
          bind:depthMode={generateStore.depthMode}
          bind:chunkMultiplier={generateStore.chunkMultiplier}
          bind:limit={generateStore.limit}
          bind:targetDeck={generateStore.targetDeck}
          bind:enforceGrounding={generateStore.enforceGrounding}
          onNavigate={onNavigate}
        />

        {#if generateStore.errorMessage}
          <div class="error-banner">⚠️ {generateStore.errorMessage}</div>
        {/if}

        <button
          type="submit"
          class="btn btn-primary btn-generate"
          disabled={generateStore.isGenerating || sources.length === 0}
        >
          {#if generateStore.isGenerating}
            <span class="spinner-inline"></span>
            Synthesizing Grounded Flashcards...
          {:else}
            ⚡ Start AI Generation
          {/if}
        </button>
      </form>
    </div>

    <!-- Execution Results & Card Previews -->
    <div class="results-panel">
      {#if generateStore.isGenerating}
        <div class="generating-state">
          <div class="pulse-spinner"></div>
          <h3>AI Engine Ingesting & Generating...</h3>
          <p>Chunking documents, running LLM inference, and verifying verbatim quote grounding.</p>
          {#if generateStore.activeJobId}
            <div class="active-job-actions">
              <span class="active-job-id">Job #{generateStore.activeJobId.slice(0, 8)}</span>
              <button
                type="button"
                class="btn-cancel-job"
                onclick={() => taskStore.cancelJob(generateStore.activeJobId!)}
              >
                ⏹️ Cancel
              </button>
              <button
                type="button"
                class="btn-view-tasks"
                onclick={() => taskStore.openDrawer('active')}
              >
                📋 View Task Logs
              </button>
            </div>
          {/if}
        </div>
      {:else if generateStore.generationResult}
        <div class="result-card">
          <div class="result-header">
            <h3>🎉 Generation Completed</h3>
            <div class="result-metrics">
              <span class="metric-pill success">+{generateStore.generationResult.cardsCreated} Created</span>
              <span class="metric-pill warning">-{generateStore.generationResult.duplicatesSkipped} Duplicates Skipped</span>
            </div>
          </div>

          {#if generateStore.generationResult.newCards && generateStore.generationResult.newCards.length > 0}
            <div class="cards-preview-list">
              <h4>Newly Generated Flashcards:</h4>
              {#each generateStore.generationResult.newCards as card}
                <div class="preview-card-item">
                  <div class="preview-card-top">
                    <span class="badge difficulty {card.difficulty}">{card.difficulty}</span>
                    <span class="badge deck">{card.targetDeck}</span>
                  </div>
                  <div class="preview-question"><strong>Q:</strong> {card.question}</div>
                  <div class="preview-answer"><strong>A:</strong> {card.answer}</div>
                  {#if card.sourceQuote}
                    <div class="preview-quote">
                      <span class="quote-icon">“</span>
                      <span>{card.sourceQuote}</span>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <div class="no-cards-notice">
              <p>No new unique cards were created. Any generated drafts were either duplicates of existing cards or ungrounded.</p>
            </div>
          {/if}
        </div>
      {:else}
        <div class="idle-results-placeholder">
          <div class="placeholder-icon">⚡</div>
          <h3>AI Generation Studio Ready</h3>
          <p>Select your target sources or specific documents on the left, then click <strong>Start AI Generation</strong>.</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Reusable Document Preview Modal in Generate Studio -->
<DocumentPreviewModal
  isOpen={isPreviewOpen}
  document={previewDoc}
  onClose={() => (isPreviewOpen = false)}
/>

<style>
  .view-container {
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 1300px;
    margin: 0 auto;
    width: 100%;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .view-title {
    font-size: 26px;
    font-weight: 700;
    color: #f8fafc;
    margin: 0 0 6px 0;
    letter-spacing: -0.02em;
  }

  .view-subtitle {
    font-size: 14px;
    color: #94a3b8;
    margin: 0;
  }

  .studio-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: flex-start;
  }

  @media (max-width: 1024px) {
    .studio-layout {
      grid-template-columns: 1fr;
    }
  }

  .form-panel {
    padding: 24px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 12px;
  }

  .studio-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-bottom: 16px;
    border-bottom: 1px solid #1e293b;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-label {
    font-size: 13px;
    font-weight: 700;
    color: #f8fafc;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .selection-badge {
    font-size: 11px;
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.3);
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 600;
  }

  /* Global Scope Search */
  .scope-global-search {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .search-box-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
  }

  .scope-global-input {
    width: 100%;
    background: #0b0f19;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 8px 36px 8px 34px;
    border-radius: 6px;
    font-size: 12.5px;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .scope-global-input:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
  }

  .global-spinner {
    position: absolute;
    right: 32px;
  }

  .search-clear-btn {
    position: absolute;
    right: 8px;
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 13px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .search-clear-btn:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.1);
  }

  .global-search-status {
    font-size: 11.5px;
    padding-left: 2px;
  }

  .search-status-text.highlight {
    color: #818cf8;
  }

  .search-status-text.muted {
    color: #94a3b8;
  }

  .match-pill {
    font-size: 10.5px;
    background: rgba(16, 185, 129, 0.18);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.35);
    padding: 1px 7px;
    border-radius: 9999px;
    font-weight: 600;
  }

  .source-node.dimmed {
    opacity: 0.45;
  }

  /* Scope Tree */
  .scope-tree-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 560px;
    overflow-y: auto;
    padding-right: 4px;
    scrollbar-width: thin;
    scrollbar-color: #475569 #0f172a;
  }

  .source-node {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .source-node:hover {
    border-color: #475569;
  }

  .source-node-header {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    gap: 10px;
  }

  .checkbox-container {
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .accordion-toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    color: #f8fafc;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }

  .toggle-icon {
    font-size: 10px;
    color: #94a3b8;
    width: 14px;
  }

  .source-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .doc-count-pill {
    font-size: 11px;
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
  }

  .selected-pill {
    font-size: 11px;
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
    border: 1px solid rgba(99, 102, 241, 0.4);
    padding: 2px 8px;
    border-radius: 9999px;
    font-weight: 600;
  }

  /* Tray */
  .source-documents-tray {
    border-top: 1px solid #334155;
    background: #090d16;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tray-loading, .tray-empty {
    padding: 12px;
    text-align: center;
    font-size: 12px;
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .tray-toolbar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 8px 10px;
    border-radius: 6px;
  }

  .tray-search-box {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    font-size: 12px;
    pointer-events: none;
    opacity: 0.6;
  }

  .tray-filter-input {
    width: 100%;
    background: #1e293b;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 6px 30px;
    border-radius: 6px;
    font-size: 12px;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .tray-filter-input:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
  }

  .tray-filter-clear {
    position: absolute;
    right: 8px;
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .tray-filter-clear:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.1);
  }

  .tray-spinner {
    position: absolute;
    right: 28px;
    width: 12px;
    height: 12px;
  }

  .tray-actions-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #94a3b8;
  }

  .tray-stat-count {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sel-highlight {
    color: #818cf8;
    font-weight: 600;
  }

  .tray-bulk-buttons {
    display: flex;
    gap: 6px;
  }

  .btn-tray-action {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #334155;
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-tray-action:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.15);
    border-color: #6366f1;
    color: #f8fafc;
  }

  .btn-tray-action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tray-no-match {
    padding: 16px;
    text-align: center;
    color: #94a3b8;
    font-size: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .no-match-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .btn-clear-filter {
    background: transparent;
    border: 1px dashed #475569;
    color: #94a3b8;
    padding: 4px 10px;
    font-size: 11px;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-clear-filter:hover {
    color: #f8fafc;
    border-color: #94a3b8;
  }

  .tray-doc-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 380px;
    overflow-y: auto;
    padding-right: 4px;
    scrollbar-width: thin;
    scrollbar-color: #334155 #0b0f19;
  }

  .tray-doc-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    background: rgba(30, 41, 59, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-left: 3px solid transparent;
    border-radius: 6px;
    gap: 12px;
    cursor: pointer;
    user-select: none;
    transition: all 0.15s ease;
  }

  .tray-doc-row:hover {
    background: rgba(51, 65, 85, 0.55);
    border-color: rgba(255, 255, 255, 0.12);
    transform: translateX(2px);
  }

  .tray-doc-row.selected {
    background: rgba(99, 102, 241, 0.12);
    border-color: rgba(99, 102, 241, 0.35);
    border-left: 3px solid #6366f1;
  }

  .tray-doc-row.selected:hover {
    background: rgba(99, 102, 241, 0.18);
    border-color: rgba(99, 102, 241, 0.5);
  }

  .tray-doc-left {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }

  .doc-checkbox {
    margin-top: 3px;
    cursor: pointer;
    accent-color: #6366f1;
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  .tray-doc-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }

  .tray-doc-title {
    font-size: 12.5px;
    font-weight: 500;
    color: #e2e8f0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }

  .tray-doc-meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 10.5px;
    color: #94a3b8;
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .meta-item.word-count {
    color: #a5b4fc;
    background: rgba(99, 102, 241, 0.08);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .meta-item.card-count {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.08);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .meta-item.doc-url {
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #64748b;
  }

  .tray-doc-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .btn-preview-mini {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #334155;
    color: #cbd5e1;
    font-size: 10.5px;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .btn-preview-mini:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #f8fafc;
    border-color: #64748b;
  }

  /* Badges */
  .type-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .type-badge.rss { background: rgba(249, 115, 22, 0.15); color: #fb923c; }
  .type-badge.web { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
  .type-badge.local { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
  .type-badge.sitemap { background: rgba(16, 185, 129, 0.15); color: #34d399; }
  .type-badge.llms-txt { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
  .type-badge.notion { background: rgba(14, 165, 233, 0.15); color: #38bdf8; }

  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .btn-xs {
    padding: 3px 8px;
    font-size: 11px;
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

  .btn-generate {
    padding: 12px 20px;
    font-size: 15px;
    font-weight: 700;
    width: 100%;
    margin-top: 10px;
  }

  .btn:disabled,
  .btn[disabled],
  .btn-generate:disabled {
    opacity: 0.5 !important;
    cursor: not-allowed !important;
    pointer-events: none !important;
  }

  .spinner-inline {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 10px;
    border-radius: 6px;
    font-size: 12px;
  }

  .no-sources-warning {
    padding: 16px;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 6px;
    font-size: 13px;
    color: #fbbf24;
    text-align: center;
  }

  /* Results Panel */
  .results-panel {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 24px;
    min-height: 480px;
  }

  .generating-state, .idle-results-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 20px;
    color: #94a3b8;
  }

  .pulse-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid rgba(99, 102, 241, 0.2);
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 1s cubic-bezier(0.68, -0.55, 0.27, 1.55) infinite;
    margin-bottom: 16px;
  }

  .active-job-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 18px;
    background: #1e293b;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid #334155;
  }

  .active-job-id {
    font-size: 12px;
    font-family: monospace;
    color: #818cf8;
    font-weight: 600;
  }

  .btn-cancel-job {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #fca5a5;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .btn-cancel-job:hover {
    background: rgba(239, 68, 68, 0.25);
    border-color: #ef4444;
  }

  .btn-view-tasks {
    background: #334155;
    border: 1px solid #475569;
    color: #e2e8f0;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .btn-view-tasks:hover {
    background: #475569;
    color: #ffffff;
  }

  .placeholder-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .result-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 12px;
  }

  .result-header h3 {
    margin: 0;
    font-size: 18px;
    color: #f8fafc;
  }

  .result-metrics {
    display: flex;
    gap: 8px;
  }

  .metric-pill {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }

  .metric-pill.success { background: rgba(16, 185, 129, 0.15); color: #34d399; }
  .metric-pill.warning { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }

  .cards-preview-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 520px;
    overflow-y: auto;
  }

  .cards-preview-list h4 {
    margin: 0;
    font-size: 14px;
    color: #cbd5e1;
  }

  .preview-card-item {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .preview-card-top {
    display: flex;
    gap: 6px;
  }

  .badge.difficulty {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .badge.difficulty.beginner { background: rgba(16, 185, 129, 0.15); color: #34d399; }
  .badge.difficulty.intermediate { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
  .badge.difficulty.expert { background: rgba(168, 85, 247, 0.15); color: #c084fc; }

  .badge.deck {
    font-size: 11px;
    color: #cbd5e1;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .preview-question {
    font-size: 14px;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.4;
  }

  .preview-answer {
    font-size: 13px;
    color: #cbd5e1;
    line-height: 1.4;
  }

  .preview-quote {
    display: flex;
    gap: 6px;
    font-size: 12px;
    color: #94a3b8;
    background: rgba(0, 0, 0, 0.25);
    padding: 6px 10px;
    border-left: 3px solid #6366f1;
    border-radius: 0 4px 4px 0;
    font-style: italic;
  }

  .quote-icon {
    font-weight: 700;
    color: #6366f1;
  }

  .no-cards-notice {
    padding: 24px;
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
  }
</style>