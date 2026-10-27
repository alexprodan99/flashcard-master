<script lang="ts">
  import { cloneDeck } from '../lib/api';
  import { toastStore } from '../stores/toastStore.svelte';

  interface Props {
    open: boolean;
    initialSourceDeck?: string;
    availableDecks: string[];
    onClose: () => void;
    onCloned: (result: { sourceDeck: string; targetDeck: string; clonedCount: number }) => void;
  }

  let { open = $bindable(false), initialSourceDeck = '', availableDecks = [], onClose, onCloned }: Props = $props();

  let sourceDeck = $state('');
  let targetDeck = $state('');
  let isCloning = $state(false);
  let errorMessage = $state<string | null>(null);

  $effect(() => {
    if (open) {
      sourceDeck = initialSourceDeck || availableDecks[0] || 'Default';
      targetDeck = sourceDeck ? `${sourceDeck} (Copy)` : '';
      errorMessage = null;
    }
  });

  async function handleClone() {
    if (!sourceDeck.trim()) {
      errorMessage = 'Source deck is required.';
      return;
    }
    if (!targetDeck.trim()) {
      errorMessage = 'Target deck name is required.';
      return;
    }
    if (sourceDeck.trim().toLowerCase() === targetDeck.trim().toLowerCase()) {
      errorMessage = 'Target deck name must be different from source deck.';
      return;
    }

    isCloning = true;
    errorMessage = null;
    try {
      const res = await cloneDeck(sourceDeck.trim(), targetDeck.trim());
      toastStore.success(`Successfully cloned "${res.sourceDeck}" to "${res.targetDeck}" (${res.clonedCount} cards).`);
      open = false;
      onCloned(res);
    } catch (err: any) {
      errorMessage = err.message || 'Failed to clone deck.';
    } finally {
      isCloning = false;
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
        <h2>📋 Clone Deck</h2>
        <button type="button" class="btn-close" onclick={handleClose}>✕</button>
      </div>
      <div class="modal-body">
        <p class="modal-intro">Duplicate all flashcards from an existing deck into a brand new deck with fresh IDs.</p>

        {#if errorMessage}
          <div class="modal-error-box">
            <span>⚠️ {errorMessage}</span>
          </div>
        {/if}

        <div class="form-group">
          <label for="clone-source-deck">Source Deck</label>
          <select id="clone-source-deck" class="form-select" bind:value={sourceDeck}>
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
            bind:value={targetDeck}
          />
        </div>
      </div>
      <div class="modal-actions">
        <button
          type="button"
          class="btn-modal-cancel"
          onclick={handleClose}
          disabled={isCloning}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn-modal-primary"
          onclick={handleClone}
          disabled={isCloning || !sourceDeck || !targetDeck}
        >
          {isCloning ? 'Cloning Deck...' : 'Clone Deck'}
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
