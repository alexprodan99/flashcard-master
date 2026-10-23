import type { Flashcard } from '../lib/types.js';

export class ExplorerStore {
  cards = $state<Flashcard[]>([]);
  total = $state<number>(0);
  limit = $state<number>(25);
  offset = $state<number>(0);
  nextCursor = $state<string | null>(null);
  hasMore = $state<boolean>(true);

  loading = $state<boolean>(false);
  loadingMore = $state<boolean>(false);
  error = $state<string | null>(null);

  searchQuery = $state<string>('');
  selectedDeck = $state<string>('all');
  selectedDifficulty = $state<string>('all');
  selectedIds = $state<string[]>([]);
  revealedAnswers = $state<Record<string, boolean>>({});
  isBulkDeleting = $state<boolean>(false);
  showBulkDeleteConfirm = $state<boolean>(false);

  setInitialCards(cards: Flashcard[], total: number, nextCursor: string | null = null, hasMore = false, limit = 25) {
    this.cards = cards;
    this.total = total;
    this.limit = limit;
    this.nextCursor = nextCursor;
    this.hasMore = hasMore;
    this.offset = cards.length;
    this.error = null;
  }

  appendCards(newCards: Flashcard[], total: number, nextCursor: string | null = null, hasMore = false) {
    const existingIds = new Set(this.cards.map((c) => c.id));
    const toAppend = newCards.filter((c) => !existingIds.has(c.id));
    this.cards = [...this.cards, ...toAppend];
    this.total = total;
    this.nextCursor = nextCursor;
    this.hasMore = hasMore;
    this.offset = this.cards.length;
    this.error = null;
  }

  resetPagination() {
    this.cards = [];
    this.offset = 0;
    this.total = 0;
    this.nextCursor = null;
    this.hasMore = true;
  }

  setCards(cards: Flashcard[]) {
    this.cards = cards;
    this.total = cards.length;
    this.offset = cards.length;
    this.nextCursor = null;
    this.hasMore = false;
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
    this.total = Math.max(0, this.total - 1);
  }

  removeCardsBulk(ids: string[]) {
    const idSet = new Set(ids);
    this.cards = this.cards.filter((c) => !idSet.has(c.id));
    this.selectedIds = this.selectedIds.filter((x) => !idSet.has(x));
    this.total = Math.max(0, this.total - ids.length);
  }
}

export const explorerStore = new ExplorerStore();

