import type { Job, JobLog, JobStatus, Flashcard } from '../lib/types.js';
import { fetchJobs, fetchJobDetails, cancelJobApi, clearJobHistory, fetchLoggingSettings, updateLoggingSettings } from '../lib/api.js';
import { toastStore } from './toastStore.svelte.js';
import { generateStore } from './generateStore.svelte.js';
import { sourcesStore } from './sourcesStore.svelte.js';

export class TaskStore {
  jobs = $state<Job[]>([]);
  jobLogs = $state<Record<string, JobLog[]>>({});
  streamedCards = $state<Record<string, Flashcard[]>>({});
  isConnected = $state(false);
  isDrawerOpen = $state(false);
  activeDrawerTab = $state<'active' | 'history'>('active');
  expandedJobIds = $state<Record<string, boolean>>({});
  isVerbose = $state(false);

  private eventSource: EventSource | null = null;
  private reconnectTimer: any = null;
  private completionListeners: ((job: Job) => void)[] = [];

  onJobCompleted(listener: (job: Job) => void): () => void {
    this.completionListeners.push(listener);
    return () => {
      this.completionListeners = this.completionListeners.filter((l) => l !== listener);
    };
  }

  private notifyJobCompleted(job: Job) {
    for (const listener of this.completionListeners) {
      try {
        listener(job);
      } catch (err) {
        console.error('Error in onJobCompleted listener:', err);
      }
    }
  }

  activeJobs = $derived(
    this.jobs.filter((j) => j.status === 'queued' || j.status === 'running')
  );

  historyJobs = $derived(
    this.jobs.filter((j) => j.status !== 'queued' && j.status !== 'running')
  );

  activeCount = $derived(this.activeJobs.length);

