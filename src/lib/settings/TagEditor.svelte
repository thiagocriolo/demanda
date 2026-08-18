<script lang="ts">
  import { Plus, Trash2 } from "@lucide/svelte";
  let { tags = $bindable() } = $props<{ tags: string[] }>();
  let draft = $state("");
  function addTag(): void {
    const value = draft.trim();
    if (!value || tags.includes(value) || tags.length >= 100) return;
    tags = [...tags, value];
    draft = "";
  }
</script>

<div class="tag-add">
  <input
    class="settings-input"
    placeholder="Nova tag"
    maxlength="40"
    bind:value={draft}
    onkeydown={(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addTag();
      }
    }}
  />
  <button class="settings-button" type="button" onclick={addTag}
    ><Plus size={16} />Adicionar</button
  >
</div>
<div class="tag-list">
  {#each tags as tag, index (`${tag}-${index}`)}
    <span
      >{tag}<button
        type="button"
        aria-label={`Excluir ${tag}`}
        onclick={() =>
          (tags = tags.filter(
            (_: string, candidate: number) => candidate !== index,
          ))}><Trash2 size={14} /></button
      ></span
    >
  {:else}
    <p>Nenhuma tag cadastrada.</p>
  {/each}
</div>

<style>
  .tag-add {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 9px;
  }
  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .tag-list > span {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    gap: 7px;
    padding: 0 7px 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    color: var(--ink-700);
    background: var(--surface-soft);
    font-size: var(--text-sm);
  }
  .tag-list button {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: var(--danger);
    background: var(--surface);
  }
  .tag-list p {
    color: var(--ink-400);
    font-size: var(--text-sm);
  }
  @media (max-width: 520px) {
    .tag-add {
      grid-template-columns: 1fr;
    }
  }
</style>
