<script lang="ts">
  import { ArrowRight } from "@lucide/svelte";
</script>

<div class="next-step">
  <div>
    <strong>Próxima etapa</strong>
    <small>Desenhar esta página após a aprovação da casca.</small>
  </div>
  <ArrowRight size={19} />
</div>

<style>
  .next-step {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin-top: 42px;
    padding: 15px 16px;
    border: 1px solid var(--border);
    border-radius: 13px;
    color: var(--ink-400);
    background: var(--surface-soft);
  }
  .next-step div {
    display: grid;
    gap: 3px;
  }
  strong {
    color: var(--ink-700);
    font-size: var(--text-sm);
  }
  small {
    color: var(--ink-500);
    font-size: var(--text-xs);
  }
</style>
