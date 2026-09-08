<script lang="ts">
  import { toastStore } from '../stores/index.js';
</script>

{#if toastStore.toasts.length > 0}
  <div class="toast-container" aria-live="polite">
    {#each toastStore.toasts as toast (toast.id)}
      <div class="toast-item {toast.type}" role="status">
        <span class="toast-icon">
          {#if toast.type === 'success'}
            ✅
          {:else if toast.type === 'error'}
            ❌
          {:else if toast.type === 'warning'}
            ⚠️
          {:else}
            ℹ️
          {/if}
        </span>
        <span class="toast-message">{toast.message}</span>
        <button
          type="button"
          class="btn-toast-dismiss"
          onclick={() => toastStore.dismiss(toast.id)}
          aria-label="Dismiss notification"
        >
          ✕
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
    max-width: 460px;
    width: 100%;
  }

  .toast-item {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    animation: slideIn 0.25s ease-out;
    backdrop-filter: blur(8px);
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .toast-item.success {
    background: rgba(6, 78, 59, 0.95);
    border: 1px solid #059669;
    color: #a7f3d0;
  }

  .toast-item.error {
    background: rgba(127, 29, 29, 0.95);
    border: 1px solid #dc2626;
    color: #fecaca;
  }

  .toast-item.warning {
    background: rgba(120, 53, 15, 0.95);
    border: 1px solid #d97706;
    color: #fde68a;
  }

  .toast-item.info {
    background: rgba(30, 41, 59, 0.95);
    border: 1px solid #3b82f6;
    color: #bfdbfe;
  }

  .toast-icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .toast-message {
    flex: 1;
    word-break: break-word;
  }

  .btn-toast-dismiss {
    background: transparent;
    border: none;
    color: inherit;
    opacity: 0.6;
    font-size: 14px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }

  .btn-toast-dismiss:hover {
    opacity: 1;
  }
</style>
