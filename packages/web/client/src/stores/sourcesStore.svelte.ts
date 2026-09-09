import type { DataSource } from '../lib/types.js';

export class SourcesStore {
  sources = $state<DataSource[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  expandedSourceIds = $state<Record<string, boolean>>({});
  filterQuery = $state<string>('');
  syncingSourceIds = $state<Record<string, boolean>>({});
  isSyncingAll = $state<boolean>(false);
  activeSyncJobIds = $state<Record<string, string>>({});
  activeSyncAllJobId = $state<string | null>(null);

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

  setSyncing(sourceId: string, isSyncing: boolean, jobId?: string | null) {
    this.syncingSourceIds[sourceId] = isSyncing;
    if (jobId) {
      this.activeSyncJobIds[sourceId] = jobId;
    } else if (!isSyncing) {
      delete this.activeSyncJobIds[sourceId];
    }
  }

  setSyncingAll(isSyncing: boolean, jobId?: string | null) {
    this.isSyncingAll = isSyncing;
    this.activeSyncAllJobId = isSyncing ? (jobId || null) : null;
  }
}

export const sourcesStore = new SourcesStore();
