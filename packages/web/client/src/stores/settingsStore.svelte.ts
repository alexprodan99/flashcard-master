import type {
  SecretProvider,
  KeySource,
  ProviderKeyStatus,
  ProviderVerificationResult,
} from '../lib/types.js';
import {
  fetchSettingsKeys,
  saveSettingsKey,
  deleteSettingsKey,
  testSettingsKey,
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

  async loadKeys(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const data = await fetchSettingsKeys();
      if (data && data.keys) {
        this.keys = { ...createInitialKeys(), ...data.keys };
      }
    } catch (err: any) {
      this.error = err.message || 'Failed to load settings';
    } finally {
      this.loading = false;
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
