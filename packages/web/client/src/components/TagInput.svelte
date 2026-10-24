<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchSourceTags } from '../lib/api.js';

  interface Props {
    tags?: string[];
    availableSuggestions?: string[];
    placeholder?: string;
    id?: string;
    disabled?: boolean;
    onTagsChange?: (tags: string[]) => void;
  }

  let {
    tags = $bindable([]),
    availableSuggestions,
    placeholder = 'Add a tag and press Enter...',
    id = 'tag-input',
    disabled = false,
    onTagsChange,
  }: Props = $props();

  let inputValue = $state('');
  let loadedSuggestions = $state<string[]>([]);
  let isFocused = $state(false);
  let isOpen = $state(false);
  let highlightedIndex = $state<number>(-1);
  let containerEl: HTMLDivElement | null = $state(null);
  let inputEl: HTMLInputElement | null = $state(null);

  // Load existing tags from backend if suggestions weren't provided explicitly
  onMount(() => {
    if (!availableSuggestions) {
      fetchSourceTags()
        .then((s) => {
          loadedSuggestions = s;
        })
        .catch(() => {
          loadedSuggestions = [];
        });
    }

    function handleClickOutside(e: MouseEvent) {
      if (containerEl && !containerEl.contains(e.target as Node)) {
        isOpen = false;
        highlightedIndex = -1;
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  });

  const allSuggestions = $derived(availableSuggestions ?? loadedSuggestions);

  // Suggestions filtered by current input and excluding already-chosen tags
  const filteredSuggestions = $derived.by(() => {
    const query = inputValue.trim().toLowerCase();
    const currentTags = new Set(tags.map((t) => t.toLowerCase()));

    return allSuggestions
      .filter((s) => {
        const lower = s.toLowerCase();
        if (currentTags.has(lower)) return false;
        if (!query) return true;
        return lower.includes(query);
      })
      .slice(0, 8);
  });

  function addTag(raw: string) {
    if (disabled) return;
    const parts = raw.split(',');
    const newTags = [...tags];

    for (const part of parts) {
      const normalized = part.trim().toLowerCase().replace(/^#+/, '');
      if (normalized && !newTags.map((t) => t.toLowerCase()).includes(normalized)) {
        newTags.push(normalized);
      }
    }

    tags = newTags;
    inputValue = '';
    highlightedIndex = -1;
    isOpen = false;
    onTagsChange?.(tags);
    inputEl?.focus();
  }

  function removeTag(index: number) {
    if (disabled) return;
    tags = tags.filter((_, i) => i !== index);
    onTagsChange?.(tags);
    inputEl?.focus();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (disabled) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && filteredSuggestions[highlightedIndex]) {
        addTag(filteredSuggestions[highlightedIndex]);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      e.preventDefault();
      removeTag(tags.length - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        isOpen = true;
      }
      if (filteredSuggestions.length > 0) {
        highlightedIndex = (highlightedIndex + 1) % filteredSuggestions.length;
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredSuggestions.length > 0) {
        highlightedIndex = (highlightedIndex - 1 + filteredSuggestions.length) % filteredSuggestions.length;
      }
    } else if (e.key === 'Escape') {
      isOpen = false;
      highlightedIndex = -1;
    }
  }

  function handleInputFocus() {
    isFocused = true;
    if (filteredSuggestions.length > 0) {
      isOpen = true;
    }
  }

  function handleContainerClick() {
    inputEl?.focus();
  }
</script>

<div class="tag-input-wrapper" bind:this={containerEl}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="tag-input-container"
    class:focused={isFocused}
    class:disabled
    onclick={handleContainerClick}
  >
    {#each tags as tag, index (tag)}
      <span class="tag-pill">
        <span class="tag-text">{tag}</span>
        {#if !disabled}
          <button
            type="button"
            class="tag-remove-btn"
            onclick={(e) => {
              e.stopPropagation();
              removeTag(index);
            }}
            aria-label="Remove tag {tag}"
          >
            ✕
          </button>
        {/if}
      </span>
    {/each}

    <input
      bind:this={inputEl}
      {id}
      type="text"
      class="tag-text-input"
      placeholder={tags.length === 0 ? placeholder : 'Add another...'}
      bind:value={inputValue}
      onkeydown={handleKeyDown}
      onfocus={handleInputFocus}
      onblur={() => (isFocused = false)}
      {disabled}
      autocomplete="off"
    />
  </div>

  {#if isOpen && filteredSuggestions.length > 0 && !disabled}
    <ul class="tag-dropdown" role="listbox">
      {#each filteredSuggestions as suggestion, idx (suggestion)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          class="tag-suggestion-item"
          class:highlighted={highlightedIndex === idx}
          role="option"
          aria-selected={highlightedIndex === idx}
          onclick={(e) => {
            e.stopPropagation();
            addTag(suggestion);
          }}
        >
          <span class="suggestion-icon">🏷️</span>
          <span class="suggestion-name">{suggestion}</span>
        </li>
      {/each}
      {#if inputValue.trim() && !filteredSuggestions.some((s) => s.toLowerCase() === inputValue.trim().toLowerCase())}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          class="tag-suggestion-item create-new"
          role="option"
          aria-selected={false}
          onclick={(e) => {
            e.stopPropagation();
            addTag(inputValue);
          }}
        >
          <span class="suggestion-icon">➕</span>
          <span class="suggestion-name">Create new tag <strong>"{inputValue.trim().toLowerCase()}"</strong></span>
        </li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .tag-input-wrapper {
    position: relative;
    width: 100%;
  }

  .tag-input-container {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    min-height: 42px;
    cursor: text;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .tag-input-container.focused {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
  }

  .tag-input-container.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .tag-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #1e293b;
    border: 1px solid #334155;
    color: #818cf8;
    font-size: 12px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 6px;
    line-height: 1;
    animation: pillFadeIn 0.15s ease-out;
  }

  @keyframes pillFadeIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .tag-text {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-remove-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 11px;
    padding: 0;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease;
  }

  .tag-remove-btn:hover {
    color: #f87171;
  }

  .tag-text-input {
    flex: 1;
    min-width: 110px;
    background: transparent;
    border: none;
    outline: none;
    color: #f8fafc;
    font-size: 13px;
    padding: 2px 4px;
  }

  .tag-text-input::placeholder {
    color: #64748b;
  }

  /* Autocomplete Dropdown */
  .tag-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 50;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    max-height: 200px;
    overflow-y: auto;
  }

  .tag-suggestion-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: #cbd5e1;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .tag-suggestion-item:hover,
  .tag-suggestion-item.highlighted {
    background: #334155;
    color: #f8fafc;
  }

  .tag-suggestion-item.create-new {
    border-top: 1px solid #334155;
    margin-top: 4px;
    padding-top: 8px;
    color: #818cf8;
  }

  .suggestion-icon {
    font-size: 13px;
  }

  .suggestion-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
