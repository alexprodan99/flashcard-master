import type {
  CleanTextDocument,
  DataSource,
  IngestionOptions,
  IngestionStrategy,
  RawDocument,
  SyncState,
} from "@flashcard-master/core";
import {
  MediaTranscriptResolver,
  type MediaTranscriptResolverOptions,
  VIDEO_EXTENSIONS,
} from "./media-transcript-resolver.js";

export type VideoIngestionStrategyOptions = MediaTranscriptResolverOptions & {
  resolver?: MediaTranscriptResolver;
};

/**
 * Ingestion strategy for dedicated `video` data sources (.mp4, .mkv, .webm, .mov, and .srt/.vtt),
 * supporting external sidecars, embedded subtitle streams, and pre-trimmed Speech-to-Text.
 */
export class VideoIngestionStrategy implements IngestionStrategy {
  readonly type = "video" as const;
  private readonly resolver: MediaTranscriptResolver;

  constructor(options: VideoIngestionStrategyOptions | MediaTranscriptResolver = {}) {
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
      mediaKind: "video",
      allowedExtensions: VIDEO_EXTENSIONS,
      ingestionOptions: options,
    });
  }

  extractCleanText(raw: RawDocument): CleanTextDocument {
    return this.resolver.extractCleanText(raw);
  }
}

