<script lang="ts">
  import { Plus } from "@lucide/svelte";

  let { collapsed } = $props<{ collapsed: boolean }>();
</script>

<button
  class:collapsed
  class="create-button"
  type="button"
  title="Adicionar (em breve)"
>
  <Plus size={19} strokeWidth={2.4} />
  <span>Adicionar</span>
</button>

<style>
  .create-button {
    display: flex;
    min-height: 42px;
    width: calc(100% - 28px);
    align-items: center;
    justify-content: center;
    gap: 9px;
    margin: 16px 14px 2px;
    border: 0;
    border-radius: 11px;
    color: white;
    background: var(--green-500);
    font-size: var(--text-sm);
    font-weight: 650;
    transition:
      filter var(--motion-fast),
      transform var(--motion-fast);
  }
  .create-button:hover {
    filter: brightness(1.06);
  }
  .create-button:active {
    transform: translateY(1px);
  }
  .collapsed {
    width: 42px;
    margin-inline: auto;
  }
  .collapsed span {
    display: none;
  }
</style>
