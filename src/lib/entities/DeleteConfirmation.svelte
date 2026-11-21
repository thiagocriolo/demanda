<script lang="ts">
  import { AlertTriangle, Archive, Trash2, X } from "@lucide/svelte";

  let {
    entityName,
    oncancel,
    onarchive,
    onconfirm,
    onkeepfinancialentries,
    softDeleteOnly = false,
    deleteWarning,
    contractFinancialEntries = false,
    allowArchive = true,
  } = $props<{
    entityName: string;
    oncancel: () => void;
    onarchive?: () => void;
    onconfirm: () => void;
    onkeepfinancialentries?: () => void;
    softDeleteOnly?: boolean;
    deleteWarning?: string;
    contractFinancialEntries?: boolean;
    allowArchive?: boolean;
  }>();
</script>

<div
  class="backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && oncancel()}
>
  <div
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="delete-title"
    aria-describedby="delete-description"
  >
    <button class="close" type="button" aria-label="Fechar" onclick={oncancel}>
      <X size={18} />
    </button>
    <span class="icon"><AlertTriangle size={25} /></span>
    <h2 id="delete-title">
      {softDeleteOnly
        ? "Arquivar cadastro?"
        : contractFinancialEntries
          ? "Excluir contrato?"
          : "Excluir cadastro?"}
    </h2>
    <p id="delete-description">
      {#if softDeleteOnly}
        <strong>{entityName}</strong> deixará de aparecer nas listagens ativas, mas
        continuará preservado no workspace.
      {:else if contractFinancialEntries}
        Tem certeza de que deseja excluir <strong>{entityName}</strong>? Escolha
        se os lanÃ§amentos financeiros desse contrato devem ser mantidos.
      {:else}
        Tem certeza de que deseja excluir <strong>{entityName}</strong>? Esta
        ação removerá o cadastro permanentemente.
        {#if deleteWarning} {deleteWarning}{/if}
      {/if}
    </p>
    <div class:financial-choice={contractFinancialEntries} class="actions">
      <button
        class:financial-cancel={contractFinancialEntries}
        class="secondary"
        type="button"
        onclick={oncancel}
        >Cancelar</button
      >
      {#if !softDeleteOnly && allowArchive}
        <button
          class="archive"
          type="button"
          disabled={!onarchive}
          onclick={() => onarchive?.()}
        >
          <Archive size={16} />Arquivar
        </button>
      {/if}
      {#if contractFinancialEntries}
        <button class="danger" type="button" onclick={onconfirm}>
          <Trash2 size={16} />Excluir e remover lanÃ§amentos
        </button>
        <button class="keep-financial" type="button" onclick={() => onkeepfinancialentries?.()}>
          <Trash2 size={16} />Excluir e manter lanÃ§amentos
        </button>
      {:else}
        <button
          class:archive={softDeleteOnly}
          class:danger={!softDeleteOnly}
          type="button"
          onclick={onconfirm}
        >
          {#if softDeleteOnly}<Archive size={16} />Arquivar{:else}<Trash2
              size={16}
            />Excluir{/if}
        </button>
      {/if}
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
  [role="alertdialog"] {
    position: relative;
    width: min(500px, 100%);
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
    border: 0;
    border-radius: 9px;
    color: var(--ink-500);
    background: transparent;
    place-items: center;
  }
  .icon {
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
    margin-top: 24px;
  }
  .actions:has(button:nth-child(2):last-child) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .actions.financial-choice {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .financial-cancel {
    grid-column: 1 / -1;
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
  .archive {
    border: 0;
    color: white;
    background: #b7791f;
  }
  .danger {
    border: 0;
    color: white;
    background: var(--red-500);
  }
  .keep-financial {
    border: 0;
    color: white;
    background: var(--primary);
  }
  .actions button:disabled {
    border: 1px solid var(--border);
    color: var(--muted);
    background: var(--surface-soft);
    cursor: not-allowed;
  }
  @media (max-width: 520px) {
    .actions {
      grid-template-columns: 1fr;
    }
  }
</style>
