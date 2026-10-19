import type {
  SecretProvider,
  KeySource,
  ProviderKeyStatus,
  ProviderVerificationResult,
  GeneralSettings,
  GeneralSettingsResponse,
  SettingSource,
  AnkiTestResult,
} from '../lib/types.js';
import {
  fetchSettingsKeys,
  saveSettingsKey,
  deleteSettingsKey,
  testSettingsKey,
  fetchLoggingSettings,
  updateLoggingSettings,
  fetchGeneralSettings,
  updateGeneralSettings,
  testAnkiConnect,
} from '../lib/api.js';
import { toastStore } from './toastStore.svelte.js';

export const ALL_SECRET_PROVIDERS: SecretProvider[] = [
  'openai',
  'anthropic',
  'gemini',
  'ollama',
  'notion',
];

function createInitialKeys(): Record<SecretProvider, ProviderKeyStatus> {
  return {
    openai: { provider: 'openai', isConfigured: false, maskedValue: '', source: 'none', endpoint: null },
    anthropic: { provider: 'anthropic', isConfigured: false, maskedValue: '', source: 'none', endpoint: null },
    gemini: { provider: 'gemini', isConfigured: false, maskedValue: '', source: 'none', endpoint: null },
    ollama: { provider: 'ollama', isConfigured: false, maskedValue: '', source: 'none', endpoint: null },
    notion: { provider: 'notion', isConfigured: false, maskedValue: '', source: 'none', endpoint: null },
  };
}

function createInitialGeneralSettings(): GeneralSettings {
  return {
    ankiconnectUrl: 'http://127.0.0.1:8765',
    ankiconnectApiKey: '',
    ankiconnectTimeoutMs: 3000,
    defaultAiProvider: 'ollama',
    defaultAiModel: 'phi4-mini',
    defaultPersona: 'socratic-mentor',
    defaultDifficulty: 'intermediate',
    defaultCardLimit: 5,
    defaultGroundingEnforced: true,
    maxGenerationWorkers: 2,
    maxSyncWorkers: 2,
    maxExportWorkers: 2,
    workerTimeoutMinutes: 15,
    defaultSlicingMode: 'outline',
    defaultPageBudget: 10,
    epubDefaultAuthor: 'Flashcard Master',
    epubDefaultPublisher: 'Flashcard Master Studio',
  };
}

function createInitialBooleans(): Record<SecretProvider, boolean> {
  return {
    openai: false,
    anthropic: false,
    gemini: false,
    ollama: false,
    notion: false,
  };
}

function createInitialResults(): Record<SecretProvider, ProviderVerificationResult | null> {
  return {
    openai: null,
    anthropic: null,
    gemini: null,
    ollama: null,
    notion: null,
  };
}

export class SettingsStore {
  keys = $state<Record<SecretProvider, ProviderKeyStatus>>(createInitialKeys());
  loading = $state(false);
  error = $state<string | null>(null);
  savingProvider = $state<Record<SecretProvider, boolean>>(createInitialBooleans());
  deletingProvider = $state<Record<SecretProvider, boolean>>(createInitialBooleans());
  testingProvider = $state<Record<SecretProvider, boolean>>(createInitialBooleans());
  testResults = $state<Record<SecretProvider, ProviderVerificationResult | null>>(createInitialResults());
  hasLoaded = $state(false);
  verbose = $state(false);
  logLevel = $state<'debug' | 'info' | 'warn' | 'error'>('info');
  savingLogging = $state(false);

  // General Settings & Integrations
  general = $state<GeneralSettings>(createInitialGeneralSettings());
  generalSources = $state<Record<string, SettingSource>>({});
  maskedAnkiKey = $state('');
  loadingGeneral = $state(false);
  savingGeneral = $state(false);
  testingAnki = $state(false);
  ankiTestResult = $state<AnkiTestResult | null>(null);

