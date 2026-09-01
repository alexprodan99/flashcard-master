<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchCards } from '../lib/api';
  import type { Flashcard, DifficultyLevel } from '../lib/types';
  import CardEditorDrawer from '../components/CardEditorDrawer.svelte';

  let cards = $state<Flashcard[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let searchQuery = $state('');
  let selectedDeck = $state<string>('all');
  let selectedDifficulty = $state<string>('all');

  let editingCard = $state<Flashcard | null>(null);
  let isDrawerOpen = $state(false);
  let revealedAnswers = $state<Record<string, boolean>>({});
  let toastMessage = $state<string | null>(null);

  // Derived filters
  let availableDecks = $derived(
    Array.from(new Set(cards.map((c) => c.targetDeck || 'Default'))).sort()
  );

  let filteredCards = $derived(
    cards.filter((c) => {
      if (selectedDeck !== 'all' && (c.targetDeck || 'Default') !== selectedDeck) {
        return false;
      }
      if (selectedDifficulty !== 'all' && c.difficulty !== selectedDifficulty) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inQuestion = c.question.toLowerCase().includes(q);
        const inAnswer = c.answer.toLowerCase().includes(q);
        const inQuote = (c.sourceQuote || '').toLowerCase().includes(q);
        const inTags = (c.tags || []).some((t) => t.toLowerCase().includes(q));
        return inQuestion || inAnswer || inQuote || inTags;
      }
      return true;
    })
  );

  async function loadCards() {
    loading = true;
    error = null;
    try {
      cards = await fetchCards();
    } catch (err: any) {
      error = err.message || 'Failed to load cards';
    } finally {
      loading = false;
    }
  }

  function toggleReveal(id: string) {
    revealedAnswers[id] = !revealedAnswers[id];
  }

  function openEdit(card: Flashcard) {
    editingCard = card;
    isDrawerOpen = true;
  }

  function handleCardUpdated(updated: Flashcard) {
    cards = cards.map((c) => (c.id === updated.id ? updated : c));
    toastMessage = '✅ Flashcard updated successfully.';
    setTimeout(() => (toastMessage = null), 4000);
  }

  function handleCardDeleted(id: string) {
    cards = cards.filter((c) => c.id !== id);
    toastMessage = '🗑️ Flashcard deleted.';
    setTimeout(() => (toastMessage = null), 4000);
  }

  onMount(() => {
    loadCards();
  });
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h1 class="view-title">🗂️ Question Explorer</h1>
      <p class="view-subtitle">Search, curate, and review atomic flashcards with factual quote grounding.</p>
    </div>
    <span class="count-badge">{filteredCards.length} Cards Found</span>
  </div>

  {#if toastMessage}
    <div class="toast-banner">{toastMessage}</div>
  {/if}

  <!-- Filter & Search Toolbar -->
  <div class="toolbar-card">
    <div class="search-input-wrapper">
      <span class="search-icon">🔍</span>
      <input
        type="text"
        placeholder="Search questions, answers, tags, or source quotes..."
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button class="clear-btn" onclick={() => (searchQuery = '')}>✕</button>
      {/if}
    </div>

    <!-- Deck filter chips -->
    <div class="filter-row">
      <span class="filter-label">Decks:</span>
      <div class="chips-container">
        <button
          type="button"
          class="chip"
          class:active={selectedDeck === 'all'}
          onclick={() => (selectedDeck = 'all')}
        >
          All Decks ({cards.length})
        </button>
        {#each availableDecks as deck}
          <button
            type="button"
            class="chip"
            class:active={selectedDeck === deck}
            onclick={() => (selectedDeck = deck)}
          >
            {deck} ({cards.filter((c) => (c.targetDeck || 'Default') === deck).length})
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
          class:active={selectedDifficulty === 'all'}
          onclick={() => (selectedDifficulty = 'all')}
        >
          All
        </button>
        <button
          type="button"
          class="chip beginner"
          class:active={selectedDifficulty === 'beginner'}
          onclick={() => (selectedDifficulty = 'beginner')}
        >
          Beginner
        </button>
        <button
          type="button"
          class="chip intermediate"
          class:active={selectedDifficulty === 'intermediate'}
          onclick={() => (selectedDifficulty = 'intermediate')}
        >
          Intermediate
        </button>
        <button
          type="button"
          class="chip expert"
          class:active={selectedDifficulty === 'expert'}
          onclick={() => (selectedDifficulty = 'expert')}
        >
          Expert
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
      <button onclick={loadCards} class="btn btn-sm">Retry</button>
    </div>
  {:else if filteredCards.length === 0}
    <div class="empty-state">
      <div class="empty-icon">🗂️</div>
      <h3>No Flashcards Found</h3>
      <p>No cards match your current search or filter criteria. Try clearing filters or synthesizing cards in Generate Studio.</p>
    </div>
  {:else}
    <div class="cards-grid">
      {#each filteredCards as card}
        <div class="card-item">
          <div class="card-top-bar">
            <span class="difficulty-badge {card.difficulty}">{card.difficulty}</span>
            <span class="deck-tag">📦 {card.targetDeck || 'Default'}</span>
          </div>

          <div class="card-question">
            <span class="q-label">Q</span>
            <p>{card.question}</p>
          </div>

          <div class="card-answer-section">
            {#if revealedAnswers[card.id]}
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
              <span class="quote-tag">🛡️ Verified Source Quote:</span>
              <p>"{card.sourceQuote}"</p>
            </div>
          {/if}

          <div class="card-footer">
            <div class="tags-list">
              {#if card.tags && card.tags.length > 0}
                {#each card.tags as tag}
                  <span class="tag-pill">#{tag}</span>
                {/each}
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

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
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

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
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

  .deck-tag {
    font-size: 12px;
    color: #94a3b8;
  }

  .card-question {
    display: flex;
    gap: 10px;
  }

  .q-label {
    background: #6366f1;
    color: white;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    height: fit-content;
  }

  .card-question p {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.4;
  }

  .card-answer-section {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 12px;
  }

  .answer-revealed {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
  }

  .a-label {
    background: #10b981;
    color: white;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    height: fit-content;
  }

  .answer-revealed p {
    margin: 0;
    font-size: 13px;
    color: #cbd5e1;
    line-height: 1.4;
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
  }

  .quote-tag {
    font-size: 11px;
    font-weight: 600;
    color: #818cf8;
    display: block;
    margin-bottom: 4px;
  }

  .grounding-quote p {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
    font-style: italic;
    line-height: 1.3;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px solid rgba(51, 65, 85, 0.5);
  }

  .tags-list {
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
</style>