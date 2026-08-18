<script lang="ts">
  import { Save, X } from "@lucide/svelte";
  import { untrack } from "svelte";
  import { createToolModel, ToolApiError, updateToolModel } from "./client";
  import { findToolResource, toolResources } from "./catalog";
  import ToolModelFields from "./editors/ToolModelFields.svelte";
  import {
    defaultToolConfig,
    type ToolConfig,
    type ToolKey,
    type ToolModel,
  } from "./types";

  let {
    workspaceId,
    model,
    initialToolKey = "form",
    onclose,
    onsaved,
  } = $props<{
    workspaceId: string;
    model?: ToolModel;
    initialToolKey?: ToolKey;
    onclose: () => void;
    onsaved: (model: ToolModel) => void;
  }>();

  const seed = untrack(() => ({ model, initialToolKey }));
  let toolKey = $state<ToolKey>(seed.model?.toolKey ?? seed.initialToolKey);
  let name = $state(seed.model?.name ?? "");
  let description = $state(seed.model?.description ?? "");
  let config = $state<ToolConfig>(
    seed.model
      ? structuredClone(seed.model.config)
      : defaultToolConfig(seed.initialToolKey),
  );
  let pending = $state(false);
  let formError = $state("");
  let resource = $derived(findToolResource(toolKey));

  function selectTool(next: ToolKey): void {
    if (model) return;
    toolKey = next;
    config = defaultToolConfig(next);
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (pending) return;
    if (!name.trim()) {
      formError = "Dê um nome para identificar este Modelo.";
      return;
    }
    pending = true;
    formError = "";
    try {
      const saved = model
        ? await updateToolModel(model.id, {
            name: name.trim(),
            description: description.trim(),
            config,
            version: model.version,
          })
        : await createToolModel({
            workspaceId,
            toolKey,
            name: name.trim(),
            description: description.trim(),
            config,
          });
      onsaved(saved);
    } catch (cause) {
      formError =
        cause instanceof ToolApiError
          ? cause.message
          : "Não foi possível salvar o Modelo.";
    } finally {
      pending = false;
    }
  }
</script>

<div
  class="tool-modal-backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && onclose()}
>
  <div
    class="tool-modal tool-modal--wide"
    role="dialog"
    aria-modal="true"
    aria-labelledby="tool-model-title"
  >
    <header class="tool-modal__header">
      <div>
        <span>{model ? "Editar modelo" : "Novo modelo"}</span>
        <h2 id="tool-model-title">
          {model ? model.name : "Configure uma estrutura reutilizável"}
        </h2>
      </div>
      <button
        class="tool-icon-button"
        type="button"
        aria-label="Fechar"
        onclick={onclose}><X size={19} /></button
      >
    </header>
    <form class="tool-modal__form" onsubmit={save}>
      <div class="tool-modal__body">
        <div class="tool-step-label">
          <span>1</span>
          <div>
            <strong>Ferramenta</strong><small
              >Capacidade global disponibilizada pela plataforma</small
            >
          </div>
        </div>
        <div class="tool-choice-grid tool-choice-grid--4">
          {#each toolResources as item (item.key)}
            {@const Icon = item.icon}
            <button
              class:active={toolKey === item.key}
              type="button"
              disabled={Boolean(model)}
              onclick={() => selectTool(item.key)}
              ><span><Icon size={20} /></span><strong>{item.name}</strong
              ></button
            >
          {/each}
        </div>
        <div class="tool-step-label">
          <span>2</span>
          <div>
            <strong>Identificação do Modelo</strong><small
              >Essas informações serão reutilizadas em novos Usos</small
            >
          </div>
        </div>
        <div class="tool-grid tool-grid--2">
          <label class="tool-field"
            ><span>Nome do modelo</span><input
              bind:value={name}
              maxlength="120"
              required
              placeholder={`Ex.: ${resource.name} para identidade visual`}
            /></label
          >
          <label class="tool-field"
            ><span>Descrição</span><input
              bind:value={description}
              maxlength="500"
              placeholder="Quando este modelo deve ser usado?"
            /></label
          >
        </div>
        <div class="tool-step-label">
          <span>3</span>
          <div>
            <strong>Configuração de {resource.name}</strong><small
              >Conteúdo que será copiado como snapshot para cada Uso</small
            >
          </div>
        </div>
        <div class="tool-model-fields">
          <ToolModelFields {config} onchange={(next) => (config = next)} />
        </div>
        {#if formError}<p class="tool-form-error" role="alert">
            {formError}
          </p>{/if}
      </div>
      <footer class="tool-modal__footer">
        <button class="tool-cancel-button" type="button" onclick={onclose}
          >Cancelar</button
        ><button class="tool-primary-button" type="submit" disabled={pending}
          ><Save size={16} />
          {pending
            ? "Salvando…"
            : model
              ? "Salvar alterações"
              : "Criar modelo"}</button
        >
      </footer>
    </form>
  </div>
</div>

<svelte:window onkeydown={(event) => event.key === "Escape" && onclose()} />
