export class ExportStore {
  selectedDeck = $state<string>('all');
  selectedSourceId = $state<string>('all');
  isPushing = $state<boolean>(false);
  pushMessage = $state<string | null>(null);
  isKnowledgeExporting = $state<boolean>(false);
  knowledgeNotice = $state<string | null>(null);

  setDeck(deck: string) {
    this.selectedDeck = deck;
  }

  setSource(sourceId: string) {
    this.selectedSourceId = sourceId;
  }
}

export const exportStore = new ExportStore();
