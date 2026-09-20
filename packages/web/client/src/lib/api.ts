import type {
  DashboardStats,
  DataSource,
  Flashcard,
  GenerationResult,
  DiscoveredDocument,
  DocumentExportFormat,
  ProviderKeyStatus,
  ProviderVerificationResult,
  SecretProvider,
  KeySource,
  LoggingSettings,
} from './types.js';

export async function fetchStats(): Promise<DashboardStats> {
  const res = await fetch('/api/stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function fetchSources(): Promise<DataSource[]> {
  const res = await fetch('/api/sources');
  if (!res.ok) throw new Error('Failed to fetch data sources');
  return res.json();
}

export async function createSource(payload: {
  name: string;
  type: string;
  uri: string;
  targetDeck?: string;
  tags?: string[];
  config?: Record<string, unknown>;
}): Promise<DataSource> {
  const res = await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create data source');
  }
  return res.json();
}

export async function toggleSourceActive(id: string, isActive: boolean): Promise<DataSource> {
  const res = await fetch(`/api/sources/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });
  if (!res.ok) throw new Error('Failed to toggle source active status');
  return res.json();
}

export async function updateSource(
  id: string,
  payload: Partial<{
    name: string;
    uri: string;
    targetDeck: string;
    tags: string[];
    isActive: boolean;
    config: Record<string, unknown>;
  }>
): Promise<DataSource> {
  const res = await fetch(`/api/sources/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update data source');
  }
  return res.json();
}

export async function deleteSource(id: string): Promise<void> {
  const res = await fetch(`/api/sources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete source');
  }
}

export async function syncSource(id: string): Promise<{ success: boolean; sourceId: string; newCount: number; totalFetched: number; error?: string }> {
  const res = await fetch(`/api/sync/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Sync failed');
  }
  return res.json();
}

export async function syncAllSources(): Promise<Array<{ success: boolean; sourceId: string; newCount: number; totalFetched: number; error?: string }>> {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Batch sync failed');
  }
  return res.json();
}

export async function fetchCards(params?: { deck?: string; difficulty?: string; tag?: string; q?: string }): Promise<Flashcard[]> {
  const query = new URLSearchParams();
  if (params?.deck) query.set('deck', params.deck);
  if (params?.difficulty) query.set('difficulty', params.difficulty);
  if (params?.tag) query.set('tag', params.tag);
  if (params?.q) query.set('q', params.q);

  const res = await fetch(`/api/cards?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch flashcards');
  return res.json();
}

export async function updateCard(id: string, updates: Partial<Flashcard>): Promise<Flashcard> {
  const res = await fetch(`/api/cards/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update flashcard');
  return res.json();
}

export async function deleteCard(id: string): Promise<void> {
  const res = await fetch(`/api/cards/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete flashcard');
}

export async function deleteCardsBulk(ids: string[]): Promise<{ success: boolean; deletedCount: number }> {
  const res = await fetch('/api/cards/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete selected flashcards');
  }
  return res.json();
}

export async function generateCards(payload: {
  sourceIds?: string[];
  documentIds?: string[];
  provider: string;
  model?: string;
  apiKey?: string;
  persona?: string;
  difficulty?: string;
  depthMode?: string;
  chunkMultiplier?: number;
  limit?: number;
  targetDeck?: string;
  enforceGrounding?: boolean;
  sync?: boolean;
}): Promise<GenerationResult> {
  const url = payload.sync ? '/api/generate?sync=true' : '/api/generate';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Generation failed');
  }
  return res.json();
}

export async function fetchDocuments(sourceId?: string, search?: string): Promise<{ documents: DiscoveredDocument[]; total: number }> {
  const params = new URLSearchParams();
  if (sourceId && sourceId !== 'all') params.set('sourceId', sourceId);
  if (search) params.set('search', search);
  const queryString = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`/api/documents${queryString}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch documents');
  }
  return res.json();
}

export async function fetchSourceDocuments(sourceId: string, search?: string): Promise<{ documents: DiscoveredDocument[]; total: number }> {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await fetch(`/api/sources/${sourceId}/documents${query}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch source documents');
  }
  return res.json();
}

export async function fetchDocumentDetails(documentId: string): Promise<{ document: DiscoveredDocument }> {
  const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch document details');
  }
  return res.json();
}

export async function deleteDocument(documentId: string): Promise<boolean> {
  const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete document');
  }
  const data = await res.json();
  return !!data.success;
}

export async function deleteDocumentsBulk(documentIds: string[]): Promise<{ success: boolean; deletedCount: number }> {
  const res = await fetch('/api/documents/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: documentIds }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete selected documents');
  }
  return res.json();
}

export interface DocumentExportParams {
  sourceId?: string;
  ids?: string[];
  format: DocumentExportFormat;
  mode: 'merged' | 'split';
  includeTableOfContents?: boolean;
  includeCitations?: boolean;
  imageQuality?: 'compact' | 'standard' | 'high';
  grayscale?: boolean;
}

export async function exportDocuments(params: DocumentExportParams): Promise<{ filename: string }> {
  const res = await fetch('/api/documents/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to export documents (HTTP ${res.status})`);
  }

  let filename = 'documents-export';
  const disposition = res.headers.get('Content-Disposition');
  if (disposition) {
    const match = /filename=["']?([^"';]+)["']?/i.exec(disposition);
    if (match && match[1]) {
      filename = match[1].trim();
    }
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);

  return { filename };
}


