<script lang="ts">
  import type { ItemSyncState } from '../lib/types.js';

  interface Props {
    status: ItemSyncState;
    title?: string;
  }

  let { status, title }: Props = $props();

  const resolvedTitle = $derived(
    title ?? (status === 'synced' ? 'Already synced into knowledge base' : 'New item pending sync')
  );
</script>

<span
  class="sync-status-badge {status}"
  data-sync-status={status}
  title={resolvedTitle}
>
  {status === 'synced' ? 'Synced' : 'New'}
</span>

<style>
  .sync-status-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 7px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .sync-status-badge.synced {
    background: rgba(16, 185, 129, 0.16);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.35);
  }

  .sync-status-badge.new {
    background: rgba(59, 130, 246, 0.16);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.35);
  }
</style>
