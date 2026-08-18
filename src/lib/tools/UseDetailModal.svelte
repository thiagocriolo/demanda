<script lang="ts">
  import { CheckCircle2, ExternalLink, LockKeyhole, X } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";
  import Tabs from "$lib/ui/Tabs.svelte";
  import {
    loadToolResponses,
    submitToolResponse,
    ToolApiError,
    updateToolUse,
  } from "./client";
  import { findToolResource } from "./catalog";
  import ToolResultsPanel from "./ToolResultsPanel.svelte";
  import ToolResponsePanel from "./responders/ToolResponsePanel.svelte";
  import type { ToolResponse, ToolResponsePayload, ToolUse } from "./types";

  let { initialUse, authenticatedUserId, onclose, onupdated } = $props<{
    initialUse: ToolUse;
    authenticatedUserId: string;
    onclose: () => void;
    onupdated: (use: ToolUse) => void;
  }>();
  const seedUse = untrack(() => initialUse);
  let use = $state(structuredClone(seedUse));
  let tab = $state("interaction");
  let responses = $state<ToolResponse[]>([]);
  let loading = $state(true);
  let pending = $state(false);
  let errorMessage = $state("");
  let successMessage = $state("");
  let resource = $derived(findToolResource(use.toolKey));
  let ResourceIcon = $derived(resource.icon);
  let currentResponse = $derived(
    responses.find(({ respondent }) => respondent.id === authenticatedUserId),
  );
  let tabs = $derived([
    { id: "interaction", label: "Responder" },
    { id: "results", label: "Resultados", badge: responses.length },
  ]);

  async function loadResponses(): Promise<void> {
    loading = true;
    errorMessage = "";
    try {
      responses = await loadToolResponses(use.id);
    } catch (cause) {
      errorMessage =
        cause instanceof ToolApiError
          ? cause.message
          : "Não foi possível carregar as respostas.";
    } finally {
      loading = false;
    }
  }

  async function submit(payload: ToolResponsePayload): Promise<void> {
    pending = true;
    errorMessage = "";
    successMessage = "";
    try {
      await submitToolResponse(use.id, payload);
      await loadResponses();
      successMessage = "Resposta salva com sucesso.";
      tab = "results";
    } catch (cause) {
      errorMessage =
        cause instanceof ToolApiError
          ? cause.message
          : "Não foi possível enviar a resposta.";
    } finally {
      pending = false;
    }
  }

  async function finish(): Promise<void> {
    pending = true;
    errorMessage = "";
    try {
      use = await updateToolUse(use.id, {
        name: use.name,
        taskId: use.taskId,
        content: use.content,
        status: "completed",
        version: use.version,
      });
      onupdated(use);
      tab = "results";
    } catch (cause) {
      errorMessage =
        cause instanceof ToolApiError
          ? cause.message
          : "Não foi possível concluir o Uso.";
    } finally {
      pending = false;
    }
  }

  onMount(() => void loadResponses());
</script>

<div
  class="tool-modal-backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && onclose()}
>
  <div
    class="tool-modal tool-modal--participant"
    role="dialog"
    aria-modal="true"
    aria-labelledby="tool-detail-title"
  >
    <header class="tool-modal__header tool-participant-header">
      <div class="tool-detail-identity">
        <span class="tool-resource-icon"><ResourceIcon size={21} /></span>
        <div>
          <span>{resource.name}</span>
          <h2 id="tool-detail-title">{use.name}</h2>
          {#if use.context}<p>
              {use.context.project.name} · {use.context.task.name}
            </p>{/if}
        </div>
      </div>
      <div class="tool-detail-actions">
        {#if use.status === "open"}<button
            class="tool-secondary-button"
            type="button"
            disabled={pending}
            onclick={() => void finish()}
            ><CheckCircle2 size={15} /> Encerrar uso</button
          >{/if}<button
          class="tool-icon-button"
          type="button"
          aria-label="Fechar"
          onclick={onclose}><X size={19} /></button
        >
      </div>
    </header>
    <div class="tool-detail-tabs">
      <Tabs
        items={tabs}
        bind:value={tab}
        ariaLabel="Uso e resultados"
        tabIdPrefix="tool-detail-tab"
        panelId="tool-detail-panel"
      />
    </div>
    <div
      id="tool-detail-panel"
      class="tool-modal__body tool-participant-body"
      role="tabpanel"
    >
      {#if errorMessage}<p class="tool-form-error" role="alert">
          {errorMessage}
        </p>{/if}
      {#if successMessage}<p class="tool-form-success" role="status">
          {successMessage}
        </p>{/if}
      {#if tab === "interaction"}
        <div class="tool-response-intro">
          {#if "instructions" in use.configSnapshot && use.configSnapshot.instructions}<p
            >
              {use.configSnapshot.instructions}
            </p>{/if}
        </div>
        {#if use.status === "open"}
          <ToolResponsePanel
            {use}
            initial={currentResponse?.payload}
            {pending}
            onsubmit={(payload) => void submit(payload)}
          />
        {:else}
          <div class="tool-results-empty">
            <LockKeyhole size={28} /><strong
              >{use.status === "draft"
                ? "Uso ainda em preparação"
                : "Interação encerrada"}</strong
            ><span
              >{use.status === "draft"
                ? "Publique o Uso para começar a receber respostas."
                : "Consulte os resultados registrados."}</span
            >
          </div>
        {/if}
      {:else if loading}
        <div class="tool-results-empty">
          <ExternalLink size={26} /><strong>Carregando resultados…</strong>
        </div>
      {:else}
        <ToolResultsPanel {use} {responses} />
      {/if}
    </div>
  </div>
</div>

<svelte:window onkeydown={(event) => event.key === "Escape" && onclose()} />
