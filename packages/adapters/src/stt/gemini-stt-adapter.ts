import {
  type SpeechToTextPort,
  type SttTranscriptionInput,
  type SttTranscriptionResult,
} from "@flashcard-master/core";
import {
  assertSttHttpResponse,
  buildFallbackSingleCue,
  loadSttAudioBuffer,
  parseRawTranscriptCues,
  roundSttSeconds,
  withTimeoutSignal,
  wrapSttNetworkError,
} from "../media/audio-trimmer.js";

export interface GeminiSttConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  customFetch?: typeof fetch;
  inlineLimitBytes?: number;
}

const GEMINI_TRANSCRIPT_SCHEMA = {
  type: "OBJECT",
  properties: {
    language: { type: "STRING" },
    segments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          startSeconds: { type: "NUMBER" },
          endSeconds: { type: "NUMBER" },
          text: { type: "STRING" },
        },
        required: ["startSeconds", "endSeconds", "text"],
      },
    },
  },
  required: ["segments"],
};

export class GeminiSttAdapter implements SpeechToTextPort {
  readonly provider = "gemini" as const;
  readonly model = "gemini-3.6-flash" as const;

  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly inlineLimitBytes: number;

  constructor(config: GeminiSttConfig = {}) {
    this.apiKey = config.apiKey?.trim() || undefined;
    this.baseUrl = (config.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? 300_000;
    this.fetchFn = config.customFetch ?? globalThis.fetch;
    this.inlineLimitBytes = config.inlineLimitBytes ?? 18 * 1024 * 1024;
  }

  private assertConfigured(): string {
    if (!this.apiKey) {
      throw new Error(
        "[gemini-stt] Google Gemini API key is required for Gemini Speech-to-Text. Set GEMINI_API_KEY or configure it in Settings > Integrations."
      );
    }
    return this.apiKey;
  }

  private getApiRoot(): string {
    return this.baseUrl.replace(/\/v\d[^/]*$/, "");
  }

  private async uploadToFileApi(
    apiKey: string,
    buffer: Buffer,
    mimeType: string,
    filename: string,
    signal: AbortSignal
  ): Promise<{ fileUri: string; fileName?: string }> {
    const uploadUrl = `${this.getApiRoot()}/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`;
    const response = await this.fetchFn(uploadUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": mimeType,
        "X-Goog-Upload-Protocol": "raw",
        "X-Goog-Upload-Command": "upload, finalize",
        "X-Goog-Upload-Header-Content-Length": String(buffer.byteLength),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "X-Goog-File-Name": filename,
      },
      body: new Uint8Array(buffer),
    });

    await assertSttHttpResponse(
      "gemini-stt",
      response,
      "Invalid Google Gemini API key or forbidden File API upload."
    );

    const json = (await response.json()) as {
      file?: { uri?: string; name?: string };
      uri?: string;
      name?: string;
    };
    const fileUri = json.file?.uri ?? json.uri;
    const fileName = json.file?.name ?? json.name;

    if (!fileUri) {
      throw new Error("[gemini-stt] Gemini File API upload did not return a file URI.");
    }

