<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchCardsPaginated, fetchDecks, deleteCardsBulk, cloneDeck, splitDeck, moveCardsToDeck } from '../lib/api';
  import type { Flashcard, DifficultyLevel } from '../lib/types';
  import CardEditorDrawer from '../components/CardEditorDrawer.svelte';
  import { explorerStore, toastStore } from '../stores/index.js';

  let cards = $derived(explorerStore.cards);
  let total = $derived(explorerStore.total);
  let loading = $derived(explorerStore.loading);
  let loadingMore = $derived(explorerStore.loadingMore);
  let hasMore = $derived(explorerStore.hasMore);
  let error = $derived(explorerStore.error);

  let editingCard = $state<Flashcard | null>(null);
  let isDrawerOpen = $state(false);
  let availableDecks = $state<string[]>([]);
  let sentinelEl: HTMLDivElement | null = $state(null);
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Deck Operations Modals State
  let showCloneModal = $state(false);
  let cloneSourceDeck = $state('');
  let cloneTargetDeck = $state('');
  let isCloning = $state(false);
  let cloneError = $state<string | null>(null);

  let showSplitModal = $state(false);
  let splitSourceDeck = $state('');
  let splitBatchSize = $state(25);
  let splitCustomPrefix = $state('');
  let isSplitting = $state(false);
  let splitError = $state<string | null>(null);

  let showMoveModal = $state(false);
  let moveTargetDeckMode = $state<'existing' | 'new'>('existing');
  let moveSelectedExistingDeck = $state('');
  let moveCustomNewDeck = $state('');
  let isMoving = $state(false);
  let moveError = $state<string | null>(null);
  let expandedQuoteCardIds = $state<Record<string, boolean>>({});

  let allLoadedSelected = $derived(
    cards.length > 0 && cards.every((c) => explorerStore.selectedIds.includes(c.id))
  );

  function openCloneModal(deck?: string) {
    const initialSource = deck || (explorerStore.selectedDeck !== 'all' ? explorerStore.selectedDeck : (availableDecks[0] || 'Default'));
    cloneSourceDeck = initialSource;
    cloneTargetDeck = initialSource ? `${initialSource} (Copy)` : '';
    cloneError = null;
    showCloneModal = true;
  }

  async function handleCloneDeck() {
    if (!cloneSourceDeck.trim()) {
      cloneError = 'Source deck is required.';
      return;
    }
    if (!cloneTargetDeck.trim()) {
      cloneError = 'Target deck name is required.';
      return;
    }
    if (cloneSourceDeck.trim().toLowerCase() === cloneTargetDeck.trim().toLowerCase()) {
      cloneError = 'Target deck name must be different from source deck.';
      return;
    }
    isCloning = true;
    cloneError = null;
    try {
      const res = await cloneDeck(cloneSourceDeck.trim(), cloneTargetDeck.trim());
      toastStore.success(`Successfully cloned "${res.sourceDeck}" to "${res.targetDeck}" (${res.clonedCount} cards).`);
      showCloneModal = false;
      await loadDecks();
    } catch (err: any) {
      cloneError = err.message || 'Failed to clone deck.';
    } finally {
      isCloning = false;
    }
  }

  function openSplitModal(deck?: string) {
    const initialSource = deck || (explorerStore.selectedDeck !== 'all' ? explorerStore.selectedDeck : (availableDecks[0] || 'Default'));
    splitSourceDeck = initialSource;
    splitBatchSize = 25;
    splitCustomPrefix = '';
    splitError = null;
    showSplitModal = true;
  }

  async function handleSplitDeck() {
    if (!splitSourceDeck.trim()) {
      splitError = 'Source deck is required.';
      return;
    }
    if (!splitBatchSize || splitBatchSize < 2) {
      splitError = 'Batch size must be at least 2.';
      return;
    }
    isSplitting = true;
    splitError = null;
    try {
      const res = await splitDeck(splitSourceDeck.trim(), splitBatchSize, splitCustomPrefix.trim() || undefined);
      toastStore.success(`Successfully split "${splitSourceDeck}" into ${res.subDecks.length} sub-decks (${res.cardsMoved} cards moved).`);
      showSplitModal = false;
      await loadDecks();
      await loadInitialCards();
    } catch (err: any) {
      splitError = err.message || 'Failed to split deck.';
    } finally {
      isSplitting = false;
    }
  }

  function openMoveModal() {
    moveTargetDeckMode = 'existing';
    moveSelectedExistingDeck = availableDecks[0] || 'Default';
    moveCustomNewDeck = '';
    moveError = null;
    showMoveModal = true;
  }

  async function handleMoveCards() {
    const target = moveTargetDeckMode === 'existing' ? moveSelectedExistingDeck.trim() : moveCustomNewDeck.trim();
    if (!target) {
      moveError = 'Target deck name is required.';
      return;
    }
    if (explorerStore.selectedIds.length === 0) {
      moveError = 'No cards selected.';
      return;
    }
    isMoving = true;
    moveError = null;
    try {
      const res = await moveCardsToDeck([...explorerStore.selectedIds], target);
      toastStore.success(`Successfully moved ${res.movedCount} card(s) to "${res.targetDeck}".`);
      explorerStore.clearSelection();
      showMoveModal = false;
      await loadDecks();
      await loadInitialCards();
    } catch (err: any) {
      moveError = err.message || 'Failed to move cards.';
    } finally {
      isMoving = false;
    }
  }

  function toggleSelectCard(id: string) {
    if (explorerStore.isBulkDeleting) return;
    explorerStore.toggleSelect(id);
  }

  function toggleSelectAllLoaded() {
    if (explorerStore.isBulkDeleting) return;
    if (allLoadedSelected) {
      explorerStore.deselectAll(cards.map((c) => c.id));
    } else {
      explorerStore.selectAll(cards.map((c) => c.id));
    }
  }

  function clearSelection() {
    if (explorerStore.isBulkDeleting) return;
    explorerStore.clearSelection();
  }

  async function handleBulkDelete() {
    if (explorerStore.selectedIds.length === 0 || explorerStore.isBulkDeleting) return;
    explorerStore.isBulkDeleting = true;
    try {
      const idsToDelete = [...explorerStore.selectedIds];
      const res = await deleteCardsBulk(idsToDelete);
      explorerStore.removeCardsBulk(idsToDelete);
      toastStore.success(`Successfully deleted ${res.deletedCount} flashcard${res.deletedCount === 1 ? '' : 's'}.`);
      explorerStore.clearSelection();
      explorerStore.showBulkDeleteConfirm = false;
      await loadDecks();
    } catch (err: any) {
      toastStore.error(`Failed to delete cards: ${err.message}`);
    } finally {
      explorerStore.isBulkDeleting = false;
    }
  }

  async function loadDecks() {
    try {
      availableDecks = await fetchDecks();
    } catch (err: any) {
      console.error('Failed to load decks:', err);
    }
  }

  async function loadInitialCards(isUserRefresh = false) {
    explorerStore.loading = true;
    explorerStore.error = null;
    try {
      const result = await fetchCardsPaginated({
        deck: explorerStore.selectedDeck,
        difficulty: explorerStore.selectedDifficulty,
        q: explorerStore.searchQuery.trim() || undefined,
        limit: explorerStore.limit,
      });
      explorerStore.setInitialCards(result.cards, result.total, result.nextCursor ?? null, result.hasMore, explorerStore.limit);
      if (isUserRefresh) {
        toastStore.info('⚡ Flashcards refreshed.');
        await loadDecks();
      }
    } catch (err: any) {
      explorerStore.error = err.message || 'Failed to load cards';
      if (isUserRefresh) {
        toastStore.error(`Failed to refresh flashcards: ${err.message}`);
      }
    } finally {
      explorerStore.loading = false;
    }
  }

  async function loadNextPage() {
    if (!explorerStore.hasMore || explorerStore.loading || explorerStore.loadingMore || !explorerStore.nextCursor) return;
    explorerStore.loadingMore = true;
    try {
      const result = await fetchCardsPaginated({
        deck: explorerStore.selectedDeck,
        difficulty: explorerStore.selectedDifficulty,
        q: explorerStore.searchQuery.trim() || undefined,
        limit: explorerStore.limit,
        cursor: explorerStore.nextCursor,
      });
      explorerStore.appendCards(result.cards, result.total, result.nextCursor ?? null, result.hasMore);
    } catch (err: any) {
      toastStore.error(`Failed to load more cards: ${err.message}`);
    } finally {
      explorerStore.loadingMore = false;
    }
  }

  function handleFilterChange(type: 'deck' | 'difficulty', value: string) {
    if (type === 'deck') {
      explorerStore.selectedDeck = value;
    } else {
      explorerStore.selectedDifficulty = value;
    }
    loadInitialCards();
  }

  function handleSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    explorerStore.searchQuery = target.value;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      loadInitialCards();
    }, 250);
  }

  function handleClearSearch() {
    explorerStore.searchQuery = '';
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    loadInitialCards();
  }

  async function handleRefresh() {
    if (explorerStore.loading || explorerStore.isBulkDeleting) return;
    await loadInitialCards(true);
  }

  function toggleReveal(id: string) {
    explorerStore.toggleReveal(id);
  }

  function toggleQuoteExpand(cardId: string) {
    expandedQuoteCardIds[cardId] = !expandedQuoteCardIds[cardId];
  }

  function openEdit(card: Flashcard) {
    editingCard = card;
    isDrawerOpen = true;
  }

  function handleCardUpdated(updated: Flashcard) {
    explorerStore.updateCard(updated);
    toastStore.success('Flashcard updated successfully.');
    loadDecks();
  }

  function handleCardDeleted(id: string) {
    explorerStore.removeCard(id);
    toastStore.info('Flashcard deleted.');
    loadDecks();
  }

  // IntersectionObserver for infinite scrolling
  $effect(() => {
    if (!sentinelEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && explorerStore.hasMore && !explorerStore.loading && !explorerStore.loadingMore) {
          loadNextPage();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  });

  onMount(() => {
    loadDecks();
    loadInitialCards();
  });
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h1 class="view-title">🗂️ Question Explorer</h1>
      <p class="view-subtitle">Search, curate, and review atomic flashcards with factual quote grounding.</p>
    </div>
    <span class="count-badge">{total} Cards Found</span>
  </div>

  <!-- Bulk Selection Action Bar -->
  {#if explorerStore.selectedIds.length > 0}
    <div class="bulk-action-bar">
      <div class="bulk-info">
        <span class="selection-pill">✓ {explorerStore.selectedIds.length} Selected</span>
        <button type="button" class="btn-bulk-toggle" onclick={toggleSelectAllLoaded}>
          {allLoadedSelected ? 'Deselect Loaded' : `Select Loaded (${cards.length})`}
        </button>
        <button type="button" class="btn-bulk-clear" onclick={clearSelection}>Clear</button>
      </div>
      <div class="bulk-actions">
        <button
          type="button"
          class="btn-bulk-move"
          onclick={openMoveModal}
          disabled={explorerStore.isBulkDeleting}
        >
          📦 Move to Deck...
        </button>
        <button
          type="button"
          class="btn-bulk-delete"
          onclick={() => (explorerStore.showBulkDeleteConfirm = true)}
          disabled={explorerStore.isBulkDeleting}
        >
          🗑️ Delete Selected ({explorerStore.selectedIds.length})
        </button>
      </div>
    </div>
  {/if}

  <!-- Filter & Search Toolbar -->
  <div class="toolbar-card">
    <div class="toolbar-top-row">
      <div class="search-input-wrapper">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search questions, answers, tags, keywords, or source quotes..."
          value={explorerStore.searchQuery}
          oninput={handleSearchInput}
        />
        {#if explorerStore.searchQuery}
          <button class="clear-btn" onclick={handleClearSearch}>✕</button>
        {/if}
      </div>

      <div class="toolbar-actions-group">
        <button
          type="button"
          class="btn-deck-op"
          onclick={() => openCloneModal()}
          title="Clone an entire deck under a new name"
        >
          <span>📋 Clone Deck</span>
        </button>
        <button
          type="button"
          class="btn-deck-op"
          onclick={() => openSplitModal()}
          title="Split a deck into numbered batch sub-decks"
        >
          <span>✂️ Split Deck</span>
        </button>
        <button
          type="button"
          class="btn-refresh"
          onclick={handleRefresh}
          disabled={loading}
          title="Refresh flashcard catalog"
          aria-label="Refresh flashcard catalog"
        >
          <span class="refresh-icon" class:spinning={loading}>🔄</span>
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>
    </div>

    <!-- Deck filter chips -->
    <div class="filter-row">
      <span class="filter-label">Decks:</span>
      <div class="chips-container">
        <button
          type="button"
          class="chip"
          class:active={explorerStore.selectedDeck === 'all'}
          onclick={() => handleFilterChange('deck', 'all')}
        >
          All Decks {explorerStore.selectedDeck === 'all' ? `(${total})` : ''}
        </button>
        {#each availableDecks as deck}
          <button
            type="button"
            class="chip"
            class:active={explorerStore.selectedDeck === deck}
            onclick={() => handleFilterChange('deck', deck)}
          >
            {deck} {explorerStore.selectedDeck === deck ? `(${total})` : ''}
          </button>
        {/each}
      </div>
    </div>

    <!-- Difficulty filter chips -->
    <div class="filter-row">
      <span class="filter-label">Difficulty:</span>
      <div class="chips-container">
        <button
          type="button"
          class="chip"
          class:active={explorerStore.selectedDifficulty === 'all'}
          onclick={() => handleFilterChange('difficulty', 'all')}
        >
          All
        </button>
        <button
          type="button"
          class="chip beginner"
          class:active={explorerStore.selectedDifficulty === 'beginner'}
          onclick={() => handleFilterChange('difficulty', 'beginner')}
        >
          Beginner
        </button>
        <button
          type="button"
          class="chip intermediate"
          class:active={explorerStore.selectedDifficulty === 'intermediate'}
          onclick={() => handleFilterChange('difficulty', 'intermediate')}
        >
          Intermediate
        </button>
        <button
          type="button"
          class="chip expert"
          class:active={explorerStore.selectedDifficulty === 'expert'}
          onclick={() => handleFilterChange('difficulty', 'expert')}
        >
          Expert
        </button>
        <button
          type="button"
          class="chip mixed"
          class:active={explorerStore.selectedDifficulty === 'mixed'}
          onclick={() => handleFilterChange('difficulty', 'mixed')}
        >
          🌈 Mixed
        </button>
      </div>
    </div>
  </div>

  <!-- Cards Grid -->
  {#if loading && cards.length === 0}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading flashcards from SQLite database...</p>
    </div>
  {:else if error}
    <div class="error-banner">
      <span>⚠️ {error}</span>
      <button onclick={() => loadInitialCards()} class="btn btn-sm">Retry</button>
    </div>
  {:else if cards.length === 0}
    <div class="empty-state">
      <div class="empty-icon">🗂️</div>
      <h3>No Flashcards Found</h3>
      <p>No cards match your current search or filter criteria. Try clearing filters or synthesizing cards in Generate Studio.</p>
    </div>
  {:else}
    <div class="cards-grid">
      {#each cards as card (card.id)}
        <div class="card-item" class:selected={explorerStore.selectedIds.includes(card.id)}>
          <div class="card-top-bar">
            <label class="card-checkbox-label" title="Select card for bulk actions">
              <input
                type="checkbox"
                checked={explorerStore.selectedIds.includes(card.id)}
                onchange={() => toggleSelectCard(card.id)}
                class="card-checkbox"
              />
            </label>
            <div class="card-badges">
              <span class="difficulty-badge {card.difficulty}">{card.difficulty}</span>
              <span class="deck-tag">📦 {card.targetDeck || 'Default'}</span>
              {#if card.sourceLocator}
                <span class="locator-badge" title="Source Locator">📍 {card.sourceLocator}</span>
              {/if}
            </div>
          </div>

          <div class="card-question">
            <span class="q-label">Q</span>
            <p>{card.question}</p>
          </div>

          <div class="card-answer-section">
            {#if explorerStore.revealedAnswers[card.id]}
              <div class="answer-revealed">
                <span class="a-label">A</span>
                <p>{card.answer}</p>
              </div>
              <button
                type="button"
                class="btn-toggle-answer hide"
                onclick={() => toggleReveal(card.id)}
              >
                Hide Answer
              </button>
            {:else}
              <button
                type="button"
                class="btn-toggle-answer reveal"
                onclick={() => toggleReveal(card.id)}
              >
                👁️ Reveal Answer
              </button>
            {/if}
          </div>

          {#if card.sourceQuote}
            <div class="grounding-quote">
              <div class="quote-header">
                <span class="quote-tag">🛡️ Verified Source Quote</span>
                {#if card.documentTitle || card.sourceOriginUrl}
                  <div class="quote-ref">
                    {#if card.sourceOriginUrl}
                      <a href={card.sourceOriginUrl} target="_blank" rel="noopener noreferrer" class="ref-link">
                        📖 {card.documentTitle || 'Source Link'} ↗
                      </a>
                    {:else}
                      <span class="ref-text">📖 {card.documentTitle}</span>
                    {/if}
                  </div>
                {/if}
              </div>
              <p
                class="quote-text"
                class:clamped={card.sourceQuote.length > 180 && !expandedQuoteCardIds[card.id]}
              >
                "{card.sourceQuote}"
              </p>
              {#if card.sourceQuote.length > 180}
                <button
                  type="button"
                  class="btn-toggle-quote"
                  onclick={() => toggleQuoteExpand(card.id)}
                >
                  {expandedQuoteCardIds[card.id] ? '▲ Show less' : '▼ Show more'}
                </button>
              {/if}
            </div>
          {/if}

          <div class="card-footer">
            <div class="meta-pills">
              {#if card.tags && card.tags.length > 0}
                <div class="tags-list">
                  {#each card.tags as tag}
                    <span class="tag-pill">#{tag}</span>
                  {/each}
                </div>
              {/if}
              {#if card.keywords && card.keywords.length > 0}
                <div class="keywords-list">
                  {#each card.keywords as keyword}
                    <span class="keyword-pill">🏷️ {keyword}</span>
                  {/each}
                </div>
              {/if}
            </div>
            <button
              type="button"
              class="btn-edit"
              onclick={() => openEdit(card)}
              title="Edit Card"
            >
              ✏️ Edit
            </button>
          </div>
        </div>
      {/each}
    </div>

    <!-- Infinite Scroll Sentinel & Footer Status -->
    {#if hasMore}
      <div bind:this={sentinelEl} class="infinite-scroll-sentinel">
        {#if loadingMore}
          <div class="scroll-spinner-row">
            <span class="spinner-inline"></span>
            <span>Loading more flashcards...</span>
          </div>
        {/if}
      </div>
    {:else if cards.length > 0}
      <div class="end-of-collection-banner">
        <span>🎉 You've reached the end of the collection ({total} flashcard{total === 1 ? '' : 's'})</span>
      </div>
    {/if}
  {/if}
</div>

<CardEditorDrawer
  isOpen={isDrawerOpen}
  card={editingCard}
  onClose={() => {
    isDrawerOpen = false;
    editingCard = null;
  }}
  onCardUpdated={handleCardUpdated}
  onCardDeleted={handleCardDeleted}
/>

{#if explorerStore.showBulkDeleteConfirm}
  <div class="modal-backdrop" role="presentation" onclick={() => (explorerStore.showBulkDeleteConfirm = false)}>
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') explorerStore.showBulkDeleteConfirm = false; }}
    >
      <div class="modal-header">
        <h2>⚠️ Confirm Bulk Deletion</h2>
        <button type="button" class="btn-close" onclick={() => (explorerStore.showBulkDeleteConfirm = false)}>✕</button>
      </div>
      <div class="modal-body">
        <p>Are you sure you want to permanently delete <strong>{explorerStore.selectedIds.length}</strong> flashcard{explorerStore.selectedIds.length === 1 ? '' : 's'}?</p>
        <p class="modal-subtext">This action will remove these cards from your SQLite database and cannot be undone.</p>
      </div>
      <div class="modal-actions">
        <button
          type="button"
          class="btn-modal-cancel"
          onclick={() => (explorerStore.showBulkDeleteConfirm = false)}
          disabled={explorerStore.isBulkDeleting}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn-modal-delete"
          onclick={handleBulkDelete}
          disabled={explorerStore.isBulkDeleting}
        >
          {explorerStore.isBulkDeleting ? 'Deleting...' : `Confirm Delete (${explorerStore.selectedIds.length})`}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Clone Deck Modal -->
{#if showCloneModal}
  <div class="modal-backdrop" role="presentation" onclick={() => (showCloneModal = false)}>
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') showCloneModal = false; }}
    >
      <div class="modal-header">
        <h2>📋 Clone Deck</h2>
        <button type="button" class="btn-close" onclick={() => (showCloneModal = false)}>✕</button>
      </div>
      <div class="modal-body">
        <p class="modal-intro">Duplicate all flashcards from an existing deck into a brand new deck with fresh IDs.</p>

        {#if cloneError}
          <div class="modal-error-box">
            <span>⚠️ {cloneError}</span>
          </div>
        {/if}

        <div class="form-group">
          <label for="clone-source-deck">Source Deck</label>
          <select id="clone-source-deck" class="form-select" bind:value={cloneSourceDeck}>
            {#each availableDecks as deck}
              <option value={deck}>{deck}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label for="clone-target-deck">New Deck Name</label>
          <input
            id="clone-target-deck"
            type="text"
            class="form-input"
            placeholder="e.g. Biology - Copy"
            bind:value={cloneTargetDeck}
          />
        </div>
      </div>
      <div class="modal-actions">
        <button
          type="button"
          class="btn-modal-cancel"
          onclick={() => (showCloneModal = false)}
          disabled={isCloning}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn-modal-primary"
          onclick={handleCloneDeck}
          disabled={isCloning || !cloneSourceDeck || !cloneTargetDeck}
        >
          {isCloning ? 'Cloning Deck...' : 'Clone Deck'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Split Deck Modal -->
{#if showSplitModal}
  <div class="modal-backdrop" role="presentation" onclick={() => (showSplitModal = false)}>
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') showSplitModal = false; }}
    >
      <div class="modal-header">
        <h2>✂️ Split Deck into Batches</h2>
        <button type="button" class="btn-close" onclick={() => (showSplitModal = false)}>✕</button>
      </div>
      <div class="modal-body">
        <p class="modal-intro">Divide cards in a large deck into numbered sub-decks for manageable daily study sessions.</p>

        {#if splitError}
          <div class="modal-error-box">
            <span>⚠️ {splitError}</span>
          </div>
        {/if}

        <div class="form-group">
          <label for="split-source-deck">Source Deck</label>
          <select id="split-source-deck" class="form-select" bind:value={splitSourceDeck}>
            {#each availableDecks as deck}
              <option value={deck}>{deck}</option>
            {/each}
          </select>
        </div>

        <div class="form-row">
          <div class="form-group flex-1">
            <label for="split-batch-size">Cards Per Sub-Deck</label>
            <input
              id="split-batch-size"
              type="number"
              min="2"
              class="form-input"
              bind:value={splitBatchSize}
            />
          </div>
          <div class="form-group flex-2">
            <label for="split-prefix">Custom Prefix (Optional)</label>
            <input
              id="split-prefix"
              type="text"
              class="form-input"
              placeholder={splitSourceDeck || 'Deck Name'}
              bind:value={splitCustomPrefix}
            />
          </div>
        </div>

        <p class="modal-subtext">
          Sub-decks will be named like <code>{(splitCustomPrefix || splitSourceDeck || 'Deck')} - Part 1</code>, <code>{(splitCustomPrefix || splitSourceDeck || 'Deck')} - Part 2</code>, etc.
        </p>
      </div>
      <div class="modal-actions">
        <button
          type="button"
          class="btn-modal-cancel"
          onclick={() => (showSplitModal = false)}
          disabled={isSplitting}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn-modal-primary"
          onclick={handleSplitDeck}
          disabled={isSplitting || !splitSourceDeck || splitBatchSize < 2}
        >
          {isSplitting ? 'Splitting Deck...' : 'Split Deck'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Move Selected Cards Modal -->
{#if showMoveModal}
  <div class="modal-backdrop" role="presentation" onclick={() => (showMoveModal = false)}>
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') showMoveModal = false; }}
    >
      <div class="modal-header">
        <h2>📦 Move Selected Cards to Deck</h2>
        <button type="button" class="btn-close" onclick={() => (showMoveModal = false)}>✕</button>
      </div>
      <div class="modal-body">
        <p class="modal-intro">
          Move <strong>{explorerStore.selectedIds.length}</strong> selected flashcard{explorerStore.selectedIds.length === 1 ? '' : 's'} to another deck.
        </p>

        {#if moveError}
          <div class="modal-error-box">
            <span>⚠️ {moveError}</span>
          </div>
        {/if}

        <div class="deck-mode-toggle">
          <label class="radio-label">
            <input
              type="radio"
              name="moveDeckMode"
              value="existing"
              checked={moveTargetDeckMode === 'existing'}
              onchange={() => (moveTargetDeckMode = 'existing')}
            />
            <span>Existing Deck</span>
          </label>
          <label class="radio-label">
            <input
              type="radio"
              name="moveDeckMode"
              value="new"
              checked={moveTargetDeckMode === 'new'}
              onchange={() => (moveTargetDeckMode = 'new')}
            />
            <span>Create New Deck</span>
          </label>
        </div>

        {#if moveTargetDeckMode === 'existing'}
          <div class="form-group">
            <label for="move-existing-deck">Select Target Deck</label>
            <select id="move-existing-deck" class="form-select" bind:value={moveSelectedExistingDeck}>
              {#each availableDecks as deck}
                <option value={deck}>{deck}</option>
              {/each}
            </select>
          </div>
        {:else}
          <div class="form-group">
            <label for="move-new-deck">New Deck Name</label>
            <input
              id="move-new-deck"
              type="text"
              class="form-input"
              placeholder="e.g. Neuroscience 101"
              bind:value={moveCustomNewDeck}
            />
          </div>
        {/if}
      </div>
      <div class="modal-actions">
        <button
          type="button"
          class="btn-modal-cancel"
          onclick={() => (showMoveModal = false)}
          disabled={isMoving}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn-modal-primary"
          onclick={handleMoveCards}
          disabled={isMoving || (moveTargetDeckMode === 'new' && !moveCustomNewDeck.trim()) || (moveTargetDeckMode === 'existing' && !moveSelectedExistingDeck)}
        >
          {isMoving ? 'Moving Cards...' : `Move ${explorerStore.selectedIds.length} Card${explorerStore.selectedIds.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  </div>
{/if}


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

  .count-badge {
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.3);
    font-weight: 600;
    font-size: 13px;
    padding: 6px 14px;
    border-radius: 9999px;
  }

  .toolbar-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .toolbar-top-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
  }

  .toolbar-actions-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-deck-op {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 14px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    color: #cbd5e1;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    height: 44px;
    box-sizing: border-box;
  }

  .btn-deck-op:hover:not(:disabled) {
    background: #1e293b;
    border-color: #6366f1;
    color: #ffffff;
  }

  .btn-deck-op:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-refresh {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    height: 44px;
    box-sizing: border-box;
  }

  .btn-refresh:hover:not(:disabled) {
    background: #1e293b;
    border-color: #6366f1;
    color: #ffffff;
  }

  .btn-refresh:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .refresh-icon {
    display: inline-block;
    font-size: 14px;
    line-height: 1;
  }

  .refresh-icon.spinning {
    animation: spin 0.8s linear infinite;
  }

  .search-icon {
    position: absolute;
    left: 14px;
    font-size: 16px;
    color: #64748b;
  }

  .search-input-wrapper input {
    width: 100%;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 12px 38px;
    color: #f8fafc;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  .search-input-wrapper input:focus {
    border-color: #6366f1;
  }

  .clear-btn {
    position: absolute;
    right: 12px;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 14px;
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .filter-label {
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 80px;
  }

  .chips-container {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    background: #0f172a;
    border: 1px solid #334155;
    color: #94a3b8;
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .chip:hover {
    background: #1e293b;
    color: #f1f5f9;
  }

  .chip.active {
    background: #6366f1;
    color: white;
    border-color: #6366f1;
    font-weight: 600;
  }

  .chip.beginner.active { background: #10b981; border-color: #10b981; }
  .chip.intermediate.active { background: #3b82f6; border-color: #3b82f6; }
  .chip.expert.active { background: #8b5cf6; border-color: #8b5cf6; }
  .chip.mixed.active { background: linear-gradient(135deg, #ec4899, #8b5cf6); border-color: #ec4899; color: white; }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr));
    gap: 20px;
  }

  .card-item {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    transition: transform 0.15s, border-color 0.15s;
    min-width: 0;
    overflow-wrap: break-word;
    word-break: break-word;
  }

  .card-item:hover {
    transform: translateY(-2px);
    border-color: #475569;
  }

  .card-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .difficulty-badge {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .difficulty-badge.beginner { background: rgba(16, 185, 129, 0.15); color: #34d399; }
  .difficulty-badge.intermediate { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
  .difficulty-badge.expert { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
  .difficulty-badge.mixed { background: rgba(236, 72, 153, 0.15); color: #f472b6; border: 1px solid rgba(236, 72, 153, 0.3); }

  .deck-tag {
    font-size: 12px;
    color: #94a3b8;
  }

  .locator-badge {
    font-size: 11px;
    font-weight: 500;
    color: #7dd3fc;
    background: rgba(14, 165, 233, 0.15);
    border: 1px solid rgba(14, 165, 233, 0.3);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .card-question {
    display: flex;
    gap: 10px;
    min-width: 0;
  }

  .q-label {
    background: #6366f1;
    color: white;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    height: fit-content;
    flex-shrink: 0;
  }

  .card-question p {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.4;
    overflow-wrap: break-word;
    word-break: break-word;
    min-width: 0;
  }

  .card-answer-section {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 12px;
    min-width: 0;
  }

  .answer-revealed {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
    min-width: 0;
  }

  .a-label {
    background: #10b981;
    color: white;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    height: fit-content;
    flex-shrink: 0;
  }

  .answer-revealed p {
    margin: 0;
    font-size: 13px;
    color: #cbd5e1;
    line-height: 1.4;
    overflow-wrap: break-word;
    word-break: break-word;
    min-width: 0;
  }

  .btn-toggle-answer {
    width: 100%;
    padding: 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: all 0.15s;
  }

  .btn-toggle-answer.reveal {
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
  }

  .btn-toggle-answer.reveal:hover {
    background: #6366f1;
    color: white;
  }

  .btn-toggle-answer.hide {
    background: #334155;
    color: #94a3b8;
  }

  .btn-toggle-answer.hide:hover {
    background: #475569;
    color: #f1f5f9;
  }

  .grounding-quote {
    background: rgba(99, 102, 241, 0.05);
    border-left: 2px solid #6366f1;
    padding: 8px 12px;
    border-radius: 0 6px 6px 0;
    min-width: 0;
    overflow-wrap: break-word;
    word-break: break-word;
  }

  .quote-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    min-width: 0;
  }

  .quote-tag {
    font-size: 11px;
    font-weight: 600;
    color: #818cf8;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .quote-ref {
    font-size: 11px;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .ref-link {
    color: #38bdf8;
    text-decoration: none;
    font-weight: 500;
  }

  .ref-link:hover {
    text-decoration: underline;
    color: #7dd3fc;
  }

  .ref-text {
    color: #94a3b8;
  }

  .grounding-quote p.quote-text {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
    font-style: italic;
    line-height: 1.4;
    overflow-wrap: break-word;
    word-break: break-word;
  }

  .quote-text.clamped {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .btn-toggle-quote {
    background: none;
    border: none;
    padding: 4px 0 0;
    color: #818cf8;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    display: inline-block;
    text-align: left;
    transition: color 0.15s;
  }

  .btn-toggle-quote:hover {
    color: #a5b4fc;
    text-decoration: underline;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid rgba(51, 65, 85, 0.5);
  }

  .meta-pills {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .tags-list,
  .keywords-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tag-pill {
    background: rgba(255, 255, 255, 0.05);
    color: #94a3b8;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .keyword-pill {
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.3);
    color: #a5b4fc;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .btn-edit {
    background: transparent;
    border: 1px solid #334155;
    color: #cbd5e1;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-edit:hover {
    background: #334155;
    color: white;
  }

  .toast-banner {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #34d399;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
  }

  .loading-state, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    color: #94a3b8;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
  }

  .empty-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #334155;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 12px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 12px 16px;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* Bulk Action Bar */
  .bulk-action-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.35);
    border-radius: 10px;
    padding: 12px 20px;
    animation: fadeIn 0.2s ease-in-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .bulk-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .selection-pill {
    background: #6366f1;
    color: white;
    font-weight: 700;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 9999px;
  }

  .btn-bulk-toggle, .btn-bulk-clear {
    background: transparent;
    border: 1px solid #475569;
    color: #cbd5e1;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-bulk-toggle:hover, .btn-bulk-clear:hover {
    background: #334155;
    color: white;
  }

  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-bulk-move {
    background: #6366f1;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-bulk-move:hover:not(:disabled) {
    background: #4f46e5;
  }

  .btn-bulk-move:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-bulk-delete {
    background: #ef4444;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-bulk-delete:hover:not(:disabled) {
    background: #dc2626;
  }

  .btn-bulk-delete:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Card Checkbox & Selected State */
  .card-item.selected {
    border-color: #6366f1;
    background: rgba(99, 102, 241, 0.06);
  }

  .card-checkbox-label {
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .card-checkbox {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #6366f1;
  }

  .card-badges {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Confirmation Modal */
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
    border-radius: 12px;
    width: 90%;
    max-width: 480px;
    padding: 24px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .modal-header h2 {
    font-size: 18px;
    font-weight: 700;
    color: #f8fafc;
    margin: 0;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 16px;
    cursor: pointer;
  }

  .btn-close:hover {
    color: white;
  }

  .modal-body {
    margin-bottom: 24px;
    color: #cbd5e1;
    font-size: 14px;
    line-height: 1.5;
  }

  .modal-subtext {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 8px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .btn-modal-cancel {
    background: #334155;
    color: #f1f5f9;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-modal-cancel:hover:not(:disabled) {
    background: #475569;
  }

  .btn-modal-delete {
    background: #ef4444;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-modal-delete:hover:not(:disabled) {
    background: #dc2626;
  }

  .btn-modal-delete:disabled, .btn-modal-cancel:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-modal-primary {
    background: #6366f1;
    color: white;
    border: none;
    padding: 8px 18px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-modal-primary:hover:not(:disabled) {
    background: #4f46e5;
  }

  .btn-modal-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .modal-intro {
    font-size: 13px;
    color: #94a3b8;
    margin: 0 0 16px 0;
    line-height: 1.4;
  }

  .modal-error-box {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 13px;
    margin-bottom: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
  }

  .form-group label {
    font-size: 12px;
    font-weight: 600;
    color: #cbd5e1;
  }

  .form-select, .form-input {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 10px 12px;
    color: #f8fafc;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  .form-select:focus, .form-input:focus {
    border-color: #6366f1;
  }

  .form-row {
    display: flex;
    gap: 12px;
  }

  .flex-1 {
    flex: 1;
  }

  .flex-2 {
    flex: 2;
  }

  .deck-mode-toggle {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
    padding: 8px 12px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #e2e8f0;
    cursor: pointer;
  }

  .radio-label input[type="radio"] {
    accent-color: #6366f1;
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  /* Infinite Scroll Sentinel & Loading Banner */
  .infinite-scroll-sentinel {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 0;
  }

  .scroll-spinner-row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    font-weight: 500;
    color: #94a3b8;
  }

  .spinner-inline {
    width: 20px;
    height: 20px;
    border: 2px solid #334155;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .end-of-collection-banner {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 24px 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 500;
  }

  @media (max-width: 640px) {
    .cards-grid {
      grid-template-columns: 1fr;
      gap: 14px;
    }
    .card-item {
      padding: 14px;
    }
    .quote-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }
    .quote-ref {
      max-width: 100%;
    }
  }
</style>