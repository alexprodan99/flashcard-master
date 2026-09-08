import type { Job, JobLog, JobStatus } from '../lib/types';
import { fetchJobs, fetchJobDetails, cancelJobApi, clearJobHistory } from '../lib/api';
import { toastStore } from './toastStore.svelte.js';
import { generateStore } from './generateStore.svelte.js';

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
          const job = this.jobs.find((j) => j.id === data.jobId);
          if (job) {
            job.progressCurrent = data.current;
            job.progressTotal = data.total;
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
          } else {
            toastStore.success(`🎉 Task "${title}" completed successfully!`);
          }
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
          } else {
            toastStore.error(`⚠️ Task "${title}" failed: ${errorMsg}`);
          }
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
          } else {
            toastStore.warn(`⏹️ Task "${title}" was cancelled.`);
          }
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
      return res.success;
    } catch {
      return false;
    }
  }

  async clearHistory(): Promise<number> {
    try {
      const res = await clearJobHistory();
      await this.fetchJobs();
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
