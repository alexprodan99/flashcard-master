import type { DashboardStats } from './types.js';

export const DASHBOARD_STATS_STORAGE_KEY = 'fc_dashboard_stats';

export function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function loadCachedStats(): DashboardStats | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(DASHBOARD_STATS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as DashboardStats;
    }
  } catch {
    return null;
  }
  return null;
}

export function saveCachedStats(data: DashboardStats): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(DASHBOARD_STATS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Graceful error handling (e.g. QuotaExceededError or SecurityError)
  }
}
