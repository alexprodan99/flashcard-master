<script lang="ts">
  import { taskStore, toastStore } from '../stores/index.js';
  import StepAccordion from './StepAccordion.svelte';

  let isClearing = $state(false);

  async function handleToggleVerbose() {
    const isNow = await taskStore.toggleVerbose();
    if (isNow) {
      toastStore.info('🐞 Verbose diagnostic logging enabled (Notion subpage, block, and chunk traces visible)');
    } else {
      toastStore.info('Standard logging enabled');
    }
  }

  function handleCopyAllLogs() {
    const displayedJobs = taskStore.activeDrawerTab === 'active' ? taskStore.activeJobs : taskStore.historyJobs;
    if (displayedJobs.length === 0) {
      toastStore.info('No jobs to copy logs from.');
      return;
    }

    const payload = displayedJobs.map((job) => ({
      jobId: job.id,
      title: job.title,
      type: job.type,
      status: job.status,
      startedAt: job.startedAt || job.createdAt,
      completedAt: job.completedAt,
      logs: taskStore.getLogsForJob(job.id).map((l) => ({
        timestamp: l.timestamp,
        level: l.level,
        step: l.stepTitle,
        message: l.message,
        details: l.details,
      })),
    }));

    navigator.clipboard
      .writeText(JSON.stringify(payload, null, 2))
      .then(() => {
        toastStore.success(`📋 Copied logs for ${displayedJobs.length} task(s) to clipboard`);
      })
      .catch(() => {
        toastStore.error('Failed to copy logs to clipboard');
      });
  }

  async function handleClearHistory() {
    if (taskStore.historyJobs.length === 0) return;
    if (!confirm('Are you sure you want to clear all finished job history?')) return;
    isClearing = true;
    try {
      await taskStore.clearHistory();
    } finally {
      isClearing = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && taskStore.isDrawerOpen) {
      taskStore.closeDrawer();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if taskStore.isDrawerOpen}
  <div class="drawer-backdrop" role="presentation" onclick={() => taskStore.closeDrawer()}>
    <div
      class="drawer-panel"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') taskStore.closeDrawer(); }}
    >
      <!-- Header -->
      <div class="drawer-header">
        <div class="header-left">
          <div class="title-row">
            <span class="header-icon">⚡</span>
            <h2>Task Center</h2>
          </div>
          <div class="sse-status" class:connected={taskStore.isConnected}>
            <span class="status-dot"></span>
            <span>{taskStore.isConnected ? 'SSE Live Stream Connected' : 'Connecting to Server Stream...'}</span>
          </div>
        </div>

        <button
          type="button"
          class="btn-close"
          onclick={() => taskStore.closeDrawer()}
          aria-label="Close Task Center"
        >
          ✕
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="drawer-tabs">
        <button
          type="button"
          class="tab-btn"
          class:active={taskStore.activeDrawerTab === 'active'}
          onclick={() => taskStore.setDrawerTab('active')}
        >
          <span>Active Tasks</span>
          {#if taskStore.activeCount > 0}
            <span class="tab-badge active-pulsing">{taskStore.activeCount}</span>
          {/if}
        </button>

        <button
          type="button"
          class="tab-btn"
          class:active={taskStore.activeDrawerTab === 'history'}
          onclick={() => taskStore.setDrawerTab('history')}
        >
          <span>History</span>
          <span class="tab-badge">{taskStore.historyJobs.length}</span>
        </button>

        {#if taskStore.activeDrawerTab === 'history' && taskStore.historyJobs.length > 0}
          <div class="tab-actions">
            <button
              type="button"
              class="btn-clear-history"
              onclick={handleClearHistory}
              disabled={isClearing}
            >
              {isClearing ? 'Clearing...' : '🗑️ Clear History'}
            </button>
          </div>
        {/if}
      </div>

      <!-- Controls Toolbar -->
      <div class="drawer-toolbar">
        <div class="toolbar-left">
          <button
            type="button"
            class="btn-verbose-toggle"
            class:active={taskStore.isVerbose}
            onclick={handleToggleVerbose}
            title={taskStore.isVerbose ? 'Disable verbose diagnostic logging' : 'Enable verbose diagnostic logging (shows subpages, block details, chunking)'}
          >
            <span class="toggle-icon">🐞</span>
            <span class="toggle-label">Verbose Logs</span>
            <span class="toggle-status">{taskStore.isVerbose ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        <div class="toolbar-right">
          <button
            type="button"
            class="btn-toolbar-action"
            onclick={handleCopyAllLogs}
            title="Copy logs of all visible tasks to clipboard"
          >
            📋 Copy All Logs
          </button>
        </div>
      </div>

      <!-- Task Lists Content -->
      <div class="drawer-content">
        {#if taskStore.activeDrawerTab === 'active'}
          {#if taskStore.activeJobs.length === 0}
            <div class="empty-state">
              <div class="empty-icon">☕</div>
              <h3>No Active Tasks</h3>
              <p>When you start AI flashcard generations, ingestion syncs, or document exports, progress and step logs will stream here in real-time.</p>
            </div>
          {:else}
            <div class="tasks-list">
              {#each taskStore.activeJobs as job (job.id)}
                <StepAccordion
                  {job}
                  logs={taskStore.getLogsForJob(job.id)}
                  expanded={taskStore.expandedJobIds[job.id]}
                  onToggle={() => taskStore.toggleJobAccordion(job.id)}
                  onCancel={(id) => taskStore.cancelJob(id)}
                />
              {/each}
            </div>
          {/if}
        {:else}
          {#if taskStore.historyJobs.length === 0}
            <div class="empty-state">
              <div class="empty-icon">📋</div>
              <h3>No Job History</h3>
              <p>Finished and cancelled background tasks will appear here with execution metrics and diagnostic logs.</p>
            </div>
          {:else}
            <div class="tasks-list">
              {#each taskStore.historyJobs as job (job.id)}
                <StepAccordion
                  {job}
                  logs={taskStore.getLogsForJob(job.id)}
                  expanded={taskStore.expandedJobIds[job.id]}
                  onToggle={() => taskStore.toggleJobAccordion(job.id)}
                />
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      <!-- Footer Info -->
      <div class="drawer-footer">
        <div class="pool-concurrency-info">
          <span>Worker Pools: Max 3 Gens • Max 2 Syncs • Max 2 Exports</span>
          <span class="custodian-badge">🔒 AD-19 SQLite Safe</span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: flex-end;
    z-index: 2000;
  }

  .drawer-panel {
    background: #0f172a;
    border-left: 1px solid #1e293b;
    width: 100%;
    max-width: min(580px, 100vw);
    box-sizing: border-box;
    height: 100vh;
    display: flex;
    flex-direction: column;
    box-shadow: -12px 0 30px rgba(0, 0, 0, 0.6);
  }

  .drawer-header {
    padding: 20px 24px;
    border-bottom: 1px solid #1e293b;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    background: #1e293b;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-icon {
    font-size: 20px;
  }

  .title-row h2 {
    font-size: 18px;
    font-weight: 700;
    color: #f8fafc;
    margin: 0;
  }

  .sse-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #94a3b8;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #f59e0b;
  }

  .sse-status.connected .status-dot {
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
    transition: background 0.15s, color 0.15s;
  }

  .btn-close:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #f8fafc;
  }

  .drawer-tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: #131d31;
    border-bottom: 1px solid #1e293b;
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.03);
  }

  .tab-btn.active {
    background: #1e293b;
    border-color: #334155;
    color: #f8fafc;
  }

  .tab-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 10px;
    background: #334155;
    color: #94a3b8;
  }

  .active-pulsing {
    background: #6366f1;
    color: #ffffff;
    box-shadow: 0 0 8px rgba(99, 102, 241, 0.8);
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.8; transform: scale(1.05); }
  }

  .tab-actions {
    margin-left: auto;
  }

  .btn-clear-history {
    background: transparent;
    border: 1px solid #334155;
    color: #94a3b8;
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-clear-history:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: #f87171;
  }

  .drawer-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 24px;
    background: #0b1324;
    border-bottom: 1px solid #1e293b;
    gap: 12px;
  }

  .btn-verbose-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-verbose-toggle:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #f1f5f9;
  }

  .btn-verbose-toggle.active {
    background: rgba(99, 102, 241, 0.2);
    border-color: #6366f1;
    color: #c7d2fe;
  }

  .btn-verbose-toggle .toggle-status {
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
  }

  .btn-verbose-toggle.active .toggle-status {
    background: #6366f1;
    color: #ffffff;
  }

  .btn-toolbar-action {
    display: flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-toolbar-action:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #f1f5f9;
    border-color: #475569;
  }

  .drawer-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 20px;
    color: #64748b;
  }

  .empty-icon {
    font-size: 38px;
    margin-bottom: 12px;
    opacity: 0.7;
  }

  .empty-state h3 {
    font-size: 16px;
    font-weight: 600;
    color: #e2e8f0;
    margin: 0 0 8px 0;
  }

  .empty-state p {
    font-size: 13px;
    line-height: 1.5;
    max-width: 380px;
    margin: 0;
  }

  .tasks-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .drawer-footer {
    padding: 12px 24px;
    border-top: 1px solid #1e293b;
    background: #0b0f19;
  }

  .pool-concurrency-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #64748b;
  }

  .custodian-badge {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #34d399;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 10px;
  }

  @media (max-width: 640px) {
    .drawer-header {
      padding: 14px 16px;
    }
    .drawer-tabs {
      padding: 8px 16px;
    }
    .drawer-content {
      padding: 14px 16px;
    }
    .drawer-footer {
      padding: 10px 16px;
    }
  }
</style>
