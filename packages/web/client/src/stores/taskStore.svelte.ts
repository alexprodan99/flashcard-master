import type { Job, JobLog, JobStatus } from '../lib/types.js';
import { fetchJobs, fetchJobDetails, cancelJobApi, clearJobHistory } from '../lib/api.js';
import { toastStore } from './toastStore.svelte.js';
import { generateStore } from './generateStore.svelte.js';
import { sourcesStore } from './sourcesStore.svelte.js';

export class TaskStore {
  jobs = $state<Job[]>([]);
  jobLogs = $state<Record<string, JobLog[]>>({});
  isConnected = $state(false);
  isDrawerOpen = $state(false);
  activeDrawerTab = $state<'active' | 'history'>('active');
  expandedJobIds = $state<Record<string, boolean>>({});

  private eventSource: EventSource | null = null;
  private reconnectTimer: any = null;

  activeJobs = $derived(
    this.jobs.filter((j) => j.status === 'queued' || j.status === 'running')
  );

  historyJobs = $derived(
    this.jobs.filter((j) => j.status !== 'queued' && j.status !== 'running')
  );

  activeCount = $derived(this.activeJobs.length);

  init() {
    if (typeof window === 'undefined') return;
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
              newCards: summary.newCards || [],
            });
            toastStore.success(`🎉 Generated ${cardsCreated} cards (${duplicatesSkipped} duplicates skipped)`);
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
            return;
          }

          toastStore.success(`🎉 Task "${title}" completed successfully!`);
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
            return;
          }

          if (failedJob.type === 'sync_source') {
            const sourceId = failedJob.metadata?.sourceId;
            if (sourceId) {
              sourcesStore.setSyncing(sourceId, false);
            }
            toastStore.error(`⚠️ Sync failed for "${failedJob.metadata?.sourceName || 'Source'}": ${errorMsg}`);
            return;
          }

          if (failedJob.type === 'sync_all') {
            sourcesStore.setSyncingAll(false);
            toastStore.error(`⚠️ Bulk sync failed: ${errorMsg}`);
            return;
          }

          toastStore.error(`⚠️ Task "${title}" failed: ${errorMsg}`);
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
            return;
          }

          if (cancelledJob.type === 'sync_source') {
            const sourceId = cancelledJob.metadata?.sourceId;
            if (sourceId) {
              sourcesStore.setSyncing(sourceId, false);
            }
            toastStore.warn(`⏹️ Sync for "${cancelledJob.metadata?.sourceName || 'Source'}" was cancelled.`);
            return;
          }

          if (cancelledJob.type === 'sync_all') {
            sourcesStore.setSyncingAll(false);
            toastStore.warn(`⏹️ Bulk sync was cancelled.`);
            return;
          }

          toastStore.warn(`⏹️ Task "${title}" was cancelled.`);
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
  }

  getLogsForJob(jobId: string): JobLog[] {
    return this.jobLogs[jobId] || [];
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