export async function checkAnkiStatus(): Promise<{ connected: boolean; version?: number }> {
  try {
    const res = await fetch('/api/ankiconnect/status');
    if (!res.ok) return { connected: false };
    const data = await res.json();
    return { connected: !!data.isOnline, version: data.version };
  } catch {
    return { connected: false };
  }
}

export async function pushToAnki(targetDeck?: string): Promise<{ success: boolean; cardsPushed: number; message?: string }> {
  const res = await fetch('/api/ankiconnect/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetDeck }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to push to AnkiConnect');
  }
  const data = await res.json();
  const added = data.addedCards ?? 0;
  const updated = data.updatedCards ?? 0;
  const skipped = data.duplicateOrFailedCards ?? 0;
  const totalSuccess = added + updated;
  return {
    success: true,
    cardsPushed: totalSuccess,
    message: `Synced ${totalSuccess} cards (${added} added, ${updated} updated${skipped > 0 ? `, ${skipped} skipped` : ''}).`,
  };
}

export async function uploadSourceFile(file: File): Promise<{ path: string; filename: string; size: number }> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const res = await fetch('/api/sources/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to upload file (${res.status})`);
  }

  return res.json();
}

export async function fetchJobs(filter?: { status?: string; type?: string; limit?: number }): Promise<import('./types.js').Job[]> {
  const params = new URLSearchParams();
  if (filter?.status) params.set('status', filter.status);
  if (filter?.type) params.set('type', filter.type);
  if (filter?.limit) params.set('limit', String(filter.limit));
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`/api/jobs${query}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch jobs');
  }
  return res.json();
}

export async function fetchJobDetails(jobId: string): Promise<{ job: import('./types.js').Job; logs: import('./types.js').JobLog[] }> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch job details');
  }
  return res.json();
}

export async function cancelJobApi(jobId: string): Promise<{ success: boolean; cancelled: boolean; job: import('./types.js').Job }> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to cancel job');
  }
  return res.json();
}

export async function clearJobHistory(keepLastN?: number): Promise<{ success: boolean; deletedCount: number }> {
  const query = typeof keepLastN === 'number' ? `?keepLastN=${keepLastN}` : '';
  const res = await fetch(`/api/jobs/history${query}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to clear job history');
  }
  return res.json();
}

export async function fetchSettingsKeys(): Promise<{
  providers: ProviderKeyStatus[];
  keys: Record<SecretProvider, ProviderKeyStatus>;
}> {
  const res = await fetch('/api/settings/keys');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch settings keys');
  }
  return res.json();
}

export async function saveSettingsKey(payload: {
  provider: SecretProvider;
  key?: string | null;
  endpoint?: string | null;
}): Promise<{
  success: boolean;
  provider: SecretProvider;
  isConfigured: boolean;
  maskedValue: string;
  source: KeySource;
  endpoint?: string | null;
}> {
  const res = await fetch('/api/settings/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save settings key');
  }
  return res.json();
}

export async function deleteSettingsKey(provider: SecretProvider): Promise<{
  success: boolean;
  provider: SecretProvider;
  isConfigured: boolean;
  source: KeySource;
  maskedValue: string;
  endpoint?: string | null;
}> {
  const res = await fetch(`/api/settings/keys/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete settings key');
  }
  return res.json();
}

export async function testSettingsKey(payload: {
  provider: SecretProvider;
  key?: string | null;
  endpoint?: string | null;
}): Promise<ProviderVerificationResult> {
  const res = await fetch('/api/settings/keys/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Connection test failed');
  }
  return res.json();
}

export async function fetchLoggingSettings(): Promise<LoggingSettings> {
  const res = await fetch('/api/settings/logging');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch logging settings');
  }
  return res.json();
}

export async function updateLoggingSettings(payload: {
  verbose?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}): Promise<{ success: boolean; verbose: boolean; logLevel: 'debug' | 'info' | 'warn' | 'error' }> {
  const res = await fetch('/api/settings/logging', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update logging settings');
  }
  return res.json();
}