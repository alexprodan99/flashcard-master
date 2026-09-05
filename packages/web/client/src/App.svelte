<script lang="ts">
  import { onMount } from 'svelte';
  import Navigation from './components/Navigation.svelte';
  import DashboardView from './views/DashboardView.svelte';
  import SourcesView from './views/SourcesView.svelte';
  import GenerateStudio from './views/GenerateStudio.svelte';
  import QuestionExplorer from './views/QuestionExplorer.svelte';
  import ExportCenter from './views/ExportCenter.svelte';

  let activeTab = $state('dashboard');

  function handleSelectTab(tab: string, queryParams?: Record<string, string>) {
    activeTab = tab;
    if (queryParams && typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(queryParams);
      searchParams.set('tab', tab);
      window.history.pushState(null, '', `?${searchParams.toString()}`);
    }
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
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['dashboard', 'sources', 'generate', 'cards', 'export'].includes(tabParam)) {
      activeTab = tabParam;
    } else if (params.get('docId') || params.get('sourceId')) {
      activeTab = 'generate';
    }

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
      <SourcesView onNavigate={handleSelectTab} />
    {:else if activeTab === 'generate'}
      <GenerateStudio onNavigate={handleSelectTab} />
    {:else if activeTab === 'cards'}
      <QuestionExplorer />
    {:else if activeTab === 'export'}
      <ExportCenter />
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
</style>