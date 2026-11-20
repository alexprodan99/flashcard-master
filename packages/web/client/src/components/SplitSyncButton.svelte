<script lang="ts">
  import type { SyncMode } from '../lib/types.js';

  interface Props {
    primaryLabel: string;
    syncingLabel?: string;
    syncing?: boolean;
    disabled?: boolean;
    variant?: 'row' | 'secondary' | 'primary';
    ariaLabel?: string;
    title?: string;
    dropUp?: boolean;
    defaultMode?: SyncMode;
    onSync: (mode: SyncMode) => void;
  }

  let {
    primaryLabel,
    syncingLabel = 'Syncing...',
    syncing = false,
    disabled = false,
    variant = 'row',
    ariaLabel,
    title = 'Sync New Items Only (incremental)',
    dropUp = false,
    defaultMode = 'new-only',
    onSync,
  }: Props = $props();

  let menuOpen = $state(false);
  let containerEl: HTMLDivElement | undefined = $state(undefined);
  let toggleEl: HTMLButtonElement | undefined = $state(undefined);
  let menuEl: HTMLDivElement | undefined = $state(undefined);

  function closeMenu(returnFocus = false) {
    if (!menuOpen) return;
    menuOpen = false;
    if (returnFocus) {
      toggleEl?.focus();
    }
  }

  function handlePrimaryClick() {
    closeMenu();
    if (!disabled && !syncing) {
      onSync(defaultMode);
    }
  }

  function handleToggleClick() {
    if (disabled || syncing) return;
    menuOpen = !menuOpen;
  }

  function handleSelectMode(e: MouseEvent, mode: SyncMode) {
    e.stopPropagation();
    closeMenu();
    if (!disabled && !syncing) {
      onSync(mode);
    }
  }

  function handleFocusOut(e: FocusEvent) {
    if (!menuOpen || !containerEl) return;
    const next = e.relatedTarget as Node | null;
    if (next && !containerEl.contains(next)) {
      closeMenu();
    }
  }

  function getMenuItems(): HTMLButtonElement[] {
    if (!menuEl) return [];
    return Array.from(menuEl.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
  }

  $effect(() => {
    if (disabled || syncing) {
      menuOpen = false;
    }
  });

  $effect(() => {
    if (!menuOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (containerEl && !containerEl.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const onWinKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        const items = getMenuItems();
        if (items.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const activeIdx = items.indexOf(document.activeElement as HTMLButtonElement);
        let nextIdx = 0;
        if (event.key === 'ArrowDown') {
          nextIdx = activeIdx >= 0 ? (activeIdx + 1) % items.length : 0;
        } else if (event.key === 'ArrowUp') {
          nextIdx = activeIdx >= 0 ? (activeIdx - 1 + items.length) % items.length : items.length - 1;
        } else if (event.key === 'End') {
          nextIdx = items.length - 1;
        }
        items[nextIdx]?.focus();
      }
    };
    // Capture phase ensures opening one SplitSyncButton or pressing Escape inside a modal never leaks or leaves multiple menus open
    document.addEventListener('click', onDocClick, true);
    window.addEventListener('keydown', onWinKeyDown, true);
    return () => {
      document.removeEventListener('click', onDocClick, true);
      window.removeEventListener('keydown', onWinKeyDown, true);
    };
  });

  const isDisabled = $derived(disabled || syncing);
  const resolvedLabel = $derived(syncing ? syncingLabel : primaryLabel);
  const toggleLabel = $derived(ariaLabel ? `${ariaLabel} sync mode options` : `${primaryLabel} mode options`);
</script>

<div
  class="split-sync-group"
  class:variant-row={variant === 'row'}
  class:variant-secondary={variant === 'secondary'}
  class:variant-primary={variant === 'primary'}
  class:menu-open={menuOpen}
  class:drop-up={dropUp}
  bind:this={containerEl}
  role="group"
  aria-label={ariaLabel ? `${ariaLabel} sync actions` : `${primaryLabel} actions`}
  onfocusout={handleFocusOut}
>
  <button
    type="button"
    class="split-primary-btn"
    disabled={isDisabled}
    onclick={handlePrimaryClick}
    {title}
  >
    {resolvedLabel}
  </button>
  <button
    type="button"
    class="split-caret-btn"
    bind:this={toggleEl}
    disabled={isDisabled}
    onclick={handleToggleClick}
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    aria-label={toggleLabel}
    title="Choose sync mode"
  >
    ▾
  </button>

  {#if menuOpen}
    <div class="split-menu" bind:this={menuEl} role="menu" aria-label="Sync mode options">
      <button
        type="button"
        class="split-menu-item"
        role="menuitem"
        disabled={isDisabled}
        data-sync-mode="new-only"
        onclick={(e) => handleSelectMode(e, 'new-only')}
      >
        <span class="menu-item-title">⚡ Sync New Items Only</span>
        <span class="menu-item-desc">Skip already-synced items and ingest additions</span>
      </button>
      <button
        type="button"
        class="split-menu-item"
        role="menuitem"
        disabled={isDisabled}
        data-sync-mode="full"
        onclick={(e) => handleSelectMode(e, 'full')}
      >
        <span class="menu-item-title">🔁 Full Re-sync (All Items)</span>
        <span class="menu-item-desc">Re-fetch and re-slice every item from scratch</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .split-sync-group {
    position: relative;
    display: inline-flex;
    align-items: stretch;
  }

  .split-primary-btn,
  .split-caret-btn {
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, color 0.15s, border-color 0.15s, opacity 0.15s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }

  .split-primary-btn:disabled,
  .split-caret-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Row compact style (matches SourcesView action buttons) */
  .variant-row .split-primary-btn {
    background: #334155;
    color: #f8fafc;
    border: 1px solid #475569;
    border-right: none;
    border-radius: 6px 0 0 6px;
    padding: 5px 9px;
    font-size: 12px;
    font-weight: 500;
  }

  .variant-row .split-caret-btn {
    background: #334155;
    color: #cbd5e1;
    border: 1px solid #475569;
    border-left: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 0 6px 6px 0;
    padding: 5px 7px;
    font-size: 11px;
  }

  .variant-row .split-primary-btn:hover:not(:disabled),
  .variant-row .split-caret-btn:hover:not(:disabled) {
    background: #6366f1;
    border-color: #6366f1;
    color: #ffffff;
  }

  /* Secondary header/modal button style */
  .variant-secondary .split-primary-btn {
    background: #334155;
    color: #f8fafc;
    border: 1px solid #475569;
    border-right: none;
    border-radius: 8px 0 0 8px;
    padding: 9px 14px;
    font-size: 13px;
    font-weight: 600;
  }

  .variant-secondary .split-caret-btn {
    background: #334155;
    color: #cbd5e1;
    border: 1px solid #475569;
    border-left: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 0 8px 8px 0;
    padding: 9px 10px;
    font-size: 12px;
    font-weight: 600;
  }

  .variant-secondary .split-primary-btn:hover:not(:disabled),
  .variant-secondary .split-caret-btn:hover:not(:disabled) {
    background: #475569;
    color: #f8fafc;
  }

  /* Primary style */
  .variant-primary .split-primary-btn {
    background: #6366f1;
    color: #ffffff;
    border: 1px solid #6366f1;
    border-right: none;
    border-radius: 8px 0 0 8px;
    padding: 9px 14px;
    font-size: 13px;
    font-weight: 600;
  }

  .variant-primary .split-caret-btn {
    background: #6366f1;
    color: #e0e7ff;
    border: 1px solid #6366f1;
    border-left: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 0 8px 8px 0;
    padding: 9px 10px;
    font-size: 12px;
  }

  .variant-primary .split-primary-btn:hover:not(:disabled),
  .variant-primary .split-caret-btn:hover:not(:disabled) {
    background: #4f46e5;
    border-color: #4f46e5;
  }

  .drop-up .split-menu {
    top: auto;
    bottom: calc(100% + 6px);
  }

  .split-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 245px;
    background: #0f172a;
    border: 1px solid #475569;
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.55);
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .split-menu-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 7px;
    padding: 8px 10px;
    cursor: pointer;
    color: #e2e8f0;
    font-family: inherit;
    transition: background 0.12s, border-color 0.12s;
  }

  .split-menu-item:hover,
  .split-menu-item:focus-visible {
    background: rgba(99, 102, 241, 0.16);
    border-color: rgba(99, 102, 241, 0.4);
    outline: none;
  }

  .menu-item-title {
    font-size: 12px;
    font-weight: 600;
    color: #f8fafc;
  }

  .menu-item-desc {
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.35;
  }
</style>
