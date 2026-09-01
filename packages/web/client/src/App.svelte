<script lang="ts">
  let appName = $state('Flashcard Master');
  let count = $state(0);
</script>

<main style="font-family: 'Inter', sans-serif; padding: 24px; color: #f1f5f9; background: #0f172a; min-height: 100vh;">
  <h1 style="font-size: 24px; font-weight: 700;">{appName} (Svelte 5)</h1>
  <p style="color: #94a3b8; font-size: 14px;">Next-generation reactive flashcard engineering studio.</p>
  <button
    style="margin-top: 16px; padding: 8px 16px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;"
    onclick={() => count++}
  >
    Clicks: {count}
  </button>
</main>