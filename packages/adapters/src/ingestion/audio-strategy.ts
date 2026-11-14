import type {
  CleanTextDocument,
  DataSource,
  IngestionOptions,
  IngestionStrategy,
  RawDocument,
  SyncState,
} from "@flashcard-master/core";
import {
  AUDIO_EXTENSIONS,
  MediaTranscriptResolver,
  type MediaTranscriptResolverOptions,
} from "./media-transcript-resolver.js";

export type AudioIngestionStrategyOptions = MediaTranscriptResolverOptions & {
  resolver?: MediaTranscriptResolver;
};

/**
 * Ingestion strategy for dedicated `audio` data sources (.mp3, .wav, .m4a, .ogg, .flac, and .srt/.vtt).
 */
export class AudioIngestionStrategy implements IngestionStrategy {
  readonly type = "audio" as const;
  private readonly resolver: MediaTranscriptResolver;

  constructor(options: AudioIngestionStrategyOptions | MediaTranscriptResolver = {}) {
    if (options instanceof MediaTranscriptResolver) {
      this.resolver = options;
    } else {
      this.resolver = options.resolver ?? new MediaTranscriptResolver(options);
    }
  }

  async fetch(
    source: DataSource,
    _lastSync?: SyncState,
    options?: IngestionOptions
  ): Promise<RawDocument[]> {
    return this.resolver.resolveSourceItems(source.id, source.uri, {
      mediaKind: "audio",
      allowedExtensions: AUDIO_EXTENSIONS,
      ingestionOptions: options,
    });
  }

  extractCleanText(raw: RawDocument): CleanTextDocument {
    return this.resolver.extractCleanText(raw);
  }
}