    return { fileUri, fileName };
  }

  private async deleteRemoteFile(apiKey: string, fileName: string): Promise<void> {
    try {
      const normalizedName = fileName.startsWith("files/") ? fileName : `files/${fileName}`;
      await this.fetchFn(
        `${this.baseUrl}/${normalizedName}?key=${encodeURIComponent(apiKey)}`,
        { method: "DELETE" }
      );
    } catch {
      // Best-effort remote file cleanup
    }
  }

  private buildInstruction(input: SttTranscriptionInput): string {
    const hints: string[] = [];
    if (input.language?.trim()) {
      hints.push(`Primary spoken language hint: ${input.language.trim()}.`);
    }
    if (input.prompt?.trim()) {
      hints.push(`Domain vocabulary/context: ${input.prompt.trim()}`);
    }

    return [
      "Transcribe the spoken audio verbatim into accurate timestamped JSON segments.",
      "Preserve exact wording without summarizing or paraphrasing.",
      "Return numeric startSeconds and endSeconds offsets relative to the beginning of this audio file.",
      ...hints,
    ].join(" ");
  }

  async transcribe(input: SttTranscriptionInput): Promise<SttTranscriptionResult> {
    const apiKey = this.assertConfigured();
    const { buffer, filename, mimeType } = await loadSttAudioBuffer(input);
    const offset = input.timestampOffsetSeconds ?? 0;

    const timeout = withTimeoutSignal(this.timeoutMs, input.signal);
    let uploadedFileName: string | undefined;

    try {
      const audioPart =
        buffer.byteLength <= this.inlineLimitBytes
          ? {
              inlineData: {
                mimeType,
                data: buffer.toString("base64"),
              },
            }
          : await (async () => {
              const uploaded = await this.uploadToFileApi(
                apiKey,
                buffer,
                mimeType,
                filename,
                timeout.signal
              );
              uploadedFileName = uploaded.fileName;
              return {
                fileData: {
                  mimeType,
                  fileUri: uploaded.fileUri,
                },
              };
            })();

      const generateUrl = `${this.baseUrl}/models/${this.model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await this.fetchFn(generateUrl, {
        method: "POST",
        signal: timeout.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: this.buildInstruction(input) },
                audioPart,
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: GEMINI_TRANSCRIPT_SCHEMA,
            temperature: 0.1,
          },
        }),
      });

      await assertSttHttpResponse(
        "gemini-stt",
        response,
        "Invalid Google Gemini API key or forbidden request."
      );

      const json = (await response.json()) as Record<string, any>;
      if (json.promptFeedback?.blockReason) {
        throw new Error(`[gemini-stt] Prompt blocked by Gemini policy: ${json.promptFeedback.blockReason}`);
      }

      const candidate = json.candidates?.[0];
      if (!candidate) {
        throw new Error("[gemini-stt] No candidate response returned from Gemini.");
      }

      if (
        candidate.finishReason === "SAFETY" ||
        candidate.finishReason === "RECITATION" ||
        candidate.finishReason === "BLOCKLIST" ||
        candidate.finishReason === "PROHIBITED_CONTENT" ||
        candidate.finishReason === "SPII"
      ) {
        throw new Error(`[gemini-stt] Transcription blocked by Gemini policy: ${candidate.finishReason}`);
      }

      const parts = candidate.content?.parts;
      if (!Array.isArray(parts) || parts.length === 0) {
        throw new Error("[gemini-stt] Empty content parts returned from Gemini.");
      }

      const textParts = parts.filter((p: any) => !p?.thought && typeof p?.text === "string");
      if (textParts.length === 0) {
        throw new Error("[gemini-stt] No text content returned in Gemini STT response.");
      }

      const rawText = textParts
        .map((p: any) => p.text)
        .join("")
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");

      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[gemini-stt] Failed to parse structured JSON transcript: ${msg}`);
      }

      const rawSegments = Array.isArray(parsed) ? parsed : parsed?.segments;
      let cues = parseRawTranscriptCues(rawSegments, offset);

      const parsedPlainText =
        typeof parsed?.text === "string" ? parsed.text.replace(/\s+/g, " ").trim() : "";
      if (cues.length === 0 && parsedPlainText) {
        cues = buildFallbackSingleCue(parsedPlainText, offset);
      }

      const text =
        parsedPlainText || cues.map((c) => c.text).join(" ").trim();
      const language =
        typeof parsed?.language === "string" && parsed.language.trim()
          ? parsed.language.trim()
          : input.language;

      const durationSeconds =
        cues.length > 0
          ? roundSttSeconds(Math.max(0, cues[cues.length - 1].endSeconds - offset))
          : undefined;

      return {
        provider: this.provider,
        cues,
        text,
        language,
        durationSeconds: durationSeconds && durationSeconds > 0 ? durationSeconds : undefined,
      };
    } catch (err) {
      throw wrapSttNetworkError("gemini-stt", err, timeout.didTimeout(), this.timeoutMs);
    } finally {
      timeout.cleanup();
      if (uploadedFileName) {
        await this.deleteRemoteFile(apiKey, uploadedFileName);
      }
    }
  }
}

