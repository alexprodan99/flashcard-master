<script lang="ts">
  import type { Job, JobLog } from '../lib/types';
  import { taskStore, toastStore } from '../stores/index.js';

  interface Props {
    job: Job;
    logs?: JobLog[];
    expanded?: boolean;
    onToggle?: () => void;
    onCancel?: (jobId: string) => void;
  }

  let {
    job,
    logs = [],
    expanded = false,
    onToggle,
    onCancel,
  }: Props = $props();

  let isCancelling = $state(false);

  function getJobTitle(j: Job): string {
    if (j.title) return j.title;
    if (j.type === 'generation' || (j.type as any) === 'generate') {
      const model = j.metadata?.model || (j as any).payload?.model || 'AI Model';
      return `AI Flashcard Generation (${model})`;
    }
    if (j.type === 'sync_source' || j.type === 'sync_all' || (j.type as any) === 'sync') {
      const srcName = j.metadata?.sourceName || j.metadata?.sourceId || (j as any).payload?.sourceId;
      return srcName ? `Data Source Ingestion (${srcName})` : 'Bulk Sources Ingestion';
    }
    if (j.type === 'export') {
      const format = (j.metadata?.format || (j as any).payload?.format || 'Archive').toUpperCase();
      return `Document Export (${format})`;
    }
    return `Background Task (${j.type})`;
  }

  function formatTime(isoStr?: string): string {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoStr;
    }
  }

  function getDuration(startIso?: string, endIso?: string): string {
    if (!startIso) return '';
    const start = new Date(startIso).getTime();
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    const diffSec = Math.max(0, Math.floor((end - start) / 1000));
    if (diffSec < 60) return `${diffSec}s`;
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${mins}m ${secs}s`;
  }

  async function handleCancel(e: MouseEvent) {
    e.stopPropagation();
    if (!onCancel) return;
    if (confirm(`Are you sure you want to cancel task "${getJobTitle(job)}"?`)) {
      isCancelling = true;
      try {
        await onCancel(job.id);
      } finally {
        isCancelling = false;
      }
    }
  }

  function copyJobLogs(e: MouseEvent) {
    e.stopPropagation();
    const payload = {
      jobId: job.id,
      title: getJobTitle(job),
      type: job.type,
      status: job.status,
      startedAt: job.createdAt,
      completedAt: job.completedAt,
      logs: logs.map((l) => ({
        timestamp: l.timestamp,
        level: l.level,
        step: l.stepTitle || (l as any).step,
        message: l.message,
        details: l.details,
      })),
    };
    navigator.clipboard
      .writeText(JSON.stringify(payload, null, 2))
      .then(() => {
        toastStore.success(`📋 Copied logs for "${getJobTitle(job)}"`);
      })
      .catch(() => {
        toastStore.error('Failed to copy logs to clipboard');
      });
  }

  // Calculate percentage
  let progressPercent = $derived.by(() => {
    if (job.status === 'completed' || job.status === 'completed_with_warnings') return 100;
    if (job.progressPercent !== undefined && job.progressPercent !== null) return job.progressPercent;
    if (job.progress !== undefined && job.progress !== null) return job.progress;
    if (job.progressCurrent !== undefined && job.progressTotal && job.progressTotal > 0) {
      return Math.min(100, Math.round((job.progressCurrent / job.progressTotal) * 100));
    }
    if (job.currentStep && job.totalSteps && job.totalSteps > 0) {
      return Math.min(100, Math.round((job.currentStep / job.totalSteps) * 100));
    }
    return job.status === 'running' ? 25 : 0;
  });

  // Filter logs based on verbosity: when isVerbose is false, debug logs are hidden
  let visibleLogs = $derived.by(() => {
    if (!logs || logs.length === 0) return [];
    if (taskStore.isVerbose) return logs;
    return logs.filter((l) => l.level !== 'debug');
  });

  let hiddenDebugCount = $derived.by(() => {
    if (!logs || logs.length === 0 || taskStore.isVerbose) return 0;
    return logs.filter((l) => l.level === 'debug').length;
  });

  // Group logs into unique chronological steps or fallback to sequential logs
  let groupedSteps = $derived.by(() => {
    if (visibleLogs.length === 0) return [];
    const stepsMap: Record<string, JobLog[]> = {};
    for (const l of visibleLogs) {
      const key = (l as any).stepTitle || (l as any).step || 'General';
      if (!stepsMap[key]) stepsMap[key] = [];
      stepsMap[key].push(l);
    }
    return Object.entries(stepsMap).map(([stepName, stepLogs]) => ({
      stepName,
      logs: stepLogs,
      hasError: stepLogs.some((l) => l.level === 'error'),
      hasWarn: stepLogs.some((l) => l.level === 'warn'),
    }));
  });

  let streamedCards = $derived(taskStore.getStreamedCardsForJob(job.id));
</script>

<div class="accordion-item" class:expanded class:status-running={job.status === 'running'} class:status-failed={job.status === 'failed'}>
  <!-- Header Bar -->
  <div class="accordion-header">
    <button
      type="button"
      class="header-toggle-area"
      onclick={onToggle}
      aria-expanded={expanded}
    >
      <div class="header-left">
        <span class="status-icon {job.status}">
          {#if job.status === 'running'}
            <span class="spinner-icon">🔄</span>
          {:else if job.status === 'queued'}
            ⏳
          {:else if job.status === 'completed'}
            ✅
          {:else if job.status === 'completed_with_warnings'}
            ⚠️
          {:else if job.status === 'failed'}
            ❌
          {:else if job.status === 'cancelled'}
            ⏹️
          {/if}
        </span>

        <div class="job-meta">
          <div class="meta-row-top">
            <span class="type-pill {job.type}">{job.type}</span>
            <span class="job-title">{getJobTitle(job)}</span>
            {#if job.status === 'queued'}
              <span class="status-pill status-pill-queued">⏳ Queued (waiting for slot)</span>
            {:else if job.status === 'running'}
              <span class="status-pill status-pill-running">⚡ Running</span>
            {/if}
          </div>

          <div class="meta-row-sub">
            {#if job.currentStepName || job.stepName || (typeof job.currentStep === 'string' && job.currentStep)}
              <span class="current-step-msg">📍 {job.currentStepName || job.stepName || job.currentStep}</span>
            {/if}
            <span class="time-stamp">Started: {formatTime(job.createdAt)}</span>
            <span class="duration-badge">⏱️ {getDuration(job.createdAt, job.completedAt)}</span>
          </div>
        </div>
      </div>
    </button>

    <div class="header-right">
      {#if job.status === 'running' || job.status === 'queued'}
        <button
          type="button"
          class="btn-cancel"
          onclick={handleCancel}
          disabled={isCancelling}
          title="Cancel running task"
        >
          {isCancelling ? 'Cancelling...' : '✕ Cancel'}
        </button>
      {/if}
      <button
        type="button"
        class="btn-toggle-arrow"
        onclick={onToggle}
        aria-label={expanded ? 'Collapse details' : 'Expand details'}
      >
        <span class="toggle-arrow">{expanded ? '▲' : '▼'}</span>
      </button>
    </div>
  </div>

  <!-- Progress Bar (for running / queued tasks) -->
  {#if job.status === 'running' || job.status === 'queued'}
    <div class="progress-bar-container">
      <div class="progress-fill" style="width: {progressPercent}%"></div>
    </div>
  {/if}

  <!-- Expanded Step Details & Logs -->
  {#if expanded}
    <div class="accordion-body">
      {#if job.errorMessage || (job as any).error}
        <div class="job-error-box">
          <strong>⚠️ Task Error:</strong>
          <pre>{job.errorMessage || (job as any).error}</pre>
        </div>
      {/if}

      {#if (job.status === 'completed' || job.status === 'completed_with_warnings') && (job.resultSummary || (job as any).result)}
        {@const summary = job.resultSummary || (job as any).result || {}}
        <div class="job-result-box" class:warning-box={job.status === 'completed_with_warnings'}>
          {#if job.status === 'completed_with_warnings'}
            <div class="warning-title-row">
              <span class="warning-badge">⚠️ Partial Output Retained</span>
              <strong>Token limit reached during generation</strong>
            </div>
          {:else}
            <strong>🎉 Task Completed Successfully</strong>
          {/if}
          {#if job.type === 'generation' || (job.type as any) === 'generate'}
            <div class="result-stats">
              <span>+{summary.cardsCreated || 0} cards preserved</span>
              <span>• {summary.duplicatesSkipped || 0} duplicates skipped</span>
            </div>
          {:else if job.type === 'sync_source' || job.type === 'sync_all' || (job.type as any) === 'sync'}
            <div class="result-stats">
              <span>+{summary.newCount ?? summary.totalNewDocuments ?? 0} documents ingested</span>
              <span>• {summary.totalFetched ?? summary.totalFetchedDocuments ?? 0} total fetched</span>
            </div>
          {:else if job.type === 'export'}
            <div class="result-stats">
              <span>Saved file: {summary.filename || 'Export file ready'}</span>
            </div>
          {/if}
        </div>
      {/if}

      {#if streamedCards.length > 0}
        <div class="streamed-cards-section">
          <div class="streamed-cards-header">
            <span class="stream-pulse">●</span>
            <h5>Live Streamed Cards ({streamedCards.length})</h5>
          </div>
          <div class="streamed-cards-list">
            {#each streamedCards as card (card.id)}
              <div class="streamed-card-item">
                <div class="card-item-header">
                  <span class="diff-badge {card.difficulty}">{card.difficulty}</span>
                  {#if card.sourceLocator}
                    <span class="locator-badge" title="Source Locator">📍 {card.sourceLocator}</span>
                  {/if}
                </div>
                <div class="card-question"><strong>Q:</strong> {card.question}</div>
                <div class="card-answer"><strong>A:</strong> {card.answer}</div>
                {#if card.keywords && card.keywords.length > 0}
                  <div class="keywords-list">
                    {#each card.keywords as kw}
                      <span class="keyword-pill">🏷️ {kw}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="pipeline-section">
        <div class="pipeline-header-row">
          <h4 class="section-title">
            Execution Pipeline Logs ({visibleLogs.length} visible / {logs.length} total)
          </h4>
          {#if logs.length > 0}
            <button
              type="button"
              class="btn-copy-logs"
              onclick={copyJobLogs}
              title="Copy all logs for this task"
            >
              📋 Copy Job Logs
            </button>
          {/if}
        </div>

        {#if hiddenDebugCount > 0}
          <div class="debug-hidden-notice">
            <span class="debug-notice-text">
              🐞 {hiddenDebugCount} low-level debug trace{hiddenDebugCount === 1 ? '' : 's'} hidden
            </span>
            <button
              type="button"
              class="btn-inline-verbose"
              onclick={() => taskStore.toggleVerbose()}
            >
              Reveal Debug Logs
            </button>
          </div>
        {/if}

        {#if groupedSteps.length === 0}
          <div class="empty-logs">
            <span>No detailed step logs available for this task.</span>
          </div>
        {:else}
          <div class="steps-timeline">
            {#each groupedSteps as step, i}
              <div class="step-card" class:has-error={step.hasError} class:has-warn={step.hasWarn}>
                <div class="step-card-header">
                  <span class="step-number">{i + 1}</span>
                  <span class="step-title">{step.stepName}</span>
                  <span class="step-count">{step.logs.length} log{step.logs.length === 1 ? '' : 's'}</span>
                </div>

                <div class="step-logs-list">
                  {#each step.logs as log}
                    <div class="log-row level-{log.level}">
                      <span class="log-time">{formatTime(log.timestamp)}</span>
                      <span class="log-badge {log.level}">{log.level.toUpperCase()}</span>
                      <span class="log-message">{log.message}</span>
                      {#if log.details || (log as any).metadata}
                        <pre class="log-meta">{JSON.stringify(log.details || (log as any).metadata, null, 2)}</pre>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .accordion-item {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .accordion-item.status-running {
    border-color: #6366f1;
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.2);
  }

  .accordion-item.status-failed {
    border-color: #ef4444;
  }

  .accordion-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: transparent;
    border: none;
    text-align: left;
    color: inherit;
    gap: 12px;
  }

  .header-toggle-area {
    display: flex;
    align-items: center;
    background: transparent;
    border: none;
    padding: 4px 0;
    margin: 0;
    cursor: pointer;
    flex: 1;
    min-width: 0;
    text-align: left;
    color: inherit;
  }

  .btn-toggle-arrow {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  .status-icon {
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .spinner-icon {
    display: inline-block;
    animation: spin 1.5s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .job-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .meta-row-top {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .type-pill {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 4px;
    background: #334155;
    color: #94a3b8;
  }

  .type-pill.generate {
    background: rgba(99, 102, 241, 0.2);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.3);
  }

  .type-pill.sync {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .type-pill.export {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .job-title {
    font-size: 13px;
    font-weight: 600;
    color: #f1f5f9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status-pill {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.02em;
    flex-shrink: 0;
  }

  .status-pill-queued {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .status-pill-running {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .meta-row-sub {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    color: #94a3b8;
    flex-wrap: wrap;
  }

  .current-step-msg {
    color: #a5b4fc;
    font-weight: 500;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .btn-cancel {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-cancel:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.3);
  }

  .btn-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-arrow {
    font-size: 12px;
    color: #64748b;
  }

  .progress-bar-container {
    height: 3px;
    background: #0f172a;
    width: 100%;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #a855f7);
    transition: width 0.3s ease;
  }

  .accordion-body {
    padding: 16px;
    background: #0f172a;
    border-top: 1px solid #334155;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .job-error-box {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    padding: 10px 12px;
    color: #fca5a5;
    font-size: 12px;
  }

  .job-error-box pre {
    margin: 4px 0 0 0;
    white-space: pre-wrap;
    font-family: monospace;
    font-size: 11px;
  }

  .job-result-box {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 6px;
    padding: 10px 12px;
    color: #6ee7b7;
    font-size: 12px;
  }

  .job-result-box.warning-box {
    background: rgba(234, 179, 8, 0.15);
    border: 1px solid rgba(234, 179, 8, 0.35);
    color: #fef08a;
  }

  .warning-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }

  .warning-badge {
    background: rgba(234, 179, 8, 0.25);
    color: #fde047;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .result-stats {
    margin-top: 4px;
    font-size: 11px;
    display: flex;
    gap: 8px;
  }

  .streamed-cards-section {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .streamed-cards-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stream-pulse {
    color: #22c55e;
    animation: pulse 1.5s infinite;
    font-size: 10px;
  }

  .streamed-cards-header h5 {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
  }

  .streamed-cards-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 240px;
    overflow-y: auto;
  }

  .streamed-card-item {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .card-item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .locator-badge {
    color: #94a3b8;
    font-family: monospace;
    font-size: 10px;
  }

  .card-question {
    color: #f1f5f9;
  }

  .card-answer {
    color: #94a3b8;
  }

  .keywords-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .keyword-pill {
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.3);
    color: #c7d2fe;
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 500;
  }

  .pipeline-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-title {
    font-size: 12px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .empty-logs {
    padding: 16px;
    text-align: center;
    color: #64748b;
    font-size: 12px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 6px;
  }

  .steps-timeline {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .step-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    overflow: hidden;
  }

  .step-card.has-error {
    border-color: #ef4444;
  }

  .step-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid #334155;
    font-size: 12px;
  }

  .step-number {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #334155;
    color: #f1f5f9;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
  }

  .step-title {
    font-weight: 600;
    color: #e2e8f0;
    flex: 1;
  }

  .step-count {
    font-size: 10px;
    color: #64748b;
  }

  .step-logs-list {
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-family: monospace;
    font-size: 11px;
  }

  .log-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    line-height: 1.4;
  }

  .log-time {
    color: #64748b;
    flex-shrink: 0;
  }

  .log-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .log-badge.info {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  .log-badge.warn {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
  }

  .log-badge.error {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  .log-badge.debug {
    background: rgba(99, 102, 241, 0.25);
    color: #a5b4fc;
    border: 1px solid rgba(99, 102, 241, 0.4);
  }

  .log-badge.success {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
  }

  .pipeline-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .btn-copy-logs {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #94a3b8;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-copy-logs:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #f1f5f9;
  }

  .debug-hidden-notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: rgba(99, 102, 241, 0.08);
    border: 1px dashed rgba(99, 102, 241, 0.3);
    border-radius: 6px;
    padding: 6px 10px;
    margin-bottom: 10px;
    font-size: 11px;
  }

  .debug-notice-text {
    color: #a5b4fc;
  }

  .btn-inline-verbose {
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid rgba(99, 102, 241, 0.4);
    color: #c7d2fe;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-inline-verbose:hover {
    background: rgba(99, 102, 241, 0.4);
    color: #ffffff;
  }

  .log-message {
    color: #cbd5e1;
    word-break: break-word;
  }

  .log-meta {
    margin: 4px 0 0 0;
    padding: 4px 6px;
    background: #0b0f19;
    border-radius: 4px;
    color: #94a3b8;
    font-size: 10px;
    max-height: 100px;
    overflow-y: auto;
  }
</style>
