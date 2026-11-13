<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import {
    Check,
    CircleAlert,
    LoaderCircle,
    Play,
    ShieldCheck,
  } from "@lucide/svelte";
  import { executeRecordCommand } from "$lib/assistant/record-actions";
  import {
    compileRecordCommandQueue,
    executeCompiledRecordCommandQueue,
    type CompiledQueueCommand,
    type QueueCommandProgress,
  } from "$lib/assistant/execution-queue";
  import {
    commandDocumentFromHash,
    commandDocumentFromUrl,
  } from "$lib/assistant/command-url";
  import { parseRecordCommands } from "$lib/assistant/record-commands";

  let queue = $state<CompiledQueueCommand[]>();
  let validationError = $state("");
  let progress = $state<QueueCommandProgress[]>([]);
  let executing = $state(false);
  let completed = $state(false);
  let commandPayload = $state<string | null>(null);
  let loadedPayload = $state(false);

  function readCommandPayload(): void {
    commandPayload =
      new URLSearchParams(window.location.hash.slice(1)).get("commands") ??
      page.url.searchParams.get("commands");
    loadedPayload = true;
  }

  onMount(() => {
    readCommandPayload();
    window.addEventListener("hashchange", readCommandPayload);
    return () => window.removeEventListener("hashchange", readCommandPayload);
  });

  function label(command: CompiledQueueCommand["command"]): string {
    const labels = {
      contact: "Contato",
      business: "Negócio",
      project: "Projeto",
      task: "Tarefa",
      service_template: "Modelo de serviço",
      delivery_template: "Modelo de entrega",
    } as const;
    return `${labels[command.kind]}: ${command.name}`;
  }

  function description(command: CompiledQueueCommand["command"]): string {
    if (command.kind === "project") {
      return `Tipo: ${command.contractType === "recurring" ? "Cíclico" : "Pontual"}.`;
    }
    if (command.kind === "task" && command.subtasks?.length) {
      return `${command.subtasks.length} subtarefa(s) será(ão) criada(s).`;
    }
    if (command.kind === "delivery_template" && command.subtasks?.length) {
      return `${command.subtasks.length} subtarefa(s) será(ão) incluída(s) no modelo.`;
    }
    return "";
  }

  function statusLabel(status: QueueCommandProgress["status"]): string {
    return {
      pending: "Aguardando",
      running: "Executando",
      succeeded: "Concluído",
      failed: "Falhou",
      needs_resolution: "Precisa de decisão",
      blocked: "Bloqueado",
    }[status];
  }

  $effect(() => {
    if (!loadedPayload) return;
    validationError = "";
    progress = [];
    completed = false;
    try {
      const document = window.location.hash
        ? commandDocumentFromHash(window.location.hash)
        : commandDocumentFromUrl(commandPayload);
      const parsed = parseRecordCommands(document);
      if (!parsed.ok) throw new Error(parsed.message);
      if (!parsed.queueCommands) {
        throw new Error(
          "O link precisa conter um documento JSON do protocolo v2.",
        );
      }
      queue = compileRecordCommandQueue(parsed.queueCommands);
    } catch (cause) {
      queue = undefined;
      validationError =
        cause instanceof Error
          ? cause.message
          : "Não foi possível validar os comandos deste link.";
    }
  });

  async function confirm(): Promise<void> {
    if (!queue || executing || completed) return;
    executing = true;
    try {
      await executeCompiledRecordCommandQueue(
        queue,
        executeRecordCommand,
        (next) => {
          progress = next;
        },
      );
      completed = true;
    } finally {
      executing = false;
    }
  }
</script>

<svelte:head><title>Revisar comandos · Demanda</title></svelte:head>