  async loadKeys(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const data = await fetchSettingsKeys();
      if (data && data.keys) {
        this.keys = { ...createInitialKeys(), ...data.keys };
      }
      await this.loadLogging();
      await this.loadGeneral();
    } catch (err: any) {
      this.error = err.message || 'Failed to load settings';
    } finally {
      this.loading = false;
      this.hasLoaded = true;
    }
  }

  async loadGeneral(): Promise<void> {
    this.loadingGeneral = true;
    try {
      const data = await fetchGeneralSettings();
      if (data && data.settings) {
        this.general = { ...createInitialGeneralSettings(), ...data.settings };
        this.generalSources = data.sources || {};
        this.maskedAnkiKey = data.maskedApiKey || '';
      }
    } catch (err: any) {
      console.error('Failed to load general settings:', err);
    } finally {
      this.loadingGeneral = false;
    }
  }

  async saveGeneral(updates: Partial<GeneralSettings>): Promise<void> {
    this.savingGeneral = true;
    try {
      const res = await updateGeneralSettings(updates);
      if (res && res.settings) {
        this.general = { ...this.general, ...res.settings };
        this.generalSources = res.sources || {};
        this.maskedAnkiKey = res.maskedApiKey || '';
      }
      toastStore.success('Settings saved successfully.');
    } catch (err: any) {
      toastStore.error(err.message || 'Failed to save settings');
      throw err;
    } finally {
      this.savingGeneral = false;
    }
  }

  async testAnki(options?: { endpointUrl?: string; apiKey?: string; timeoutMs?: number }): Promise<AnkiTestResult> {
    this.testingAnki = true;
    this.ankiTestResult = null;
    try {
      const res = await testAnkiConnect(options);
      this.ankiTestResult = res;
      if (res.online) {
        toastStore.success(`✓ AnkiConnect Online (v${res.version ?? 6})${res.latencyMs !== undefined ? ` • ${res.latencyMs}ms` : ''}`);
      } else {
        toastStore.error(`✗ AnkiConnect Offline: ${res.error || 'Connection failed'}`);
      }
      return res;
    } catch (err: any) {
      const failRes: AnkiTestResult = {
        online: false,
        error: err.message || 'Connection test failed',
      };
      this.ankiTestResult = failRes;
      toastStore.error(`✗ AnkiConnect: ${failRes.error}`);
      return failRes;
    } finally {
      this.testingAnki = false;
    }
  }

  async loadLogging(): Promise<void> {
    try {
      const data = await fetchLoggingSettings();
      if (data) {
        this.verbose = data.verbose;
        this.logLevel = data.logLevel;
      }
    } catch {}
  }

  async updateLogging(payload: { verbose?: boolean; logLevel?: 'debug' | 'info' | 'warn' | 'error' }): Promise<void> {
    this.savingLogging = true;
    try {
      const res = await updateLoggingSettings(payload);
      this.verbose = res.verbose;
      this.logLevel = res.logLevel;
      toastStore.success(`Logging settings updated: Verbose ${res.verbose ? 'ON' : 'OFF'}, Level ${res.logLevel.toUpperCase()}`);
    } catch (err: any) {
      toastStore.error(err.message || 'Failed to update logging settings');
      throw err;
    } finally {
      this.savingLogging = false;
    }
  }

  async saveKey(payload: {
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
    this.savingProvider[payload.provider] = true;
    this.error = null;
    try {
      const res = await saveSettingsKey(payload);
      this.keys[payload.provider] = {
        provider: res.provider,
        isConfigured: res.isConfigured,
        maskedValue: res.maskedValue,
        source: res.source,
        endpoint: res.endpoint,
        updatedAt: new Date().toISOString(),
      };
      this.testResults[payload.provider] = null;
      toastStore.success(`Saved ${payload.provider} configuration.`);
      return res;
    } catch (err: any) {
      toastStore.error(err.message || `Failed to save ${payload.provider} configuration`);
      throw err;
    } finally {
      this.savingProvider[payload.provider] = false;
    }
  }

  async deleteKey(provider: SecretProvider): Promise<{
    success: boolean;
    provider: SecretProvider;
    isConfigured: boolean;
    source: KeySource;
    maskedValue: string;
    endpoint?: string | null;
  }> {
    this.deletingProvider[provider] = true;
    try {
      const res = await deleteSettingsKey(provider);
      this.keys[provider] = {
        provider: res.provider,
        isConfigured: res.isConfigured,
        maskedValue: res.maskedValue,
        source: res.source,
        endpoint: res.endpoint,
        updatedAt: new Date().toISOString(),
      };
      this.testResults[provider] = null;
      toastStore.info(`Cleared stored secret for ${provider}.`);
      return res;
    } catch (err: any) {
      toastStore.error(err.message || `Failed to clear secret for ${provider}`);
      throw err;
    } finally {
      this.deletingProvider[provider] = false;
    }
  }

  async testKey(payload: {
    provider: SecretProvider;
    key?: string | null;
    endpoint?: string | null;
  }): Promise<ProviderVerificationResult> {
    this.testingProvider[payload.provider] = true;
    this.testResults[payload.provider] = null;
    try {
      const result = await testSettingsKey(payload);
      this.testResults[payload.provider] = result;
      if (result.success) {
        toastStore.success(`✓ ${payload.provider}: ${result.message}`);
      } else {
        toastStore.error(`✗ ${payload.provider}: ${result.message}`);
      }
      return result;
    } catch (err: any) {
      const failureResult: ProviderVerificationResult = {
        success: false,
        message: err.message || 'Connection test request failed',
      };
      this.testResults[payload.provider] = failureResult;
      toastStore.error(`✗ ${payload.provider}: ${failureResult.message}`);
      return failureResult;
    } finally {
      this.testingProvider[payload.provider] = false;
    }
  }

  clearTestResult(provider: SecretProvider) {
    this.testResults[provider] = null;
  }
}

export const settingsStore = new SettingsStore();
