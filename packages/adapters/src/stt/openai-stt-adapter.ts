import {
  type SpeechToTextPort,
  type SttTranscriptionInput,
  type SttTranscriptionResult,
  type TranscriptCue,
} from "@flashcard-master/core";
import {
  AudioTrimmer,
  type TrimmedAudioSegment,
  assertSttHttpResponse,
  buildFallbackSingleCue,
  isLocalHttpUrl,
  loadSttAudioBuffer,
  parseRawTranscriptCues,
  roundSttSeconds,
  withTimeoutSignal,
  wrapSttNetworkError,
} from "../media/audio-trimmer.js";

export interface OpenAiSttConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  customFetch?: typeof fetch;
  maxFileBytes?: number;
  audioTrimmer?: AudioTrimmer;
}

export class OpenAiSttAdapter implements SpeechToTextPort {
  readonly provider = "openai" as const;
  readonly model = "whisper-1" as const;

  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly maxFileBytes: number;
  private readonly audioTrimmer?: AudioTrimmer;
  private readonly activeTrimPaths = new Set<string>();

  constructor(config: OpenAiSttConfig = {}) {
    this.apiKey = config.apiKey?.trim() || undefined;
    this.baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? 300_000;
    this.fetchFn = config.customFetch ?? globalThis.fetch;
    this.maxFileBytes = config.maxFileBytes ?? 24 * 1024 * 1024;
    this.audioTrimmer = config.audioTrimmer;
  }

  private assertConfigured(): void {
    if (!this.apiKey && !isLocalHttpUrl(this.baseUrl)) {
      throw new Error(
        "[openai-stt] OpenAI API key is required for OpenAI Speech-to-Text. Set OPENAI_API_KEY or configure it in Settings > Integrations."
      );
    }
  }

  async transcribe(input: SttTranscriptionInput): Promise<SttTranscriptionResult> {
    this.assertConfigured();
    const { buffer, filename, mimeType } = await loadSttAudioBuffer(input);
    const offset = input.timestampOffsetSeconds ?? 0;

    if (
      this.activeTrimPaths.size === 0 &&
      buffer.byteLength > this.maxFileBytes &&
      input.audioPath &&
      this.audioTrimmer
    ) {
      this.activeTrimPaths.add(input.audioPath);
      try {
        const trimmed = await this.audioTrimmer.transcribeWithTrimming(this, input.audioPath, {
          language: input.language,
          prompt: input.prompt,
          maxChunkBytes: this.maxFileBytes,
          signal: input.signal,
        });
        return offset
          ? { ...trimmed, cues: AudioTrimmer.offsetCues(trimmed.cues, offset) }
          : trimmed;
      } finally {
        this.activeTrimPaths.delete(input.audioPath);
      }
    }

    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);
    formData.append("model", this.model);
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    if (input.language?.trim()) {
      formData.append("language", input.language.trim());
    }
    if (input.prompt?.trim()) {
      formData.append("prompt", input.prompt.trim());
    }

    const timeout = withTimeoutSignal(this.timeoutMs, input.signal);

    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const response = await this.fetchFn(`${this.baseUrl}/audio/transcriptions`, {
        method: "POST",
        signal: timeout.signal,
        headers,
        body: formData,
      });

      await assertSttHttpResponse(
        "openai-stt",
        response,
        "Invalid OpenAI API key or insufficient permissions."
      );

      const json = (await response.json()) as Record<string, unknown>;
      const duration =
        typeof json.duration === "number" && Number.isFinite(json.duration)
          ? roundSttSeconds(json.duration)
          : undefined;
      const rawText = typeof json.text === "string" ? json.text.replace(/\s+/g, " ").trim() : "";

      let cues = parseRawTranscriptCues(json.segments, offset);
      if (cues.length === 0 && rawText) {
        cues = buildFallbackSingleCue(rawText, offset, duration);
      }

      const text = rawText || cues.map((c) => c.text).join(" ").trim();
      const language =
        typeof json.language === "string" && json.language.trim()
          ? json.language.trim()
          : input.language;

      return {
        provider: this.provider,
        cues,
        text,
        language,
        durationSeconds:
          duration ?? (cues.length > 0 ? roundSttSeconds(cues[cues.length - 1].endSeconds - offset) : undefined),
      };
    } catch (err) {
      throw wrapSttNetworkError("openai-stt", err, timeout.didTimeout(), this.timeoutMs);
    } finally {
      timeout.cleanup();
    }
  }

  /**
   * Transcribes pre-trimmed or chunked segments sequentially, offsets cue timestamps by each
   * segment's `startSeconds`, and merges them into a unified transcript.
   */
  async transcribeSegments(
    segments: TrimmedAudioSegment[],
    options?: { language?: string; prompt?: string; signal?: AbortSignal }
  ): Promise<SttTranscriptionResult> {
    const mergedCues: TranscriptCue[] = [];
    const textParts: string[] = [];
    let detectedLanguage: string | undefined;
    let totalDuration = 0;

    for (const segment of segments) {
      const res = await this.transcribe({
        audioPath: segment.filePath,
        language: options?.language,
        prompt: options?.prompt,
        signal: options?.signal,
      });

      mergedCues.push(...AudioTrimmer.offsetCues(res.cues, segment.startSeconds));
      const clean = res.text.trim();
      if (clean) textParts.push(clean);
      if (!detectedLanguage && res.language) detectedLanguage = res.language;
      totalDuration += segment.durationSeconds ?? res.durationSeconds ?? 0;
    }

    return {
      provider: this.provider,
      cues: mergedCues,
      text: textParts.join(" ").replace(/\s+/g, " ").trim(),
      language: detectedLanguage,
      durationSeconds: totalDuration > 0 ? roundSttSeconds(totalDuration) : undefined,
    };
  }
}

