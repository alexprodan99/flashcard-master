import type { Flashcard } from '../lib/types.js';
import { fetchCards } from '../lib/api.js';

export class ExplorerStore {
  cards = $state<Flashcard[]>([]);
  loading = $state<boolean>(false);
  error = $state<string | null>(null);

  searchQuery = $state<string>('');
  selectedDeck = $state<string>('all');
  selectedDifficulty = $state<string>('all');
  selectedIds = $state<string[]>([]);
  revealedAnswers = $state<Record<string, boolean>>({});
  isBulkDeleting = $state<boolean>(false);
  showBulkDeleteConfirm = $state<boolean>(false);

  setCards(cards: Flashcard[]) {
    this.cards = cards;
    this.error = null;
  }

  setSearch(q: string) {
    this.searchQuery = q;
  }

  setDeck(deck: string) {
    this.selectedDeck = deck;
  }

  setDifficulty(difficulty: string) {
    this.selectedDifficulty = difficulty;
  }

  toggleSelect(id: string) {
    if (this.selectedIds.includes(id)) {
      this.selectedIds = this.selectedIds.filter((x) => x !== id);
    } else {
      this.selectedIds = [...this.selectedIds, id];
    }
  }

  selectAll(ids: string[]) {
    this.selectedIds = Array.from(new Set([...this.selectedIds, ...ids]));
  }

  deselectAll(ids: string[]) {
    this.selectedIds = this.selectedIds.filter((id) => !ids.includes(id));
  }

  clearSelection() {
    this.selectedIds = [];
  }

  toggleReveal(id: string) {
    this.revealedAnswers[id] = !this.revealedAnswers[id];
  }

  updateCard(updated: Flashcard) {
    this.cards = this.cards.map((c) => (c.id === updated.id ? updated : c));
  }

  removeCard(id: string) {
    this.cards = this.cards.filter((c) => c.id !== id);
    this.selectedIds = this.selectedIds.filter((x) => x !== id);
  }
}

export const explorerStore = new ExplorerStore();
