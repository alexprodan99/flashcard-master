<script lang="ts">
  import { onMount } from 'svelte';
  import Navigation from './components/Navigation.svelte';
  import DashboardView from './views/DashboardView.svelte';
  import SourcesView from './views/SourcesView.svelte';

  let activeTab = $state('dashboard');

  function handleSelectTab(tab: string) {
    activeTab = tab;
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Ignore keybindings if user is typing in an input or textarea
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return;
    }

    if (e.key === '1') activeTab = 'dashboard';
    else if (e.key === '2' || e.key.toLowerCase() === 's') activeTab = 'sources';
    else if (e.key === '3' || e.key.toLowerCase() === 'g') activeTab = 'generate';
    else if (e.key === '4') activeTab = 'cards';
    else if (e.key === '5' || e.key.toLowerCase() === 'e') activeTab = 'export';
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div class="app-layout">
  <Navigation {activeTab} onSelectTab={handleSelectTab} />

  <main class="content-area">
    {#if activeTab === 'dashboard'}
      <DashboardView onNavigate={handleSelectTab} />
    {:else if activeTab === 'sources'}
      <SourcesView />
    {:else if activeTab === 'generate'}
      <div class="placeholder-view">
        <h2>⚡ Generate Studio</h2>
        <p>Loading AI synthesizer...</p>
      </div>
    {:else if activeTab === 'cards'}
      <div class="placeholder-view">
        <h2>🗂️ Question Explorer</h2>
        <p>Loading flashcard database...</p>
      </div>
    {:else if activeTab === 'export'}
      <div class="placeholder-view">
        <h2>🚀 Export Center</h2>
        <p>Loading export targets...</p>
      </div>
    {/if}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #0b0f19;
    color: #f1f5f9;
    -webkit-font-smoothing: antialiased;
  }

  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  .app-layout {
    display: flex;
    min-height: 100vh;
    width: 100%;
    background: #0b0f19;
  }

  .content-area {
    flex: 1;
    overflow-y: auto;
    background: #0b0f19;
  }

  .placeholder-view {
    padding: 40px;
    color: #94a3b8;
  }

  .placeholder-view h2 {
    color: #f8fafc;
    margin: 0 0 8px 0;
  }
</style>