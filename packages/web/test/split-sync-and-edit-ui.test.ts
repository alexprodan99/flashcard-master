// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SplitSyncButton from '../client/src/components/SplitSyncButton.svelte';
import SourcesView from '../client/src/views/SourcesView.svelte';
import EditSourceModal from '../client/src/components/EditSourceModal.svelte';
import { sourcesStore } from '../client/src/stores/sourcesStore.svelte.js';
import { toastStore } from '../client/src/stores/toastStore.svelte.js';
import type { DataSource } from '../client/src/lib/types.js';

describe('Story 22.4 UI: SplitSyncButton, SourcesView & EditSourceModal Item Sync Status', () => {
  let target: HTMLElement;
  let comp: any;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    sourcesStore.setSources([]);
    sourcesStore.syncingSourceIds = {};
    sourcesStore.activeSyncJobIds = {};
    sourcesStore.setSyncingAll(false);
    toastStore.toasts = [];
  });

  afterEach(() => {
    if (comp) {
      try {
        unmount(comp);
      } catch {}
      comp = null;
    }
    target.remove();
    vi.restoreAllMocks();
  });

  describe('SplitSyncButton accessibility and syncMode dispatch', () => {
    it('triggers new-only on primary click, opens accessible menu with Arrow nav, and closes on Escape / outside click', async () => {
      const calls: string[] = [];
      comp = mount(SplitSyncButton, {
        target,
        props: {
          primaryLabel: '⚡ Sync',
          ariaLabel: 'Test Source',
          dropUp: true,
          onSync: (mode: string) => calls.push(mode),
        },
      });
      flushSync();

      const groupEl = target.querySelector('.split-sync-group')!;
      expect(groupEl.classList.contains('drop-up')).toBe(true);

      const primaryBtn = target.querySelector('.split-primary-btn') as HTMLButtonElement;
      const caretBtn = target.querySelector('.split-caret-btn') as HTMLButtonElement;

      expect(primaryBtn).not.toBeNull();
      expect(caretBtn).not.toBeNull();
      expect(caretBtn.getAttribute('aria-haspopup')).toBe('menu');
      expect(caretBtn.getAttribute('aria-expanded')).toBe('false');
      expect(target.querySelector('[role="menu"]')).toBeNull();

      // 1-click primary action -> 'new-only'
      primaryBtn.click();
      flushSync();
      expect(calls).toEqual(['new-only']);

      // Open dropdown menu and navigate items with ArrowDown / End
      caretBtn.click();
      flushSync();
      expect(caretBtn.getAttribute('aria-expanded')).toBe('true');
      const menu = target.querySelector('[role="menu"]');
      expect(menu).not.toBeNull();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const newOnlyBtn = target.querySelector('[data-sync-mode="new-only"]') as HTMLButtonElement;
      const fullBtn = target.querySelector('[data-sync-mode="full"]') as HTMLButtonElement;
      expect(document.activeElement).toBe(newOnlyBtn);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      expect(document.activeElement).toBe(fullBtn);

      expect(newOnlyBtn?.textContent).toContain('Sync New Items Only');
      expect(fullBtn?.textContent).toContain('Full Re-sync (All Items)');

      // Selecting Full Re-sync invokes onSync('full') and closes menu
      fullBtn.click();
      flushSync();
      expect(calls).toEqual(['new-only', 'full']);
      expect(target.querySelector('[role="menu"]')).toBeNull();

      // Escape closes open menu and returns focus to caret toggle
      caretBtn.click();
      flushSync();
      expect(target.querySelector('[role="menu"]')).not.toBeNull();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      flushSync();
      expect(target.querySelector('[role="menu"]')).toBeNull();
      expect(caretBtn.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(caretBtn);

      // Outside click closes open menu
      caretBtn.click();
      flushSync();
      expect(target.querySelector('[role="menu"]')).not.toBeNull();
      document.body.click();
      flushSync();
      expect(target.querySelector('[role="menu"]')).toBeNull();
    });
  });

  describe('SourcesView split sync integration', () => {
    it('keeps only one row dropdown open at a time, dispatches syncMode, and surfaces skippedCount in toasts', async () => {
      const sampleSources: DataSource[] = [
        {
          id: 'src-web-1',
          name: 'Docs Blog',
          type: 'web',
          uri: 'https://example.com/a',
          tags: [],
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'src-yt-2',
          name: 'YT Channel',
          type: 'youtube',
          uri: JSON.stringify([{ uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', extractionMode: 'auto' }]),
          defaultSlicingMode: 'none',
          tags: [],
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const fetchCalls: Array<{ url: string; method: string; body?: any }> = [];
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
          const url = String(input);
          const method = init?.method || 'GET';
          const parsedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
          fetchCalls.push({ url, method, body: parsedBody });

          if (url === '/api/sources') {
            return { ok: true, json: async () => sampleSources };
          }
          if (url.startsWith('/api/sync')) {
            return {
              ok: true,
              json: async () =>
                url === '/api/sync'
                  ? [{ sourceId: 'src-web-1', newCount: 1, totalFetched: 3, skippedCount: 2 }]
                  : { sourceId: 'src-web-1', newCount: 1, totalFetched: 3, skippedCount: 2 },
            };
          }
          return { ok: true, json: async () => ({}) };
        })
      );

      comp = mount(SourcesView, { target });
      await new Promise((r) => setTimeout(r, 40));
      flushSync();

      // Multi-row menu mutual exclusion: opening row 1 then clicking row 2 caret closes row 1 menu
      const row1Group = target.querySelector('[aria-label="Docs Blog sync actions"]')!;
      const row2Group = target.querySelector('[aria-label="YT Channel sync actions"]')!;
      (row1Group.querySelector('.split-caret-btn') as HTMLButtonElement).click();
      flushSync();
      expect(target.querySelectorAll('[role="menu"]').length).toBe(1);
      (row2Group.querySelector('.split-caret-btn') as HTMLButtonElement).click();
      flushSync();
      expect(target.querySelectorAll('[role="menu"]').length).toBe(1);
      expect(row1Group.querySelector('[role="menu"]')).toBeNull();
      expect(row2Group.querySelector('[role="menu"]')).not.toBeNull();

      // Selecting row 2 primary click respects saved defaultSlicingMode ('none') instead of overriding
      (row2Group.querySelector('.split-primary-btn') as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 30));
      flushSync();
      expect(fetchCalls.find((c) => c.url === '/api/sync/src-yt-2')?.body).toEqual({
        slicing: { mode: 'none' },
        syncMode: 'new-only',
      });

      // Bulk primary click -> /api/sync { syncMode: 'new-only' } & skippedCount surfaced in toastStore
      const headerSyncGroup = target.querySelector('[aria-label="Bulk sync actions"]')!;
      (headerSyncGroup.querySelector('.split-primary-btn') as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 30));
      flushSync();
      expect(fetchCalls.find((c) => c.url === '/api/sync')?.body).toEqual({ syncMode: 'new-only' });
      expect(toastStore.toasts.some((t) => t.message.includes('2 already-synced skipped'))).toBe(true);

      // Bulk dropdown -> Full Re-sync -> /api/sync { syncMode: 'full' }
      (headerSyncGroup.querySelector('.split-caret-btn') as HTMLButtonElement).click();
      flushSync();
      (headerSyncGroup.querySelector('[data-sync-mode="full"]') as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 30));
      flushSync();
      const bulkCalls = fetchCalls.filter((c) => c.url === '/api/sync');
      expect(bulkCalls[1]?.body).toEqual({ syncMode: 'full' });

      // Per-row primary & full re-sync on row 1
      (row1Group.querySelector('.split-primary-btn') as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 30));
      flushSync();
      (row1Group.querySelector('.split-caret-btn') as HTMLButtonElement).click();
      flushSync();
      (row1Group.querySelector('[data-sync-mode="full"]') as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 30));
      flushSync();
      const rowCalls = fetchCalls.filter((c) => c.url === '/api/sync/src-web-1');
      expect(rowCalls[0]?.body).toEqual({ syncMode: 'new-only' });
      expect(rowCalls[1]?.body).toEqual({ syncMode: 'full' });
    });
  });

  describe('EditSourceModal Synced vs New visibility & YouTube clickable URLs', () => {
    it('shows Synced vs New badges for web sources, keeps modal open on Escape inside dropdown, and passes Save & Sync syncMode', async () => {
      const webSource: DataSource = {
        id: 'src-web-mix',
        name: 'Web Mixed',
        type: 'web',
        uri: JSON.stringify(['https://example.com/synced', 'https://example.com/pending']),
        tags: [],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const onCloseSpy = vi.fn();
      const fetchSpy = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/sources/${webSource.id}/sync-status`) {
          return {
            ok: true,
            json: async () => ({
              sourceId: webSource.id,
              sourceType: 'web',
              syncedDocumentCount: 2,
              hasSyncedDocuments: true,
              lastSyncedAt: null,
              knownKeys: ['https://example.com/synced'],
              items: [],
              syncedItems: [{ key: 'https://example.com/synced', uri: 'https://example.com/synced', label: 'Synced Doc', sliceCount: 2 }],
            }),
          };
        }
        if (url === `/api/sources/${webSource.id}` && init?.method === 'PATCH') {
          return { ok: true, json: async () => webSource };
        }
        if (url === `/api/sync/${webSource.id}` && init?.method === 'POST') {
          return { ok: true, json: async () => ({ sourceId: webSource.id, newCount: 1, totalFetched: 2 }) };
        }
        return { ok: true, json: async () => ({}) };
      });
      vi.stubGlobal('fetch', fetchSpy);

      comp = mount(EditSourceModal, {
        target,
        props: {
          isOpen: true,
          source: webSource,
          onClose: onCloseSpy,
          onSourceUpdated: vi.fn(),
        },
      });
      await new Promise((r) => setTimeout(r, 40));
      flushSync();

      const badges = Array.from(target.querySelectorAll('.urls-list [data-sync-status]')).map(
        (el) => el.getAttribute('data-sync-status')
      );
      expect(badges).toEqual(['synced', 'new']);

      // Pressing Escape while footer dropdown is open closes ONLY the dropdown and keeps modal open
      const modalSplit = target.querySelector('[aria-label="Modal Save and Sync sync actions"]')!;
      (modalSplit.querySelector('.split-caret-btn') as HTMLButtonElement).click();
      flushSync();
      expect(modalSplit.querySelector('[role="menu"]')).not.toBeNull();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      flushSync();
      expect(modalSplit.querySelector('[role="menu"]')).toBeNull();
      expect(onCloseSpy).not.toHaveBeenCalled();

      // Re-open dropdown and select Full Re-sync
      (modalSplit.querySelector('.split-caret-btn') as HTMLButtonElement).click();
      flushSync();
      (modalSplit.querySelector('[data-sync-mode="full"]') as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 40));
      flushSync();

      const postSyncCall = fetchSpy.mock.calls.find(([u, init]) => String(u) === `/api/sync/${webSource.id}` && init?.method === 'POST');
      expect(postSyncCall).toBeDefined();
      expect(JSON.parse(String(postSyncCall![1]?.body)).syncMode).toBe('full');
    });

    it('renders YouTube video Title + clickable URL and Synced vs New badges', async () => {
      const ytSource: DataSource = {
        id: 'src-yt-mix',
        name: 'YT Course',
        type: 'youtube',
        uri: JSON.stringify([
          { uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Lecture 1 Intro', extractionMode: 'auto' },
          { uri: 'https://www.youtube.com/watch?v=9bZkp7q19f0', title: 'Lecture 2 Advanced', extractionMode: 'auto' },
        ]),
        tags: [],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (input: string) => {
          const url = String(input);
          if (url === `/api/sources/${ytSource.id}/sync-status`) {
            return {
              ok: true,
              json: async () => ({
                sourceId: ytSource.id,
                sourceType: 'youtube',
                syncedDocumentCount: 1,
                hasSyncedDocuments: true,
                lastSyncedAt: null,
                knownKeys: ['dQw4w9WgXcQ'],
                items: [],
                syncedItems: [{ key: 'dQw4w9WgXcQ', uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', label: 'Lecture 1 Intro', sliceCount: 1 }],
              }),
            };
          }
          return { ok: true, json: async () => ({ keys: {} }) };
        })
      );

      comp = mount(EditSourceModal, {
        target,
        props: {
          isOpen: true,
          source: ytSource,
          onClose: vi.fn(),
          onSourceUpdated: vi.fn(),
        },
      });
      await new Promise((r) => setTimeout(r, 40));
      flushSync();

      const titles = Array.from(target.querySelectorAll('.media-items-list .item-title-display')).map((el) => el.textContent);
      expect(titles).toEqual(['Lecture 1 Intro', 'Lecture 2 Advanced']);

      const links = Array.from(target.querySelectorAll('.media-items-list a.item-uri-link')) as HTMLAnchorElement[];
      expect(links.length).toBe(2);
      expect(links[0].getAttribute('href')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(links[1].getAttribute('href')).toBe('https://www.youtube.com/watch?v=9bZkp7q19f0');

      const badges = Array.from(target.querySelectorAll('.media-items-list [data-sync-status]')).map(
        (el) => el.getAttribute('data-sync-status')
      );
      expect(badges).toEqual(['synced', 'new']);
    });

    it('renders Synced/New cleanly for multi-file local sources, zero-doc rss, >25 preview truncation, and sync-status fetch error', async () => {
      // 1. Multi-file local source
      const multiLocal: DataSource = {
        id: 'src-local-multi',
        name: 'Notes Bundle',
        type: 'local',
        uri: JSON.stringify(['/notes/a.md', '/notes/b.md']),
        tags: [],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (input: string) => {
          if (String(input) === `/api/sources/${multiLocal.id}/sync-status`) {
            return {
              ok: true,
              json: async () => ({
                sourceId: multiLocal.id,
                sourceType: 'local',
                syncedDocumentCount: 1,
                hasSyncedDocuments: true,
                lastSyncedAt: null,
                knownKeys: ['/notes/a.md'],
                items: [],
                syncedItems: [{ key: '/notes/a.md', uri: '/notes/a.md', label: 'Notes A', sliceCount: 1 }],
              }),
            };
          }
          return { ok: true, json: async () => ({ keys: {} }) };
        })
      );

      comp = mount(EditSourceModal, {
        target,
        props: {
          isOpen: true,
          source: multiLocal,
          onClose: vi.fn(),
          onSourceUpdated: vi.fn(),
        },
      });
      await new Promise((r) => setTimeout(r, 40));
      flushSync();

      const localBadges = Array.from(target.querySelectorAll('.local-files-status-list [data-sync-status]')).map(
        (el) => el.getAttribute('data-sync-status')
      );
      expect(localBadges).toEqual(['synced', 'new']);

      unmount(comp);
      comp = null;

      // 2. Notion source with 27 synced items (verifying truncation)
      const syncedNotion: DataSource = {
        id: 'src-notion-big',
        name: 'Team Wiki',
        type: 'notion',
        uri: 'https://www.notion.so/Wiki-1234567890abcdef1234567890abcdef',
        tags: [],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const manyItems = Array.from({ length: 27 }, (_, i) => ({
        key: `page-${i}`,
        uri: `https://www.notion.so/page-${i}`,
        label: `Wiki Page ${i + 1}`,
        sliceCount: 1,
      }));
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (input: string) => {
          if (String(input) === `/api/sources/${syncedNotion.id}/sync-status`) {
            return {
              ok: true,
              json: async () => ({
                sourceId: syncedNotion.id,
                sourceType: 'notion',
                syncedDocumentCount: 27,
                hasSyncedDocuments: true,
                lastSyncedAt: new Date().toISOString(),
                knownKeys: ['1234567890abcdef1234567890abcdef'],
                items: [{ key: syncedNotion.uri, uri: syncedNotion.uri, label: syncedNotion.uri, status: 'synced' }],
                syncedItems: manyItems,
              }),
            };
          }
          return { ok: true, json: async () => ({ keys: {} }) };
        })
      );

      comp = mount(EditSourceModal, {
        target,
        props: {
          isOpen: true,
          source: syncedNotion,
          onClose: vi.fn(),
          onSourceUpdated: vi.fn(),
        },
      });
      await new Promise((r) => setTimeout(r, 40));
      flushSync();

      expect(target.querySelector('.label-with-status [data-sync-status]')?.getAttribute('data-sync-status')).toBe('synced');
      expect(target.querySelectorAll('.synced-items-preview .synced-preview-row').length).toBe(25);
      expect(target.querySelector('[data-testid="edit-sync-status-panel"]')?.textContent).toContain('+2 more synced item(s)');

      unmount(comp);
      comp = null;

      // 3. Error fetching sync-status shows unavailable notice without false New badge
      const zeroRss: DataSource = {
        id: 'src-rss-err',
        name: 'Err Feed',
        type: 'rss',
        uri: 'https://news.example.com/feed.xml',
        tags: [],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (input: string) => {
          if (String(input) === `/api/sources/${zeroRss.id}/sync-status`) {
            return { ok: false, json: async () => ({ error: 'Server error' }) };
          }
          return { ok: true, json: async () => ({ keys: {} }) };
        })
      );

      comp = mount(EditSourceModal, {
        target,
        props: {
          isOpen: true,
          source: zeroRss,
          onClose: vi.fn(),
          onSourceUpdated: vi.fn(),
        },
      });
      await new Promise((r) => setTimeout(r, 40));
      flushSync();

      expect(target.querySelector('[data-testid="edit-sync-status-panel"]')?.textContent).toContain('Sync status unavailable right now');
      expect(target.querySelector('.field-label-row [data-sync-status]')).toBeNull();
    });
  });
});
