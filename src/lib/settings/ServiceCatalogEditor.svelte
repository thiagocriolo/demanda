<script lang="ts">
  import { Plus, Trash2 } from "@lucide/svelte";
  import type { Service } from "./types";
  let { services = $bindable(), usedIds = [] } = $props<{
    services: Service[];
    usedIds?: string[];
  }>();

  function addService(): void {
    services = [
      ...services,
      {
        id: crypto.randomUUID(),
        name: "Novo serviço",
        description: "",
        icon: "sparkles",
        color: "#2E56FF",
      },
    ];
  }
</script>

<div class="settings-list-head">
  <p>{services.length} de 100 serviços</p>
  <button class="settings-button" type="button" onclick={addService}
    ><Plus size={16} />Adicionar serviço</button
  >
</div>
<div class="service-list">
  {#each services as service (service.id)}
    <article style={`--service-color:${service.color}`}>
      <div class="service-color">
        <input
          type="color"
          bind:value={service.color}
          aria-label={`Cor de ${service.name}`}
        />
      </div>
      <div class="settings-field-grid">
        <label class="settings-field"
          >Nome<input
            class="settings-input"
            maxlength="80"
            bind:value={service.name}
          /></label
        >
        <label class="settings-field"
          >Ícone<input
            class="settings-input"
            maxlength="40"
            bind:value={service.icon}
          /></label
        >
      </div>
      <label class="settings-field"
        >Descrição<textarea
          class="settings-textarea"
          maxlength="400"
          rows="3"
          bind:value={service.description}></textarea></label
      >
      <button
        class="settings-button remove"
        type="button"
        disabled={usedIds.includes(service.id)}
        title={usedIds.includes(service.id)
          ? "Serviço usado por um modelo"
          : "Excluir serviço"}
        onclick={() =>
          (services = services.filter(
            (candidate: Service) => candidate.id !== service.id,
          ))}><Trash2 size={16} />Excluir</button
      >
    </article>
  {:else}
    <div class="empty">
      Nenhum serviço cadastrado. Adicione um serviço para criar modelos.
    </div>
  {/each}
</div>

<style>
  .service-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
    gap: 12px;
  }
  article {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid
      color-mix(in srgb, var(--service-color) 32%, var(--border));
    border-radius: var(--radius-lg);
    background: var(--canvas);
  }
  .service-color {
    height: 7px;
    border-radius: var(--radius-pill);
    background: var(--service-color);
    overflow: hidden;
  }
  .service-color input {
    width: 100%;
    height: 20px;
    opacity: 0;
    cursor: pointer;
  }
  .remove {
    justify-self: end;
    color: var(--danger);
  }
  .empty {
    grid-column: 1 / -1;
    padding: 36px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
    color: var(--ink-400);
    text-align: center;
    font-size: var(--text-sm);
  }
</style>
