<script lang="ts">
  import { splitDeck } from '../lib/api';
  import { toastStore } from '../stores/toastStore.svelte';

  interface Props {
    open: boolean;
    initialSourceDeck?: string;
    availableDecks: string[];
    onClose: () => void;
    onSplit: (result: { sourceDeck: string; subDecks: string[]; cardsMoved: number }) => void;
  }

  let { open = $bindable(false), initialSourceDeck = '', availableDecks = [], onClose, onSplit }: Props = $props();

  let sourceDeck = $state('');
  let batchSize = $state(25);
  let customPrefix = $state('');
  let isSplitting = $state(false);
  let errorMessage = $state<string | null>(null);

  $effect(() => {
    if (open) {
      sourceDeck = initialSourceDeck || availableDecks[0] || 'Default';
      batchSize = 25;
      customPrefix = '';
      errorMessage = null;
    }
  });

  async function handleSplit() {
    if (!sourceDeck.trim()) {
      errorMessage = 'Source deck is required.';
      return;
    }
    if (!batchSize || batchSize < 2) {
      errorMessage = 'Batch size must be at least 2.';
      return;
    }

    isSplitting = true;
    errorMessage = null;
    try {
      const res = await splitDeck(sourceDeck.trim(), batchSize, customPrefix.trim() || undefined);
      toastStore.success(`Successfully split "${sourceDeck}" into ${res.subDecks.length} sub-decks (${res.cardsMoved} cards moved).`);
      open = false;
      onSplit(res);
    } catch (err: any) {
      errorMessage = err.message || 'Failed to split deck.';
    } finally {
      isSplitting = false;
    }
  }

  function handleClose() {
    open = false;
    onClose?.();
  }
</script>

{#if open}
  <div class="modal-backdrop" role="presentation" onclick={handleClose}>
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') handleClose(); }}
    >
      <div class="modal-header">
        <h2>✂️ Split Deck into Batches</h2>
        <button type="button" class="btn-close" onclick={handleClose}>✕</button>
      </div>
      <div class="modal-body">
        <p class="modal-intro">Divide cards in a large deck into numbered sub-decks for manageable daily study sessions.</p>

        {#if errorMessage}
          <div class="modal-error-box">
            <span>⚠️ {errorMessage}</span>
          </div>
        {/if}

        <div class="form-group">
          <label for="split-source-deck">Source Deck</label>
          <select id="split-source-deck" class="form-select" bind:value={sourceDeck}>
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
              bind:value={batchSize}
            />
          </div>
          <div class="form-group flex-2">
            <label for="split-prefix">Custom Prefix (Optional)</label>
            <input
              id="split-prefix"
              type="text"
              class="form-input"
              placeholder={sourceDeck || 'Deck Name'}
              bind:value={customPrefix}
            />
          </div>
        </div>

        <p class="modal-subtext">
          Sub-decks will be named like <code>{(customPrefix || sourceDeck || 'Deck')} - Part 1</code>, <code>{(customPrefix || sourceDeck || 'Deck')} - Part 2</code>, etc.
        </p>
      </div>
      <div class="modal-actions">
        <button
          type="button"
          class="btn-modal-cancel"
          onclick={handleClose}
          disabled={isSplitting}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn-modal-primary"
          onclick={handleSplit}
          disabled={isSplitting || !sourceDeck || batchSize < 2}
        >
          {isSplitting ? 'Splitting Deck...' : 'Split Deck'}
        </button>
      </div>
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

  .modal-subtext {
    font-size: 12px;
    color: #94a3b8;
    margin-top: 8px;
  }

  .modal-subtext code {
    background: #0f172a;
    padding: 2px 6px;
    border-radius: 4px;
    color: #a5b4fc;
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

  .btn-modal-cancel:disabled {
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
</style>
