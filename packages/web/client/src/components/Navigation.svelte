<script lang="ts">
  interface Props {
    activeTab: string;
    onSelectTab: (tab: string) => void;
  }

  let { activeTab, onSelectTab }: Props = $props();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', shortcut: '1' },
    { id: 'sources', label: 'Data Sources', icon: '🌐', shortcut: '2 (s)' },
    { id: 'generate', label: 'Generate Studio', icon: '⚡', shortcut: '3 (g)' },
    { id: 'cards', label: 'Question Explorer', icon: '🗂️', shortcut: '4' },
    { id: 'export', label: 'Export & Anki', icon: '🚀', shortcut: '5 (e)' },
  ];
</script>

<aside class="sidebar">
  <div class="brand">
    <div class="logo">🗂️</div>
    <div class="brand-text">
      <h2>Flashcard Master</h2>
      <span>AI Engineering Studio</span>
    </div>
  </div>

  <nav class="nav-list">
    {#each navItems as item}
      <button
        type="button"
        id="nav-{item.id}"
        class="nav-btn"
        class:active={activeTab === item.id}
        onclick={() => onSelectTab(item.id)}
      >
        <span class="icon">{item.icon}</span>
        <span class="label">{item.label}</span>
      </button>
    {/each}
  </nav>

  <div class="sidebar-footer">
    <div class="status-indicator">
      <span class="dot"></span>
      <span>Engine Ready</span>
    </div>
    <div class="version-tag">v1.0.0 (Svelte 5)</div>
  </div>
</aside>

<style>
  .sidebar {
    width: 260px;
    background: #0f172a;
    border-right: 1px solid #1e293b;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    user-select: none;
  }

  .brand {
    padding: 24px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid #1e293b;
  }

  .logo {
    font-size: 28px;
    background: rgba(99, 102, 241, 0.15);
    padding: 6px;
    border-radius: 8px;
    border: 1px solid rgba(99, 102, 241, 0.3);
  }

  .brand-text h2 {
    font-size: 16px;
    font-weight: 700;
    color: #f8fafc;
    margin: 0;
    letter-spacing: -0.02em;
  }

  .brand-text span {
    font-size: 11px;
    color: #6366f1;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .nav-list {
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    width: 100%;
  }

  .nav-btn:hover {
    background: #1e293b;
    color: #f1f5f9;
  }

  .nav-btn.active {
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    border-color: rgba(99, 102, 241, 0.3);
    font-weight: 600;
  }

  .icon {
    font-size: 16px;
  }

  .sidebar-footer {
    padding: 16px 20px;
    border-top: 1px solid #1e293b;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #10b981;
    font-weight: 500;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
  }

  .version-tag {
    font-size: 11px;
    color: #64748b;
    font-family: monospace;
  }
</style>