<section class="review-page">
  <header class="review-header">
    <span class="eyebrow"><ShieldCheck size={16} />Revisão segura</span>
    <h1>Confirme o que será criado</h1>
    <p>
      Nenhuma alteração foi feita ao abrir este link. Revise a fila abaixo e
      confirme quando estiver pronto.
    </p>
  </header>

  {#if !loadedPayload}
    <section class="alert" aria-live="polite">
      <LoaderCircle class="spin" size={20} />
      <div><strong>Preparando a analise do lote...</strong></div>
    </section>
  {:else if validationError}
    <section class="alert" role="alert">
      <CircleAlert size={20} />
      <div>
        <strong>Não foi possível preparar este lote.</strong><span
          >{validationError}</span
        >
      </div>
    </section>
  {:else if queue}
    <section class="queue-card" aria-label="Comandos aguardando confirmação">
      <div class="queue-card__head">
        <div>
          <strong>{queue.length} comando(s) pronto(s) para execução</strong>
          <span
            >Dependências são executadas antes dos respectivos descendentes.</span
          >
        </div>
        {#if completed}<span class="complete"
            ><Check size={16} />Execução concluída</span
          >{/if}
      </div>

      <ol class="command-list">
        {#each queue as item (item.id)}
          {@const current = progress.find(({ id }) => id === item.id)}
          <li
            class:running={current?.status === "running"}
            class:succeeded={current?.status === "succeeded"}
            class:failed={current?.status === "failed" ||
              current?.status === "needs_resolution"}
            class:blocked={current?.status === "blocked"}
          >
            <div class="command-index">
              {#if current?.status === "succeeded"}<Check
                  size={16}
                />{:else}{item.id}{/if}
            </div>
            <div class="command-content">
              <strong>{label(item.command)}</strong>
              {#if description(item.command)}<span
                  >{description(item.command)}</span
                >{/if}
              {#if item.dependsOn.length}<small
                  >Depende de: {item.dependsOn.join(", ")}</small
                >{/if}
              {#if current?.message}<span>{current.message}</span>{/if}
            </div>
            {#if current}<small class="status"
                >{statusLabel(current.status)}</small
              >{/if}
          </li>
        {/each}
      </ol>
    </section>

    <footer class="review-actions">
      <p>
        <ShieldCheck size={16} />A confirmação exige sua sessão autenticada e
        executa somente os comandos permitidos.
      </p>
      <button type="button" onclick={confirm} disabled={executing || completed}>
        {#if executing}<LoaderCircle
            size={18}
          />Executando…{:else if completed}<Check
            size={18}
          />Concluído{:else}<Play size={18} />Confirmar e executar{/if}
      </button>
    </footer>
  {/if}
</section>

<style>
  .review-page {
    max-width: 860px;
    margin: 0 auto;
    padding: clamp(16px, 3vw, 38px) 0;
  }
  .review-header {
    max-width: 660px;
  }
  .eyebrow,
  .complete {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--brand-700, #4d47ba);
    font-size: 0.77rem;
    font-weight: 800;
  }
  .eyebrow {
    border-radius: 999px;
    padding: 6px 10px;
    background: var(--brand-50, #f0efff);
  }
  h1 {
    margin: 13px 0 8px;
    color: var(--ink-950, #20233a);
    font-size: clamp(30px, 4vw, 42px);
    letter-spacing: -0.045em;
  }
  .review-header p {
    margin: 0;
    color: var(--ink-500, #697083);
    line-height: 1.5;
  }
  .queue-card,
  .alert {
    margin-top: 24px;
    border: 1px solid var(--border, #dde1ec);
    border-radius: 18px;
    background: var(--panel, #fff);
    box-shadow: var(--shadow-sm, 0 4px 15px rgb(23 31 66 / 7%));
  }
  .queue-card__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 17px 18px;
    border-bottom: 1px solid var(--border, #dde1ec);
  }
  .queue-card__head strong,
  .queue-card__head span {
    display: block;
  }
  .queue-card__head strong {
    color: var(--ink-800, #30364a);
  }
  .queue-card__head span {
    margin-top: 3px;
    color: var(--ink-500, #697083);
    font-size: 0.78rem;
  }
  .complete {
    flex: none;
    color: #237451 !important;
  }
  .command-list {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 12px;
    list-style: none;
  }
  .command-list li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px;
    border-radius: 11px;
    background: var(--surface-soft, #f6f7fb);
  }
  .command-index {
    display: grid;
    width: 29px;
    min-height: 29px;
    flex: none;
    place-items: center;
    border-radius: 8px;
    color: var(--brand-700, #4d47ba);
    background: var(--brand-50, #f0efff);
    font-size: 0.61rem;
    font-weight: 800;
    word-break: break-all;
  }
  .command-content {
    min-width: 0;
    flex: 1;
  }
  .command-content strong,
  .command-content span,
  .command-content small {
    display: block;
  }
  .command-content strong {
    color: var(--ink-800, #30364a);
    font-size: 0.84rem;
  }
  .command-content span,
  .command-content small {
    margin-top: 3px;
    color: var(--ink-500, #697083);
    font-size: 0.75rem;
    line-height: 1.35;
  }
  .status {
    flex: none;
    color: var(--ink-500, #697083);
    font-size: 0.67rem;
    font-weight: 800;
  }
  .command-list li.running {
    background: #edecff;
  }
  .command-list li.succeeded {
    background: #e9f8ef;
  }
  .command-list li.failed {
    background: #fff0f2;
  }
  .command-list li.blocked {
    background: #fff7df;
  }
  .review-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-top: 20px;
    padding: 14px 0;
  }
  .review-actions p {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 0;
    color: var(--ink-500, #697083);
    font-size: 0.76rem;
    line-height: 1.4;
  }
  .review-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    flex: none;
    border: 0;
    border-radius: 10px;
    padding: 11px 14px;
    color: #fff;
    background: var(--primary, #5d57d9);
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }
  .review-actions button:disabled {
    cursor: default;
    opacity: 0.62;
  }
  .review-actions :global(svg) {
    flex: none;
  }
  .review-actions button :global(svg) {
    animation: spin 800ms linear infinite;
  }
  .review-actions button:not(:disabled) :global(svg) {
    animation: none;
  }
  .alert {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 16px;
    color: #9c3445;
    background: #fff1f2;
  }
  .alert strong,
  .alert span {
    display: block;
  }
  .alert span {
    margin-top: 3px;
    font-size: 0.8rem;
    line-height: 1.4;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 620px) {
    .queue-card__head,
    .review-actions {
      align-items: stretch;
      flex-direction: column;
    }
    .review-actions button {
      width: 100%;
    }
  }
</style>
