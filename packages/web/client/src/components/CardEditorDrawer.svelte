<script lang="ts">
  import { updateCard, deleteCard } from '../lib/api';
  import type { Flashcard, DifficultyLevel } from '../lib/types';

  interface Props {
    isOpen: boolean;
    card: Flashcard | null;
    onClose: () => void;
    onCardUpdated: (card: Flashcard) => void;
    onCardDeleted: (id: string) => void;
  }

  let { isOpen, card, onClose, onCardUpdated, onCardDeleted }: Props = $props();

  let question = $state('');
  let answer = $state('');
  let sourceQuote = $state('');
  let documentTitle = $state('');
  let sourceOriginUrl = $state('');
  let targetDeck = $state('Default');
  let difficulty = $state<DifficultyLevel>('intermediate');
  let tagsInput = $state('');

  let isSaving = $state(false);
  let isDeleting = $state(false);
  let errorMessage = $state<string | null>(null);

  $effect(() => {
    if (card) {
      question = card.question;
      answer = card.answer;
      sourceQuote = card.sourceQuote || '';
      documentTitle = card.documentTitle || '';
      sourceOriginUrl = card.sourceOriginUrl || '';
      targetDeck = card.targetDeck || 'Default';
      difficulty = card.difficulty;
      tagsInput = (card.tags || []).join(', ');
      errorMessage = null;
    }
  });

  async function handleSave(e: Event) {
    e.preventDefault();
    if (!card) return;
    if (!question.trim() || !answer.trim()) {
      errorMessage = 'Question and answer cannot be empty.';
      return;
    }

    isSaving = true;
    errorMessage = null;

    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const updated = await updateCard(card.id, {
        question: question.trim(),
        answer: answer.trim(),
        sourceQuote: sourceQuote.trim(),
        documentTitle: documentTitle.trim() || null,
        sourceOriginUrl: sourceOriginUrl.trim() || null,
        targetDeck: targetDeck.trim() || 'Default',
        difficulty,
        tags,
      });

      onCardUpdated(updated);
      onClose();
    } catch (err: any) {
      errorMessage = err.message || 'Failed to update card';
    } finally {
      isSaving = false;
    }
  }

  async function handleDelete() {
    if (!card) return;
    if (!confirm('Are you sure you want to delete this flashcard?')) return;

    isDeleting = true;
    try {
      await deleteCard(card.id);
      onCardDeleted(card.id);
      onClose();
    } catch (err: any) {
      alert('Failed to delete card: ' + err.message);
    } finally {
      isDeleting = false;
    }
  }
</script>

{#if isOpen && card}
  <div class="drawer-backdrop" role="presentation" onclick={onClose}>
    <div class="drawer-panel" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
      <div class="drawer-header">
        <div>
          <h2>✏️ Edit Flashcard</h2>
          <span class="card-id">ID: {card.id}</span>
        </div>
        <button class="close-btn" onclick={onClose} aria-label="Close drawer">✕</button>
      </div>

      {#if errorMessage}
        <div class="error-banner">⚠️ {errorMessage}</div>
      {/if}

      <form onsubmit={handleSave} class="drawer-form">
        <div class="form-group">
          <label for="edit-question">Front (Question)</label>
          <textarea
            id="edit-question"
            rows="3"
            bind:value={question}
            required
          ></textarea>
        </div>

        <div class="form-group">
          <label for="edit-answer">Back (Answer)</label>
          <textarea
            id="edit-answer"
            rows="4"
            bind:value={answer}
            required
          ></textarea>
        </div>

        <div class="form-group">
          <label for="edit-quote">Verbatim Source Grounding Quote</label>
          <textarea
            id="edit-quote"
            rows="3"
            bind:value={sourceQuote}
            placeholder="Verbatim sentence from original document..."
          ></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="edit-doc-title">Source Document Title</label>
            <input
              id="edit-doc-title"
              type="text"
              bind:value={documentTitle}
              placeholder="e.g. Architecture Invariants Guide"
            />
          </div>

          <div class="form-group">
            <label for="edit-origin-url">Source Origin URL</label>
            <input
              id="edit-origin-url"
              type="url"
              bind:value={sourceOriginUrl}
              placeholder="https://example.com/article"
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="edit-deck">Target Deck</label>
            <input
              id="edit-deck"
              type="text"
              bind:value={targetDeck}
              required
            />
          </div>

          <div class="form-group">
            <label for="edit-difficulty">Difficulty</label>
            <select id="edit-difficulty" bind:value={difficulty}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="expert">Expert</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label for="edit-tags">Tags (comma-separated)</label>
          <input
            id="edit-tags"
            type="text"
            bind:value={tagsInput}
          />
        </div>

        <div class="drawer-footer">
          <button
            type="button"
            class="btn btn-danger"
            onclick={handleDelete}
            disabled={isDeleting || isSaving}
          >
            {isDeleting ? 'Deleting...' : '🗑️ Delete'}
          </button>
          <div class="right-buttons">
            <button
              type="button"
              class="btn btn-secondary"
              onclick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(2px);
    display: flex;
    justify-content: flex-end;
    z-index: 1000;
  }

  .drawer-panel {
    background: #1e293b;
    border-left: 1px solid #334155;
    width: 100%;
    max-width: 520px;
    height: 100vh;
    padding: 28px;
    box-shadow: -10px 0 25px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    border-bottom: 1px solid #334155;
    padding-bottom: 14px;
  }

  .drawer-header h2 {
    font-size: 20px;
    font-weight: 700;
    color: #f8fafc;
    margin: 0 0 4px 0;
  }

  .card-id {
    font-size: 11px;
    color: #64748b;
    font-family: monospace;
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

  .drawer-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
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
    font-size: 12px;
    font-weight: 600;
    color: #cbd5e1;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  input, textarea, select {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 12px;
    color: #f8fafc;
    font-size: 13px;
    outline: none;
    font-family: inherit;
    transition: border-color 0.15s;
    width: 100%;
    resize: vertical;
  }

  input:focus, textarea:focus, select:focus {
    border-color: #6366f1;
  }

  .drawer-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: auto;
    padding-top: 20px;
    border-top: 1px solid #334155;
  }

  .right-buttons {
    display: flex;
    gap: 8px;
  }

  .btn {
    padding: 9px 16px;
    border-radius: 8px;
    font-size: 13px;
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

  .btn-danger {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
    border-color: rgba(239, 68, 68, 0.3);
  }

  .btn-danger:hover {
    background: #ef4444;
    color: white;
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