  init() {
    if (typeof window === 'undefined') return;
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('fm_verbose_logging');
      if (saved !== null) {
        this.isVerbose = saved === 'true';
      }
    }
    fetchLoggingSettings()
      .then((settings) => {
        this.isVerbose = settings.verbose;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('fm_verbose_logging', settings.verbose ? 'true' : 'false');
        }
      })
      .catch(() => {});
    this.fetchJobs();
    this.connectSse();
  }

  private connectSse() {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      this.eventSource = new EventSource('/api/jobs/stream');

      this.eventSource.addEventListener('open', () => {
        this.isConnected = true;
      });

      this.eventSource.addEventListener('connected', () => {
        this.isConnected = true;
      });

      this.eventSource.addEventListener('job_created', (e) => {
        try {
          const newJob: Job = JSON.parse(e.data);
          this.upsertJob(newJob);
        } catch {}
      });

      this.eventSource.addEventListener('job_status', (e) => {
        try {
          const updatedJob: Job = JSON.parse(e.data);
          this.upsertJob(updatedJob);
        } catch {}
      });

      this.eventSource.addEventListener('job_progress', (e) => {
        try {
          const data = JSON.parse(e.data);
          const job = this.jobs.find((j) => j.id === (data.jobId || data.id));
          if (job) {
            if (data.progressPercent !== undefined) job.progressPercent = data.progressPercent;
            if (data.currentStep !== undefined) job.currentStep = data.currentStep;
            if (data.totalSteps !== undefined) job.totalSteps = data.totalSteps;
            if (data.currentStepName !== undefined) job.currentStepName = data.currentStepName;
            job.progressCurrent = data.current ?? data.currentStep ?? job.progressCurrent;
            job.progressTotal = data.total ?? data.totalSteps ?? job.progressTotal;
            if (data.step) job.currentStep = data.step;
          }
        } catch {}
      });

      this.eventSource.addEventListener('job_log', (e) => {
        try {
          const log: JobLog = JSON.parse(e.data);
          if (!this.jobLogs[log.jobId]) {
            this.jobLogs[log.jobId] = [];
          }
          if (!this.jobLogs[log.jobId].some((l) => l.id === log.id)) {
            this.jobLogs[log.jobId] = [...this.jobLogs[log.jobId], log];
          }
          this.logToBrowserConsole(log);
        } catch {}
      });

      this.eventSource.addEventListener('card_created', (e) => {
        try {
          const payload = JSON.parse(e.data);
          const jobId = payload.jobId;
          const card: Flashcard = payload.card;
          if (jobId && card) {
            if (!this.streamedCards[jobId]) {
              this.streamedCards[jobId] = [];
            }
            if (!this.streamedCards[jobId].some((c) => c.id === card.id)) {
              this.streamedCards[jobId] = [...this.streamedCards[jobId], card];
            }
          }
        } catch {}
      });

      this.eventSource.addEventListener('job_completed', (e) => {
        try {
          const completedJob: Job = JSON.parse(e.data);
          this.upsertJob(completedJob);
          const title = completedJob.title || completedJob.currentStep || completedJob.type;

          // 1. Generation job
          if (completedJob.id === generateStore.activeJobId) {
            const summary = completedJob.resultSummary || {};
            const cardsCreated = summary.cardsCreated ?? 0;
            const duplicatesSkipped = summary.duplicatesSkipped ?? 0;
            generateStore.finishGenerating({
              success: true,
              cardsCreated,
              totalDraftsGenerated: summary.totalDraftsGenerated ?? cardsCreated,
              duplicatesSkipped,
              newCards: summary.newCards || this.getStreamedCardsForJob(completedJob.id),
            });
            if (completedJob.status === 'completed_with_warnings') {
              toastStore.warn(`⚠️ Partial output saved: ${cardsCreated} cards generated (${duplicatesSkipped} duplicates skipped). Output token limit reached.`);
            } else {
              toastStore.success(`🎉 Generated ${cardsCreated} cards (${duplicatesSkipped} duplicates skipped)`);
            }
            this.notifyJobCompleted(completedJob);
            return;
          }

          if (completedJob.type === 'generation') {
            const summary = completedJob.resultSummary || {};
            const cardsCreated = summary.cardsCreated ?? 0;
            const duplicatesSkipped = summary.duplicatesSkipped ?? 0;
            const docTitle = completedJob.metadata?.documentTitle;
            if (completedJob.status === 'completed_with_warnings') {
              toastStore.warn(`⚠️ Output token limit reached: ${cardsCreated} cards generated for "${docTitle || title}" (${duplicatesSkipped} duplicates skipped).`);
            } else if (docTitle) {
              toastStore.success(`🎉 Generated ${cardsCreated} cards from "${docTitle}" (${duplicatesSkipped} duplicates skipped)`);
            } else {
              toastStore.success(`🎉 Generated ${cardsCreated} cards (${duplicatesSkipped} duplicates skipped)`);
            }
            this.notifyJobCompleted(completedJob);
            return;
          }

          // 2. Single source sync job
          if (completedJob.type === 'sync_source') {
            const sourceId = completedJob.metadata?.sourceId;
            const isTracked = (sourceId && (sourcesStore.syncingSourceIds[sourceId] || sourcesStore.activeSyncJobIds[sourceId] === completedJob.id))
              || Object.values(sourcesStore.activeSyncJobIds).includes(completedJob.id);

            if (sourceId) {
              sourcesStore.setSyncing(sourceId, false);
            }
            const summary = completedJob.resultSummary || {};
            const newCount = summary.newCount ?? summary.totalNewDocuments ?? 0;
            const totalFetched = summary.totalFetched ?? summary.totalFetchedDocuments ?? 0;
            const sourceName = completedJob.metadata?.sourceName || (sourceId ? (sourcesStore.sources.find(s => s.id === sourceId)?.name || 'Source') : 'Source');

            if (isTracked) {
              if (newCount > 0) {
                toastStore.success(`🎉 Synced "${sourceName}": ${newCount} new document(s) ingested (${totalFetched} total checked).`);
              } else {
                toastStore.info(`Synced "${sourceName}": Up to date (0 new documents, ${totalFetched} total checked).`);
              }
            } else {
              toastStore.success(`🎉 Task "${title}" completed successfully!`);
            }
            this.notifyJobCompleted(completedJob);
            return;
          }

          // 3. Bulk sync_all job
          if (completedJob.type === 'sync_all') {
            const isTracked = sourcesStore.isSyncingAll || sourcesStore.activeSyncAllJobId === completedJob.id;
            sourcesStore.setSyncingAll(false);
            const summary = completedJob.resultSummary || {};
            const totalNew = summary.totalNewDocuments ?? summary.newCount ?? 0;
            const totalSources = summary.totalSources ?? completedJob.metadata?.sourceCount ?? 'all';

            if (isTracked) {
              toastStore.success(`🎉 Bulk sync completed: ${totalNew} new document(s) ingested across ${totalSources} sources.`);
            } else {
              toastStore.success(`🎉 Task "${title}" completed successfully!`);
            }
            this.notifyJobCompleted(completedJob);
            return;
          }

          toastStore.success(`🎉 Task "${title}" completed successfully!`);
          this.notifyJobCompleted(completedJob);
        } catch {}
      });

      this.eventSource.addEventListener('job_failed', (e) => {
        try {
          const failedJob: Job = JSON.parse(e.data);
          this.upsertJob(failedJob);
          const title = failedJob.title || failedJob.currentStep || failedJob.type;
          const errorMsg = failedJob.errorMessage || 'Unknown error';

          if (failedJob.id === generateStore.activeJobId) {
            generateStore.finishGenerating(null, errorMsg);
            toastStore.error(`⚠️ Generation failed: ${errorMsg}`);
            this.notifyJobCompleted(failedJob);
            return;
          }

          if (failedJob.type === 'generation') {
            const docTitle = failedJob.metadata?.documentTitle;
            toastStore.error(`⚠️ Generation failed for "${docTitle || title}": ${errorMsg}`);
            this.notifyJobCompleted(failedJob);
            return;
          }

          if (failedJob.type === 'sync_source') {
            const sourceId = failedJob.metadata?.sourceId;
            if (sourceId) {
              sourcesStore.setSyncing(sourceId, false);
            }
            toastStore.error(`⚠️ Sync failed for "${failedJob.metadata?.sourceName || 'Source'}": ${errorMsg}`);
            this.notifyJobCompleted(failedJob);
            return;
          }

          if (failedJob.type === 'sync_all') {
            sourcesStore.setSyncingAll(false);
            toastStore.error(`⚠️ Bulk sync failed: ${errorMsg}`);
            this.notifyJobCompleted(failedJob);
            return;
          }

          toastStore.error(`⚠️ Task "${title}" failed: ${errorMsg}`);
          this.notifyJobCompleted(failedJob);
        } catch {}
      });

      this.eventSource.addEventListener('job_cancelled', (e) => {
        try {
          const cancelledJob: Job = JSON.parse(e.data);
          this.upsertJob(cancelledJob);
          const title = cancelledJob.title || cancelledJob.currentStep || cancelledJob.type;

          if (cancelledJob.id === generateStore.activeJobId) {
            generateStore.finishGenerating(null, 'Generation task was cancelled');
            toastStore.warn(`⏹️ Generation task was cancelled.`);
            this.notifyJobCompleted(cancelledJob);
            return;
          }

          if (cancelledJob.type === 'generation') {
            const docTitle = cancelledJob.metadata?.documentTitle;
            toastStore.warn(`⏹️ Generation for "${docTitle || title}" was cancelled.`);
            this.notifyJobCompleted(cancelledJob);
            return;
          }

          if (cancelledJob.type === 'sync_source') {
            const sourceId = cancelledJob.metadata?.sourceId;
            if (sourceId) {
              sourcesStore.setSyncing(sourceId, false);
            }
            toastStore.warn(`⏹️ Sync for "${cancelledJob.metadata?.sourceName || 'Source'}" was cancelled.`);
            this.notifyJobCompleted(cancelledJob);
            return;
          }

          if (cancelledJob.type === 'sync_all') {
            sourcesStore.setSyncingAll(false);
            toastStore.warn(`⏹️ Bulk sync was cancelled.`);
            this.notifyJobCompleted(cancelledJob);
            return;
          }

          toastStore.warn(`⏹️ Task "${title}" was cancelled.`);
          this.notifyJobCompleted(cancelledJob);
        } catch {}
      });

      this.eventSource.addEventListener('error', () => {
        this.isConnected = false;
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        // Retry connection after 5 seconds
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectSse();
          }, 5000);
        }
      });
    } catch {
      this.isConnected = false;
    }
  }

  upsertJob(job: Job) {
    const idx = this.jobs.findIndex((j) => j.id === job.id);
    if (idx !== -1) {
      this.jobs[idx] = { ...this.jobs[idx], ...job };
    } else {
      this.jobs = [job, ...this.jobs];
    }
  }

  async fetchJobs() {
    try {
      const list = await fetchJobs();
      this.jobs = list;
    } catch {}
  }

  async loadJobLogs(jobId: string) {
    try {
      const { job, logs } = await fetchJobDetails(jobId);
      this.upsertJob(job);
      this.jobLogs[jobId] = logs;
    } catch {}
  }

  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const res = await cancelJobApi(jobId);
      if (res.job) {
        this.upsertJob(res.job);
      }
      if (jobId === generateStore.activeJobId) {
        generateStore.finishGenerating(null, 'Generation task was cancelled');
      }
      if (jobId === sourcesStore.activeSyncAllJobId) {
        sourcesStore.setSyncingAll(false);
      }
      for (const [sourceId, jId] of Object.entries(sourcesStore.activeSyncJobIds)) {
        if (jId === jobId) {
          sourcesStore.setSyncing(sourceId, false);
        }
      }
      return res.success;
    } catch {
      return false;
    }
  }

  async clearHistory(): Promise<number> {
    try {
      const res = await clearJobHistory();
      await this.fetchJobs();
      // Clean up in-memory cached logs and expanded states for pruned jobs
      const activeIds = new Set(this.jobs.map((j) => j.id));
      for (const id of Object.keys(this.jobLogs)) {
        if (!activeIds.has(id)) delete this.jobLogs[id];
      }
      for (const id of Object.keys(this.expandedJobIds)) {
        if (!activeIds.has(id)) delete this.expandedJobIds[id];
      }
      for (const id of Object.keys(this.streamedCards)) {
        if (!activeIds.has(id)) delete this.streamedCards[id];
      }
      return res.deletedCount;
    } catch {
      return 0;
    }
  }

  toggleDrawer(open?: boolean) {
    this.isDrawerOpen = open !== undefined ? open : !this.isDrawerOpen;
    if (this.isDrawerOpen) {
      this.fetchJobs();
    }
  }

  openDrawer(tab?: 'active' | 'history') {
    if (tab) this.activeDrawerTab = tab;
    this.toggleDrawer(true);
  }

  closeDrawer() {
    this.toggleDrawer(false);
  }

  setDrawerTab(tab: 'active' | 'history') {
    this.activeDrawerTab = tab;
  }

  toggleJobAccordion(jobId: string) {
    this.expandedJobIds[jobId] = !this.expandedJobIds[jobId];
    if (this.expandedJobIds[jobId] && !this.jobLogs[jobId]) {
      this.loadJobLogs(jobId);
    }
  }

  addJobLog(log: JobLog) {
    if (!this.jobLogs[log.jobId]) {
      this.jobLogs[log.jobId] = [];
    }
    if (!this.jobLogs[log.jobId].some((l) => l.id === log.id)) {
      this.jobLogs[log.jobId] = [...this.jobLogs[log.jobId], log];
    }
    this.logToBrowserConsole(log);
  }

  async toggleVerbose(): Promise<boolean> {
    this.isVerbose = !this.isVerbose;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('fm_verbose_logging', this.isVerbose ? 'true' : 'false');
    }
    try {
      await updateLoggingSettings({ verbose: this.isVerbose });
    } catch {}
    return this.isVerbose;
  }

  setVerbose(enabled: boolean) {
    this.isVerbose = enabled;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('fm_verbose_logging', enabled ? 'true' : 'false');
    }
  }

  private logToBrowserConsole(log: JobLog) {
    if (typeof window === 'undefined') return;
    if (log.level === 'debug' && !this.isVerbose) return;

    const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    const badgeStyles: Record<string, string> = {
      debug: 'background: #6366f1; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;',
      info: 'background: #0284c7; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;',
      warn: 'background: #eab308; color: black; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;',
      error: 'background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;',
      success: 'background: #22c55e; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;',
    };

    const style = badgeStyles[log.level] || 'background: #64748b; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;';
    const metaStyle = 'color: #94a3b8; font-family: monospace; font-size: 11px;';
    const stepInfo = log.stepTitle ? ` (${log.stepTitle})` : '';

    if (log.details && Object.keys(log.details).length > 0) {
      console.log(`%c${log.level.toUpperCase()}%c [${time}] [${log.jobId.slice(0, 8)}]${stepInfo} ${log.message}`, style, metaStyle, log.details);
    } else {
      console.log(`%c${log.level.toUpperCase()}%c [${time}] [${log.jobId.slice(0, 8)}]${stepInfo} ${log.message}`, style, metaStyle);
    }
  }

  getLogsForJob(jobId: string): JobLog[] {
    return this.jobLogs[jobId] || [];
  }

  getStreamedCardsForJob(jobId: string): Flashcard[] {
    return this.streamedCards[jobId] || [];
  }

  teardown() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const taskStore = new TaskStore();
