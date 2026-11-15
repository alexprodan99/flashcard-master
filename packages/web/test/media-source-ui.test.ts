import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  formatSecondsToTimestamp,
  formatTimestampBadge,
  formatLocatorLabel,
  parseMediaItemsSummary,
  validateMediaItems,
} from '../client/src/lib/formatters.js';
import { createWebServer, type WebServer } from '../src/server.js';
import { WorkerExecutor } from '../src/workers/worker-executor.js';
import type { JobExecutionContext } from '../src/jobs/job-manager.js';
import {
  createDatabaseClient,
  DataSourceRepository,
  SyncStateRepository,
  FlashcardRepository,
  DocumentRepository,
  JobRepository,
  SqliteSettingsRepository,
  SettingsService,
  StrategyRegistry,
  IngestionService,
} from '@flashcard-master/core';

describe('Story 21.6: Web UI Media Source Helpers, API & Worker Progress', () => {
  describe('formatters & media validators (formatters.ts)', () => {
    it('formats seconds as MM:SS and HH:MM:SS cleanly', () => {
      expect(formatSecondsToTimestamp(0)).toBe('00:00');
      expect(formatSecondsToTimestamp(-5)).toBe('00:00');
      expect(formatSecondsToTimestamp(65)).toBe('01:05');
      expect(formatSecondsToTimestamp(3599)).toBe('59:59');
      expect(formatSecondsToTimestamp(3665)).toBe('01:01:05');
    });

    it('formats document timestamp badges across ranges and open-ended starts', () => {
      expect(formatTimestampBadge({})).toBeNull();
      expect(formatTimestampBadge({ startSeconds: null, endSeconds: null })).toBeNull();
      expect(formatTimestampBadge({ startSeconds: 120, endSeconds: 450 })).toBe('02:00 – 07:30');
      expect(formatTimestampBadge({ startSeconds: 3600, endSeconds: 4215 })).toBe('01:00:00 – 01:10:15');
      expect(formatTimestampBadge({ startSeconds: 90, endSeconds: null })).toBe('01:30');
      expect(formatTimestampBadge({ startSeconds: null, endSeconds: 300 })).toBe('05:00');
      expect(formatLocatorLabel('[04:15 - 05:00]')).toBe('⏱️ [04:15 - 05:00]');
      expect(formatLocatorLabel('Page 12')).toBe('📍 Page 12');
    });

    it('parses structured JSON media item arrays and newline/space YouTube URLs', () => {
      const jsonPayload = JSON.stringify([
        {
          uri: 'https://www.youtube.com/watch?v=abc123',
          title: 'Part 1 Intro',
          extractionMode: 'subtitles',
          sttProvider: 'openai',
          timestampRanges: [{ start: '01:00', end: '05:00', label: 'Overview' }],
        },
        {
          uri: '/tmp/lecture-2.mp3',
          extractionMode: 'stt',
          subtitlePath: '/tmp/lecture-2.srt',
          sttProvider: 'gemini',
        },
      ]);

      const parsedJson = parseMediaItemsSummary(jsonPayload, 'video');
      expect(parsedJson.isMulti).toBe(true);
      expect(parsedJson.count).toBe(2);
      expect(parsedJson.firstUri).toBe('Part 1 Intro');
      expect(parsedJson.items[0].timestampRanges).toEqual([
        { start: '01:00', end: '05:00', label: 'Overview' },
      ]);
      expect(parsedJson.items[1]).toEqual({
        uri: '/tmp/lecture-2.mp3',
        extractionMode: 'stt',
        subtitlePath: '/tmp/lecture-2.srt',
        sttProvider: 'gemini',
      });

      const multiUrlText =
        'https://www.youtube.com/watch?v=vid1\nhttps://youtu.be/vid2 https://youtube.com/shorts/vid3';
      const parsedUrls = parseMediaItemsSummary(multiUrlText, 'youtube');
      expect(parsedUrls.isMulti).toBe(true);
      expect(parsedUrls.count).toBe(3);
      expect(parsedUrls.items.map((i) => i.uri)).toEqual([
        'https://www.youtube.com/watch?v=vid1',
        'https://youtu.be/vid2',
        'https://youtube.com/shorts/vid3',
      ]);
    });

    it('validates media item lists and timestamp range syntax', () => {
      expect(validateMediaItems([], 'audio')).toContain('at least one audio item');
      expect(
        validateMediaItems(
          [{ uri: 'https://youtu.be/xyz', extractionMode: 'auto', timestampRanges: [{ start: 'bad', end: '05:00' }] }],
          'youtube'
        )
      ).toContain('MM:SS or HH:MM:SS');
      expect(
        validateMediaItems(
          [
            {
              uri: 'https://youtu.be/xyz',
              extractionMode: 'auto',
              timestampRanges: [{ start: '00:30', end: '05:45', label: 'Segment' }],
            },
          ],
          'youtube'
        )
      ).toBeNull();
    });
  });

  describe('WebServer API support for audio, video, youtube & subtitle uploads', () => {
    let server: WebServer;
    let baseUrl: string;
    let db: any;
    let tmpDir: string;
    let sourceRepo: DataSourceRepository;
    let docRepo: DocumentRepository;

    beforeEach(async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-ui-api-'));
      db = createDatabaseClient({ inMemory: true });
      sourceRepo = new DataSourceRepository(db);
      const syncRepo = new SyncStateRepository(db);
      const cardRepo = new FlashcardRepository(db);
      docRepo = new DocumentRepository(db);
      const jobRepo = new JobRepository(db);
      const settingsRepo = new SqliteSettingsRepository(db);
      const settingsService = new SettingsService(settingsRepo);
      const strategyRegistry = new StrategyRegistry();
      const ingestionService = new IngestionService(sourceRepo, syncRepo, strategyRegistry, docRepo);

      server = createWebServer({
        port: 0,
        sourceRepo,
        syncRepo,
        cardRepo,
        documentRepo: docRepo,
        jobRepo,
        ingestionService,
        strategyRegistry,
        settingsService,
        settingsRepo,
        localFilesDir: tmpDir,
      });

      const info = await server.listen();
      baseUrl = info.url;
    });

    afterEach(async () => {
      await server.close();
      db.close();
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    it('creates audio, video, and youtube sources with structured MediaSourceItem payloads', async () => {
      const youtubeItems = [
        {
          uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'Lecture Part 1',
          extractionMode: 'auto',
          sttProvider: 'openai',
          timestampRanges: [{ start: '00:10', end: '04:00', label: 'Intro' }],
        },
      ];

      const ytRes = await fetch(`${baseUrl}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'YouTube Course',
          type: 'youtube',
          uri: JSON.stringify(youtubeItems),
          tags: ['lecture', 'ai'],
        }),
      });
      expect(ytRes.status).toBe(201);
      const ytCreated = await ytRes.json();
      expect(ytCreated.type).toBe('youtube');
      expect(JSON.parse(ytCreated.uri)).toEqual(youtubeItems);

      const audioRes = await fetch(`${baseUrl}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Podcast Notes',
          type: 'audio',
          uri: JSON.stringify([{ uri: '/tmp/ep1.mp3', extractionMode: 'stt', sttProvider: 'gemini' }]),
        }),
      });
      expect(audioRes.status).toBe(201);
      expect((await audioRes.json()).type).toBe('audio');

      const videoRes = await fetch(`${baseUrl}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Workshop Video',
          type: 'video',
          uri: JSON.stringify([
            {
              uri: '/tmp/workshop.mp4',
              extractionMode: 'subtitles',
              subtitlePath: '/tmp/workshop.srt',
            },
          ]),
        }),
      });
      expect(videoRes.status).toBe(201);
      expect((await videoRes.json()).type).toBe('video');
    });

    it('uploads binary media (.mp3, .mp4) and UTF-8 subtitle (.srt, .vtt) files', async () => {
      const mp3Res = await fetch(`${baseUrl}/api/sources/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'voice-memo.mp3',
          encoding: 'base64',
          content: Buffer.from('ID3fake-mp3-bytes').toString('base64'),
        }),
      });
      expect(mp3Res.status).toBe(200);
      const mp3Body = await mp3Res.json();
      expect(mp3Body.filename).toBe('voice-memo.mp3');
      expect(fs.existsSync(mp3Body.path)).toBe(true);

      const srtText = '1\n00:00:01,000 --> 00:00:04,000\nHello flashcards!\n';
      const srtRes = await fetch(`${baseUrl}/api/sources/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'captions.srt',
          content: srtText,
        }),
      });
      expect(srtRes.status).toBe(200);
      const srtBody = await srtRes.json();
      expect(srtBody.filename).toBe('captions.srt');
      expect(fs.readFileSync(srtBody.path, 'utf-8')).toBe(srtText);

      const vttText = 'WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nSubtitle test\n';
      const vttRes = await fetch(`${baseUrl}/api/sources/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'captions.vtt',
          content: vttText,
        }),
      });
      expect(vttRes.status).toBe(200);
      const vttBody = await vttRes.json();
      expect(fs.readFileSync(vttBody.path, 'utf-8')).toBe(vttText);
    });

    it('preserves startSeconds and endSeconds in GET /api/sources/:id/documents', async () => {
      const source = sourceRepo.create({
        name: 'YT Timestamps',
        type: 'youtube',
        uri: 'https://www.youtube.com/watch?v=test123',
      });

      docRepo.upsert({
        id: 'yt-slice-1',
        sourceId: source.id,
        title: 'YouTube Video — Intro (00:00 - 05:00)',
        url: 'https://www.youtube.com/watch?v=test123&t=0s',
        textContent: '[00:00 - 00:05] Welcome to the lecture.',
        wordCount: 6,
        startSeconds: 0,
        endSeconds: 300,
      });

      const res = await fetch(`${baseUrl}/api/sources/${source.id}/documents`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.documents.length).toBe(1);
      expect(data.documents[0].startSeconds).toBe(0);
      expect(data.documents[0].endSeconds).toBe(300);
    });
  });

  describe('WorkerExecutor granular media stage progress forwarding', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-media-stage-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {}
    });

    it('maps media stage log events into Task Center updateProgress steps', async () => {
      const mockWorkerPath = path.join(tmpDir, 'mock-sync-worker.js');
      fs.writeFileSync(
        mockWorkerPath,
        `
        import { parentPort } from "node:worker_threads";
        parentPort.on("message", (msg) => {
          if (msg.action === "START_TASK") {
            parentPort.postMessage({
              type: "COMMIT_SYNC_RESULT",
              jobId: msg.jobId,
              sourceId: msg.task.payload.sources[0].id,
              stepNumber: 1,
              stepTitle: "Sync 1/1: Demo Video",
            });
          } else if (msg.action === "COMMIT_SYNC_ACK") {
            parentPort.postMessage({
              type: "TASK_COMPLETE",
              jobId: msg.jobId,
              resultSummary: { newCount: msg.newCount, totalFetched: msg.totalFetched },
            });
          }
        });
        `,
        'utf-8'
      );

      const mockIngestionService = {
        syncSource: async (_sourceId: string, opts: any) => {
          opts.onLog('info', 'Probing subtitles...', { stage: 'probing_subtitles' });
          opts.onLog('info', 'Trimming audio...', { stage: 'trimming_audio' });
          opts.onLog('info', 'Transcribing audio via OpenAI...', { stage: 'transcribing_stt' });
          opts.onLog('info', 'Slicing transcript...', { stage: 'slicing' });
          return { newCount: 2, totalFetched: 1 };
        },
      } as unknown as IngestionService;

      const executor = new WorkerExecutor({
        ingestionService: mockIngestionService,
        workerScriptPath: mockWorkerPath,
      });

      const progressUpdates: Array<{ current: number; total?: number; step?: string }> = [];
      const mockCtx: JobExecutionContext = {
        jobId: 'media-job-1',
        signal: new AbortController().signal,
        updateProgress: (current, total, step) => {
          progressUpdates.push({ current, total, step });
        },
        log: (_stepNumber, _stepTitle, _level, _message) => ({} as any),
        setResultSummary: () => {},
      };

      const result = await executor.executeTask(
        {
          type: 'sync_source',
          payload: {
            sources: [
              {
                id: 'src-media-1',
                name: 'Demo Video',
                type: 'video',
                uri: '/tmp/demo.mp4',
                tags: [],
                isActive: true,
              },
            ],
          },
        },
        mockCtx
      );

      expect(result.newCount).toBe(2);
      expect(progressUpdates).toEqual([
        { current: 1, total: 4, step: 'Probing subtitles...' },
        { current: 2, total: 4, step: 'Trimming audio...' },
        { current: 3, total: 4, step: 'Transcribing audio via OpenAI...' },
        { current: 4, total: 4, step: 'Slicing transcript...' },
      ]);
    });

    it('persists STT defaults via PUT /api/settings/general and exposes readiness via GET /api/settings/media/diagnostics', async () => {
      const db = createDatabaseClient({ inMemory: true });
      const sourceRepo = new DataSourceRepository(db);
      const syncRepo = new SyncStateRepository(db);
      const cardRepo = new FlashcardRepository(db);
      const settingsRepo = new SqliteSettingsRepository(db);
      const server = createWebServer({
        port: 0,
        sourceRepo,
        syncRepo,
        cardRepo,
        settingsRepo,
      });

      const { url } = await server.listen(0);
      try {
        const putRes = await fetch(`${url}/api/settings/general`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            defaultSttProvider: 'whisper-local',
            localWhisperModel: 'small',
            localWhisperEndpoint: 'http://localhost:8080',
            defaultSubtitleLanguage: 'ro',
          }),
        });
        expect(putRes.status).toBe(200);
        const putBody = (await putRes.json()) as any;
        expect(putBody.settings.defaultSttProvider).toBe('whisper-local');
        expect(putBody.settings.localWhisperModel).toBe('small');
        expect(putBody.settings.localWhisperEndpoint).toBe('http://localhost:8080');
        expect(putBody.settings.defaultSubtitleLanguage).toBe('ro');

        const diagRes = await fetch(`${url}/api/settings/media/diagnostics`);
        expect(diagRes.status).toBe(200);
        const diagBody = (await diagRes.json()) as any;
        expect(typeof diagBody.ffmpeg?.available).toBe('boolean');
        expect(['system', 'cached', 'auto-download']).toContain(diagBody.ytDlp?.mode);
        expect(diagBody.whisperLocal?.mode).toBe('http');
        expect(typeof diagBody.openaiStt?.configured).toBe('boolean');
        expect(typeof diagBody.geminiStt?.configured).toBe('boolean');
      } finally {
        await server.close();
        db.close();
      }
    });
  });
});

