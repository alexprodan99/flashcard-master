import type { DashboardStats, DataSource, Flashcard, GenerationResult, DiscoveredDocument } from './types';

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
  if (!res.ok) throw new Error('Failed to delete source');
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
}): Promise<GenerationResult> {
  const res = await fetch('/api/generate', {
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
  format: 'markdown' | 'html' | 'txt' | 'json';
  mode: 'merged' | 'split';
  includeTableOfContents?: boolean;
  includeCitations?: boolean;
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