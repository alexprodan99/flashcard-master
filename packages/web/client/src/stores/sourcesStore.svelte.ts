import type { DataSource } from '../lib/types';

export class SourcesStore {
  sources = $state<DataSource[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  expandedSourceIds = $state<Record<string, boolean>>({});
  filterQuery = $state<string>('');
  syncingSourceIds = $state<Record<string, boolean>>({});
  isSyncingAll = $state<boolean>(false);

  setSources(list: DataSource[]) {
    this.sources = list;
    this.error = null;
  }

  updateSource(updated: DataSource) {
    this.sources = this.sources.map((s) => (s.id === updated.id ? updated : s));
  }

  removeSource(id: string) {
    this.sources = this.sources.filter((s) => s.id !== id);
  }

  toggleExpand(sourceId: string) {
    this.expandedSourceIds[sourceId] = !this.expandedSourceIds[sourceId];
  }

  setFilter(query: string) {
    this.filterQuery = query;
  }

  setSyncing(sourceId: string, isSyncing: boolean) {
    this.syncingSourceIds[sourceId] = isSyncing;
  }

  setSyncingAll(isSyncing: boolean) {
    this.isSyncingAll = isSyncing;
  }
}

export const sourcesStore = new SourcesStore();
