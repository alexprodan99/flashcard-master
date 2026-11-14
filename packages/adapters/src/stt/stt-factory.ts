import {
  type SettingsService,
  type SpeechToTextPort,
  type SttProvider,
  SttProviderSchema,
} from "@flashcard-master/core";
import { AudioTrimmer, type CommandRunner } from "../media/audio-trimmer.js";
import { OpenAiSttAdapter } from "./openai-stt-adapter.js";
import { GeminiSttAdapter } from "./gemini-stt-adapter.js";
import { LocalWhisperSttAdapter } from "./local-whisper-stt-adapter.js";

export interface SttAdapterConfig {
  provider: SttProvider;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  customFetch?: typeof fetch;
  /** Local Whisper CLI binary path (for whisper-local). */
  binaryPath?: string;
  /** Local Whisper HTTP endpoint or custom binary path (for whisper-local). */
  endpoint?: string;
  /** Local Whisper model tier (tiny | base | small | medium | large-v3). */
  localWhisperModel?: string;
  commandRunner?: CommandRunner;
  audioTrimmer?: AudioTrimmer;
  maxFileBytes?: number;
  inlineLimitBytes?: number;
}

export function createSttAdapter(config: SttAdapterConfig): SpeechToTextPort {
  const provider = SttProviderSchema.parse(config.provider);

  switch (provider) {
    case "openai":
      return new OpenAiSttAdapter({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
        customFetch: config.customFetch,
        maxFileBytes: config.maxFileBytes,
        audioTrimmer: config.audioTrimmer,
      });

    case "gemini":
      return new GeminiSttAdapter({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
        customFetch: config.customFetch,
        inlineLimitBytes: config.inlineLimitBytes,
      });

    case "whisper-local":
      return new LocalWhisperSttAdapter({
        binaryPath: config.binaryPath,
        endpoint: config.endpoint ?? config.baseUrl,
        model: config.localWhisperModel,
        timeoutMs: config.timeoutMs,
        commandRunner: config.commandRunner,
        customFetch: config.customFetch,
      });
  }
}

export function createSttAdapterFromSettings(
  provider?: SttProvider,
  settingsService?: SettingsService,
  overrides: Partial<SttAdapterConfig> = {},
  env: NodeJS.ProcessEnv = process.env
): SpeechToTextPort {
  const rawDefaultProvider =
    provider ??
    overrides.provider ??
    settingsService?.get("default_stt_provider") ??
    env.DEFAULT_STT_PROVIDER ??
    "openai";

  const resolvedProvider = SttProviderSchema.safeParse(rawDefaultProvider).success
    ? (rawDefaultProvider as SttProvider)
    : "openai";

  if (resolvedProvider === "openai") {
    return createSttAdapter({
      ...overrides,
      provider: "openai",
      apiKey:
        overrides.apiKey ??
        settingsService?.getSecret("openai") ??
        env.OPENAI_API_KEY?.trim() ??
        undefined,
      baseUrl:
        overrides.baseUrl ??
        settingsService?.getEndpoint("openai") ??
        env.OPENAI_BASE_URL?.trim() ??
        undefined,
      audioTrimmer: overrides.audioTrimmer ?? new AudioTrimmer(),
    });
  }

  if (resolvedProvider === "gemini") {
    return createSttAdapter({
      ...overrides,
      provider: "gemini",
      apiKey:
        overrides.apiKey ??
        settingsService?.getSecret("gemini") ??
        env.GEMINI_API_KEY?.trim() ??
        undefined,
      baseUrl:
        overrides.baseUrl ??
        settingsService?.getEndpoint("gemini") ??
        env.GEMINI_BASE_URL?.trim() ??
        undefined,
    });
  }

  const endpoint =
    overrides.endpoint ??
    overrides.baseUrl ??
    settingsService?.get("local_whisper_endpoint") ??
    env.LOCAL_WHISPER_ENDPOINT?.trim() ??
    undefined;

  const binaryPath =
    overrides.binaryPath ??
    env.WHISPER_BINARY_PATH?.trim() ??
    env.WHISPER_CPP_PATH?.trim() ??
    undefined;

  const localWhisperModel =
    overrides.localWhisperModel ??
    settingsService?.get("local_whisper_model") ??
    env.LOCAL_WHISPER_MODEL?.trim() ??
    "base";

  return createSttAdapter({
    ...overrides,
    provider: "whisper-local",
    endpoint,
    binaryPath,
    localWhisperModel,
  });
}

