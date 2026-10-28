// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SettingsView from '../client/src/views/SettingsView.svelte';

describe('SettingsView Component Unit Tests (Epic 18 Action Item 2)', () => {
  let target: HTMLElement;
  let comp: any;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);

    // Stub global fetch for settings API
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/settings/keys')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            providers: [],
            keys: {
              openai: { isConfigured: true, source: 'database', maskedValue: 'sk-••••••••1234', endpoint: null },
              anthropic: { isConfigured: false, source: null, maskedValue: null, endpoint: null },
              gemini: { isConfigured: false, source: null, maskedValue: null, endpoint: null },
              ollama: { isConfigured: true, source: 'environment', maskedValue: null, endpoint: 'http://localhost:11434' },
              notion: { isConfigured: false, source: null, maskedValue: null, endpoint: null },
            },
          }),
        });
      }
      if (url.includes('/api/settings/general')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            settings: {
              defaultAiProvider: 'ollama',
              defaultAiModel: 'phi4-mini',
              ankiconnectUrl: 'http://127.0.0.1:8765',
              ankiconnectTimeoutMs: 3000,
              hasAnkiApiKey: false,
              maskedAnkiApiKey: null,
              maxGenerationWorkers: 4,
              maxSyncWorkers: 4,
              maxExportWorkers: 2,
              workerTaskTimeoutMs: 120000,
              defaultSlicingMode: 'outline',
              defaultPageBudget: 15,
              epubDefaultAuthor: 'Flashcard Master',
              epubDefaultPublisher: 'Flashcard Master Studio',
            },
            sources: {},
            maskedApiKey: null,
          }),
        });
      }
      if (url.includes('/api/settings/logging')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            verbose: false,
            logLevel: 'info',
          }),
        });
      }
      if (url.includes('/api/settings/test-anki')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            online: true,
            version: 6,
            latencyMs: 12,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }));
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

  async function mountAndWait() {
    comp = mount(SettingsView, { target });
    // Allow onMount loadData to complete
    await new Promise((r) => setTimeout(r, 50));
    flushSync();
  }

  it('renders interactive tab navigation bar with all category tabs', async () => {
    await mountAndWait();

    const tabsNav = target.querySelector('.settings-tabs-nav');
    expect(tabsNav).not.toBeNull();

    const tabAll = target.querySelector('#tab-all');
    const tabSources = target.querySelector('#tab-sources');
    const tabProviders = target.querySelector('#tab-providers');
    const tabAnki = target.querySelector('#tab-anki');
    const tabGeneral = target.querySelector('#tab-general');
    const tabWorkers = target.querySelector('#tab-workers');
    const tabLogging = target.querySelector('#tab-logging');

    expect(tabAll).not.toBeNull();
    expect(tabSources).not.toBeNull();
    expect(tabProviders).not.toBeNull();
    expect(tabAnki).not.toBeNull();
    expect(tabGeneral).not.toBeNull();
    expect(tabWorkers).not.toBeNull();
    expect(tabLogging).not.toBeNull();

    // Default active tab should be 'all'
    expect(tabAll?.getAttribute('aria-selected')).toBe('true');
    expect(tabSources?.getAttribute('aria-selected')).toBe('false');
  });

  it('switches active tabs and selectively filters rendered settings sections', async () => {
    await mountAndWait();

    // In 'all' tab, all sections are present
    expect(target.querySelector('#section-sources')).not.toBeNull();
    expect(target.querySelector('#section-providers')).not.toBeNull();
    expect(target.querySelector('#section-anki')).not.toBeNull();
    expect(target.querySelector('#section-worker-pool')).not.toBeNull();
    expect(target.querySelector('#section-logging')).not.toBeNull();

    // Click 'Data Sources' tab
    const tabSources = target.querySelector<HTMLButtonElement>('#tab-sources');
    tabSources?.click();
    flushSync();

    expect(tabSources?.getAttribute('aria-selected')).toBe('true');
    expect(target.querySelector('#section-sources')).not.toBeNull();
    expect(target.querySelector('#section-providers')).toBeNull();
    expect(target.querySelector('#section-anki')).toBeNull();
    expect(target.querySelector('#section-worker-pool')).toBeNull();

    // Click 'AI Providers' tab
    const tabProviders = target.querySelector<HTMLButtonElement>('#tab-providers');
    tabProviders?.click();
    flushSync();

    expect(tabProviders?.getAttribute('aria-selected')).toBe('true');
    expect(target.querySelector('#section-sources')).toBeNull();
    expect(target.querySelector('#section-providers')).not.toBeNull();
    expect(target.querySelector('#section-anki')).toBeNull();

    // Click 'Anki Desktop' tab
    const tabAnki = target.querySelector<HTMLButtonElement>('#tab-anki');
    tabAnki?.click();
    flushSync();

    expect(tabAnki?.getAttribute('aria-selected')).toBe('true');
    expect(target.querySelector('#section-sources')).toBeNull();
    expect(target.querySelector('#section-providers')).toBeNull();
    expect(target.querySelector('#section-anki')).not.toBeNull();

    // Click 'Worker Limits' tab
    const tabWorkers = target.querySelector<HTMLButtonElement>('#tab-workers');
    tabWorkers?.click();
    flushSync();

    expect(tabWorkers?.getAttribute('aria-selected')).toBe('true');
    expect(target.querySelector('#section-worker-pool')).not.toBeNull();
    expect(target.querySelector('#section-sources')).toBeNull();

    // Click 'All Settings' tab to restore full view
    const tabAll = target.querySelector<HTMLButtonElement>('#tab-all');
    tabAll?.click();
    flushSync();

    expect(tabAll?.getAttribute('aria-selected')).toBe('true');
    expect(target.querySelector('#section-sources')).not.toBeNull();
    expect(target.querySelector('#section-providers')).not.toBeNull();
    expect(target.querySelector('#section-anki')).not.toBeNull();
    expect(target.querySelector('#section-worker-pool')).not.toBeNull();
  });

  it('toggles masked secret visibility when reveal button is clicked', async () => {
    await mountAndWait();

    // Find OpenAI key input and its reveal button
    const openaiKeyInput = target.querySelector<HTMLInputElement>('#key-openai');
    expect(openaiKeyInput).not.toBeNull();
    expect(openaiKeyInput?.type).toBe('password');

    const revealBtn = openaiKeyInput?.parentElement?.querySelector<HTMLButtonElement>('.reveal-btn');
    expect(revealBtn).not.toBeNull();
    expect(revealBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(revealBtn?.textContent).toContain('Show');

    // Click to reveal secret
    revealBtn?.click();
    flushSync();

    expect(openaiKeyInput?.type).toBe('text');
    expect(revealBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(revealBtn?.textContent).toContain('Hide');

    // Click again to hide secret
    revealBtn?.click();
    flushSync();

    expect(openaiKeyInput?.type).toBe('password');
    expect(revealBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(revealBtn?.textContent).toContain('Show');
  });

  it('enforces form validation and enables save button on candidate key entry', async () => {
    await mountAndWait();

    const notionCard = target.querySelector('#card-notion');
    expect(notionCard).not.toBeNull();

    const saveBtn = notionCard?.querySelector<HTMLButtonElement>('button[type="submit"]');
    const input = notionCard?.querySelector<HTMLInputElement>('#key-notion');

    // Initially save button should be disabled because candidate key is empty
    expect(saveBtn?.disabled).toBe(true);

    // Enter candidate key
    if (input) {
      input.value = 'secret_test_token_12345';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    flushSync();

    // Now save button should be enabled
    expect(saveBtn?.disabled).toBe(false);
  });
});
