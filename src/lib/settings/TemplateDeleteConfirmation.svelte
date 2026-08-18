<script lang="ts">
  import { AlertTriangle, Trash2, X } from "@lucide/svelte";
  import { onMount } from "svelte";

  let {
    kind,
    name,
    relatedCount = 0,
    oncancel,
    onconfirm,
  } = $props<{
    kind: "service" | "delivery";
    name: string;
    relatedCount?: number;
    oncancel: () => void;
    onconfirm: () => void;
  }>();

  let cancelButton: HTMLButtonElement;
  let entityLabel = $derived(kind === "service" ? "serviço" : "entrega");

  onMount(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    queueMicrotask(() => cancelButton?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });
</script>

<div
  class="backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && oncancel()}
>
  <div
    class="dialog"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="template-delete-title"
    aria-describedby="template-delete-description"
  >
    <button class="close" type="button" aria-label="Fechar" onclick={oncancel}>
      <X size={18} />
    </button>
    <span class="warning" aria-hidden="true"><AlertTriangle size={25} /></span>
    <h2 id="template-delete-title">Excluir modelo de {entityLabel}?</h2>
    <p id="template-delete-description">
      O modelo <strong>{name}</strong> será removido da galeria.
      {#if kind === "service" && relatedCount > 0}
        {relatedCount === 1
          ? "A entrega associada continuará disponível sem serviço vinculado."
          : `As ${relatedCount} entregas associadas continuarão disponíveis sem serviço vinculado.`}
      {:else if kind === "delivery" && relatedCount > 0}
        {relatedCount === 1
          ? "A ocorrência desse modelo também será removida do serviço."
          : `As ${relatedCount} ocorrências desse modelo também serão removidas dos serviços.`}
      {/if}
    </p>
    <div class="actions">
      <button
        class="secondary"
        type="button"
        bind:this={cancelButton}
        onclick={oncancel}>Cancelar</button
      >
      <button class="danger" type="button" onclick={onconfirm}>
        <Trash2 size={16} />Excluir modelo
      </button>
    </div>
  </div>
</div>

<svelte:window onkeydown={(event) => event.key === "Escape" && oncancel()} />

<style>
  .backdrop {
    position: fixed;
    z-index: 3300;
    display: grid;
    padding: 20px;
    background: rgba(15, 23, 42, 0.48);
    inset: 0;
    place-items: center;
    backdrop-filter: blur(3px);
  }
  .dialog {
    position: relative;
    width: min(480px, 100%);
    padding: 28px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--surface);
    box-shadow: 0 28px 70px rgba(15, 23, 42, 0.25);
    text-align: center;
  }
  .close {
    position: absolute;
    top: 14px;
    right: 14px;
    display: grid;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 9px;
    color: var(--ink-500);
    background: transparent;
    place-items: center;
  }
  .warning {
    display: grid;
    width: 50px;
    height: 50px;
    margin: 0 auto 16px;
    border-radius: 14px;
    color: var(--red-500);
    background: rgba(220, 38, 38, 0.09);
    place-items: center;
  }
  h2 {
    color: var(--ink-950);
    font-size: var(--text-xl);
  }
  p {
    margin-top: 8px;
    color: var(--ink-500);
    font-size: var(--text-sm);
    line-height: 1.55;
  }
  p strong {
    color: var(--ink-700);
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
    margin-top: 24px;
  }
  .actions button {
    display: inline-flex;
    min-height: 42px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 10px;
    font-weight: 600;
  }
  .secondary {
    border: 1px solid var(--border);
    color: var(--ink-700);
    background: var(--surface);
  }
  .danger {
    border: 0;
    color: white;
    background: var(--red-500);
  }
  @media (max-width: 480px) {
    .actions {
      grid-template-columns: 1fr;
    }
  }
</style>
