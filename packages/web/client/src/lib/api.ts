import type { DashboardStats, DataSource, Flashcard, GenerationResult } from './types';

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

export async function generateCards(payload: {
  sourceIds: string[];
  provider: string;
  model?: string;
  apiKey?: string;
  persona?: string;
  difficulty?: string;
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
  return {
    success: true,
    cardsPushed: data.addedCards ?? data.totalCards ?? 0,
    message: `Added ${data.addedCards ?? 0} cards (${data.duplicateOrFailedCards ?? 0} skipped).`,
  };
}