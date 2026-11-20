// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SplitSyncButton from '../client/src/components/SplitSyncButton.svelte';
import SourcesView from '../client/src/views/SourcesView.svelte';
import EditSourceModal from '../client/src/components/EditSourceModal.svelte';
import AddSourceModal from '../client/src/components/AddSourceModal.svelte';
import MediaItemListEditor from '../client/src/components/MediaItemListEditor.svelte';
import GenerateStudio from '../client/src/views/GenerateStudio.svelte';
import { sourcesStore } from '../client/src/stores/sourcesStore.svelte.js';
import { generateStore } from '../client/src/stores/generateStore.svelte.js';
import { taskStore } from '../client/src/stores/taskStore.svelte.js';
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

    it('reloads SourcesView when SSE job_completed fires and auto-upgrades Save & Sync to Full Re-sync on dirty slicing config (Action Item 4)', async () => {
      const mediaSrc: DataSource = {
        id: 'src-yt-dirty',
        name: 'Talk Series',
        type: 'youtube',
        uri: JSON.stringify([{ uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Talk 1', extractionMode: 'auto' }]),
        tags: [],
        isActive: true,
        defaultSlicingMode: 'chapters',
        defaultIntervalMinutes: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let listCalls = 0;
      let lastSyncPayload: any = null;
      const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/sources' && (!init?.method || init.method === 'GET')) {
          listCalls += 1;
          return { ok: true, json: async () => [mediaSrc] };
        }
        if (url === `/api/sources/${mediaSrc.id}/sync-status`) {
          return {
            ok: true,
            json: async () => ({
              sourceId: mediaSrc.id,
              sourceType: 'youtube',
              syncedDocumentCount: 2,
              hasSyncedDocuments: true,
              lastSyncedAt: new Date().toISOString(),
              knownKeys: ['dQw4w9WgXcQ'],
              items: [],
              syncedItems: [],
            }),
          };
        }
        if (url === `/api/sources/${mediaSrc.id}` && init?.method === 'PATCH') {
          return { ok: true, json: async () => ({ ...mediaSrc, defaultSlicingMode: 'none', defaultIntervalMinutes: null }) };
        }
        if (url === `/api/sync/${mediaSrc.id}` && init?.method === 'POST') {
          lastSyncPayload = JSON.parse(String(init.body));
          return { ok: true, json: async () => ({ success: true, jobId: 'job-dirty-full' }) };
        }
        return { ok: true, json: async () => ({ keys: {} }) };
      });
      vi.stubGlobal('fetch', fetchMock);

      comp = mount(SourcesView, { target });
      await new Promise((r) => setTimeout(r, 40));
      flushSync();
      const initialLoads = listCalls;
      (taskStore as any).notifyJobCompleted({
        id: 'job-sse-refresh',
        type: 'sync_source',
        status: 'completed',
        title: 'Sync',
        metadata: { sourceId: mediaSrc.id },
      });
      await new Promise((r) => setTimeout(r, 30));
      expect(listCalls).toBeGreaterThan(initialLoads);

      unmount(comp);
      comp = null;

      comp = mount(EditSourceModal, {
        target,
        props: {
          isOpen: true,
          source: mediaSrc,
          onClose: vi.fn(),
          onSourceUpdated: vi.fn(),
        },
      });
      await new Promise((r) => setTimeout(r, 50));
      flushSync();

      const select = target.querySelector('#edit-media-slicing') as HTMLSelectElement;
      expect(select).not.toBeNull();
      select.value = 'none';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      flushSync();

      const primarySyncBtn = target.querySelector('.modal-footer .split-primary-btn') as HTMLButtonElement;
      expect(primarySyncBtn.textContent).toContain('Save & Full Re-sync');
      primarySyncBtn.click();
      await new Promise((r) => setTimeout(r, 50));
      expect(lastSyncPayload?.syncMode).toBe('full');
    });

    it('resets AddSourceModal inputs on type switch and keys MediaItemListEditor items stably across removals', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ keys: {} }) }));
      comp = mount(AddSourceModal, {
        target,
        props: {
          isOpen: true,
          onClose: vi.fn(),
          onSourceCreated: vi.fn(),
        },
      });
      flushSync();
      const uriInput = target.querySelector('#src-uri') as HTMLInputElement;
      uriInput.value = 'https://example.com/feed.xml';
      uriInput.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();

      const webRadio = target.querySelector('input[name="sourceType"][value="web"]') as HTMLInputElement;
      webRadio.click();
      flushSync();
      const rssRadio = target.querySelector('input[name="sourceType"][value="rss"]') as HTMLInputElement;
      rssRadio.click();
      flushSync();
      expect((target.querySelector('#src-uri') as HTMLInputElement).value).toBe('');

      unmount(comp);
      comp = null;

      comp = mount(MediaItemListEditor, {
        target,
        props: {
          sourceType: 'audio',
          items: [
            { uri: '/audio/first.mp3', title: 'First', extractionMode: 'stt' },
            { uri: '/audio/second.mp3', title: 'Second', extractionMode: 'subtitles' },
          ],
        },
      });
      flushSync();
      const firstRemove = target.querySelectorAll('.btn-remove-item')[0] as HTMLButtonElement;
      firstRemove.click();
      flushSync();
      const titles = Array.from(target.querySelectorAll('input[placeholder="Default from file/video metadata"]')).map(
        (el) => (el as HTMLInputElement).value
      );
      expect(titles).toEqual(['Second']);
    });

    it('prunes deleted docIds in GenerateStudio after Full Re-sync, surfaces warning toast on completed_with_warnings, and tracks AddSourceModal jobId (Actions 4 & 5)', async () => {
      const studioSrc: DataSource = {
        id: 'src-studio',
        name: 'Studio Book',
        type: 'local',
        uri: '/books/guide.pdf',
        tags: [],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      let docPhase = 1;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (input: string) => {
          const url = String(input);
          if (url === '/api/sources') return { ok: true, json: async () => [studioSrc] };
          if (url === `/api/sources/${studioSrc.id}/documents`) {
            return {
              ok: true,
              json: async () => ({
                documents: docPhase === 1
                  ? [{ id: 'doc-old', sourceId: studioSrc.id, title: 'Old Slice', wordCount: 100 }]
                  : [{ id: 'doc-new', sourceId: studioSrc.id, title: 'New Slice', wordCount: 120 }],
                total: 1,
              }),
            };
          }
          return { ok: true, json: async () => ({ settings: {} }) };
        })
      );

      generateStore.selectedDocIds = { 'doc-old': true };
      comp = mount(GenerateStudio, { target });
      await new Promise((r) => setTimeout(r, 50));
      flushSync();
      expect(generateStore.selectedDocIds['doc-old']).toBe(true);

      docPhase = 2;
      (taskStore as any).notifyJobCompleted({
        id: 'job-resync-1',
        type: 'sync_source',
        status: 'completed_with_warnings',
        title: 'Re-sync',
        metadata: { sourceId: studioSrc.id },
      });
      await new Promise((r) => setTimeout(r, 50));
      flushSync();
      expect(generateStore.selectedDocIds['doc-old']).toBeUndefined();

      unmount(comp);
      comp = null;

      // Verify taskStore completed_with_warnings on sync_source triggers warning toast rather than success
      toastStore.toasts = [];
      let listenersAttached = false;
      class FakeEventSource {
        handlers: Record<string, (e: any) => void> = {};
        addEventListener(type: string, cb: (e: any) => void) {
          this.handlers[type] = cb;
          listenersAttached = true;
        }
        close() {}
      }
      const fakeEs = new FakeEventSource();
      vi.stubGlobal('EventSource', vi.fn(() => fakeEs));
      taskStore.init();
      expect(listenersAttached).toBe(true);
      sourcesStore.setSyncing('src-warn', true, 'job-warn-1');
      fakeEs.handlers['job_completed']?.({
        data: JSON.stringify({
          id: 'job-warn-1',
          type: 'sync_source',
          status: 'completed_with_warnings',
          title: 'Sync Warn',
          errorMessage: '1 URL failed with HTTP 500',
          metadata: { sourceId: 'src-warn', sourceName: 'Mixed Source' },
          resultSummary: { newCount: 1, totalFetched: 2, skippedCount: 0 },
        }),
      });
      expect(toastStore.toasts.some((t) => t.type === 'warning' && t.message.includes('HTTP 500'))).toBe(true);
      expect(toastStore.toasts.some((t) => t.type === 'success')).toBe(false);
      (taskStore as any).eventSource?.close?.();

      // AddSourceModal registers immediate sync jobId in sourcesStore
      const createdId = 'src-yt-created';
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (input: string) => {
          const url = String(input);
          if (url === '/api/sources') {
            return { ok: true, json: async () => ({ id: createdId, name: 'My YT', type: 'youtube', uri: '[]', tags: [], isActive: true }) };
          }
          if (url === `/api/sync/${createdId}`) {
            return { ok: true, json: async () => ({ success: true, jobId: 'job-add-sync-99' }) };
          }
          return { ok: true, json: async () => ({ keys: {} }) };
        })
      );
      comp = mount(AddSourceModal, {
        target,
        props: { isOpen: true, onClose: vi.fn(), onSourceCreated: vi.fn() },
      });
      flushSync();
      (target.querySelector('#src-name') as HTMLInputElement).value = 'My RSS';
      (target.querySelector('#src-name') as HTMLInputElement).dispatchEvent(new Event('input', { bubbles: true }));
      (target.querySelector('#src-uri') as HTMLInputElement).value = 'https://example.com/rss.xml';
      (target.querySelector('#src-uri') as HTMLInputElement).dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      (target.querySelector('form.modal-form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 50));
      expect(sourcesStore.activeSyncJobIds[createdId]).toBe('job-add-sync-99');
    });
  });
});
