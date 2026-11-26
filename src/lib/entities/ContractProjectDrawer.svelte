<script lang="ts">
  import type { ProjectResponsible } from "$lib/projects/types";
  import {
    formatRecurrenceLabel,
    formatServiceHours,
    type ServiceProjectNature,
  } from "$lib/service-packages/types";
  import {
    CalendarDays,
    CheckSquare2,
    Clock3,
    Copy,
    FileText,
    FolderKanban,
    ListChecks,
    Pencil,
    Plus,
    Repeat,
    Shield,
    Trash2,
    UserCheck,
    X,
  } from "@lucide/svelte";
  import type {
    ContractScopeDeliveryDraft,
    ContractScopeProjectDraft,
  } from "./contract-scope-draft";

  let {
    project = $bindable(),
    workspaceMembers,
    onclose,
    oneditdelivery,
    onadddelivery,
    onduplicatedelivery,
    onremovedelivery,
    onremoveproject,
  }: {
    project: ContractScopeProjectDraft;
    workspaceMembers: ProjectResponsible[];
    onclose: () => void;
    oneditdelivery: (delivery: ContractScopeDeliveryDraft) => void;
    onadddelivery: () => void;
    onduplicatedelivery: (delivery: ContractScopeDeliveryDraft) => void;
    onremovedelivery: (deliveryLocalId: string) => void;
    onremoveproject?: () => void;
  } = $props();

  function deliveryMinutes(delivery: ContractScopeDeliveryDraft): number {
    return delivery.tasks.reduce((sum, task) => sum + task.durationMinutes, 0);
  }

  function setNature(nextType: ServiceProjectNature): void {
    project.projectType = nextType;
    if (nextType === "one_off") {
      project.deliveries = project.deliveries.map((delivery) => ({
        ...delivery,
        recurrenceType: "one_off",
        recurrenceUnit: null,
        recurrenceDays: [],
      }));
    }
  }
</script>

<aside class="project-drawer" aria-label={`Personalizar ${project.name}`}>
  <header class="drawer-head">
    <div class="drawer-title-group">
      <span class="drawer-icon" aria-hidden="true">
        {#if project.isInstitutional}
          <Shield size={16} strokeWidth={2} />
        {:else}
          <FolderKanban size={16} strokeWidth={2} />
        {/if}
      </span>
      <div class="drawer-copy">
        <span class="drawer-eyebrow">
          {project.isInstitutional ? "Projeto automático" : "Projeto do contrato"}
        </span>
        <h3>{project.name.trim() || "Projeto sem nome"}</h3>
      </div>
    </div>

    <div class="drawer-head-actions">
      {#if !project.isInstitutional && onremoveproject}
        <button
          type="button"
          class="drawer-icon-btn danger"
          title="Remover projeto deste contrato"
          aria-label="Remover projeto deste contrato"
          onclick={onremoveproject}
        >
          <Trash2 size={15} />
        </button>
      {/if}
      <button
        type="button"
        class="drawer-icon-btn"
        title="Fechar painel do projeto"
        aria-label="Fechar painel do projeto"
        onclick={onclose}
      >
        <X size={16} />
      </button>
    </div>
  </header>

  <div class="drawer-body">
    <section class="drawer-section">
      <h4>Sobre o projeto</h4>
      <div class="drawer-fields">
        {#if !project.isInstitutional}
          <div class="control">
            <span class="control-icon" aria-hidden="true">
              <FolderKanban size={16} strokeWidth={1.8} />
            </span>
            <input
              bind:value={project.name}
              maxlength="140"
              placeholder="Título do projeto *"
              aria-label="Título do projeto"
            />
          </div>
        {:else}
          <p class="inst-hint">
            Entregas diretas vinculadas ao projeto Institucional deste contrato.
          </p>
        {/if}

        <div class="two-col">
          <div class="control">
            <span class="control-icon" aria-hidden="true">
              <Repeat size={15} strokeWidth={1.8} />
            </span>
            <select
              aria-label="Frequência do projeto"
              value={project.projectType}
              onchange={(event) =>
                setNature(event.currentTarget.value as ServiceProjectNature)}
            >
              <option value="one_off">Pontual</option>
              <option value="recurring">Recorrente</option>
            </select>
          </div>

          {#if !project.isInstitutional}
            <div class="control duration-control">
              <span class="control-icon" aria-hidden="true">
                <CalendarDays size={15} strokeWidth={1.8} />
              </span>
              <input
                bind:value={project.durationDays}
                type="number"
                min="1"
                max="3650"
                step="1"
                placeholder="Prazo"
                aria-label="Prazo em dias"
              />
              <span class="suffix">dias</span>
            </div>
          {/if}
        </div>

        {#if workspaceMembers.length > 1}
          <div class="control">
            <span class="control-icon" aria-hidden="true">
              <UserCheck size={15} strokeWidth={1.8} />
            </span>
            <select
              bind:value={project.responsibleUserId}
              aria-label="Responsável do projeto"
            >
              <option value="">Responsável padrão do contrato</option>
              {#each workspaceMembers as member (member.userId)}
                <option value={member.userId}>{member.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        {#if !project.isInstitutional}
          <div class="control textarea-control">
            <span class="control-icon" aria-hidden="true">
              <FileText size={15} strokeWidth={1.8} />
            </span>
            <textarea
              bind:value={project.briefing}
              rows="3"
              maxlength="2000"
              placeholder="Briefing do projeto"
              aria-label="Briefing do projeto"
            ></textarea>
          </div>
        {/if}
      </div>
    </section>

    <section class="drawer-section">
      <div class="deliveries-head">
        <h4>
          <ListChecks size={15} strokeWidth={2} />
          <span>Entregas</span>
          <span class="count">{project.deliveries.length}</span>
        </h4>
        <button
          type="button"
          class="add-delivery-btn"
          disabled={project.deliveries.length >= 100}
          onclick={onadddelivery}
        >
          <Plus size={14} strokeWidth={2.2} />
          <span>Nova entrega</span>
        </button>
      </div>

      {#if project.deliveries.length === 0}
        <div class="empty-deliveries">
          <p>Nenhuma entrega neste projeto.</p>
          <button
            type="button"
            class="add-delivery-btn"
            onclick={onadddelivery}
          >
            <Plus size={14} />
            <span>Adicionar primeira entrega</span>
          </button>
        </div>
      {:else}
        <div class="delivery-items">
          {#each project.deliveries as delivery (delivery.localId)}
            <div class="delivery-item">
              <button
                type="button"
                class="delivery-open"
                onclick={() => oneditdelivery(delivery)}
              >
                <strong title={delivery.name}>
                  {delivery.name || "Entrega sem nome"}
                </strong>
                <span class="delivery-meta">
                  {#if project.projectType === "recurring"}
                    <em class="rec-tag">
                      <Repeat size={10.5} />
                      {formatRecurrenceLabel(
                        delivery.recurrenceType,
                        delivery.recurrenceUnit,
                        delivery.recurrenceDays,
                      )}
                    </em>
                  {/if}
                  <span>
                    <CheckSquare2 size={11.5} />
                    {delivery.tasks.length}
                    {delivery.tasks.length === 1 ? "tar." : "tars."}
                  </span>
                  <span>
                    <Clock3 size={11.5} />
                    {formatServiceHours(deliveryMinutes(delivery))}
                  </span>
                </span>
              </button>

              <div class="delivery-actions">
                <button
                  type="button"
                  title="Editar entrega"
                  aria-label={`Editar entrega ${delivery.name}`}
                  onclick={() => oneditdelivery(delivery)}
                >
                  <Pencil size={13.5} />
                </button>
                <button
                  type="button"
                  title="Duplicar entrega"
                  aria-label={`Duplicar entrega ${delivery.name}`}
                  onclick={() => onduplicatedelivery(delivery)}
                >
                  <Copy size={13.5} />
                </button>
                <button
                  type="button"
                  class="danger"
                  title="Remover entrega"
                  aria-label={`Remover entrega ${delivery.name}`}
                  onclick={() => onremovedelivery(delivery.localId)}
                >
                  <Trash2 size={13.5} />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</aside>

<style>
  .project-drawer {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    height: 100%;
    border-left: 1px solid var(--border);
    background: var(--canvas);
  }

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }

  .drawer-title-group {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
  }

  .drawer-icon {
    display: grid;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    border: 1px solid var(--brand-100);
    border-radius: 10px;
    color: var(--brand-600);
    background: var(--brand-50);
    place-items: center;
  }

  .drawer-copy {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .drawer-eyebrow {
    color: var(--ink-500);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .drawer-copy h3 {
    margin: 0;
    overflow: hidden;
    color: var(--ink-950);
    font-size: 15px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drawer-head-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .drawer-icon-btn {
    display: grid;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-500);
    background: var(--canvas);
    place-items: center;
    cursor: pointer;
  }

  .drawer-icon-btn:hover {
    border-color: var(--brand-500);
    color: var(--ink-950);
  }

  .drawer-icon-btn.danger:hover {
    border-color: rgba(220, 38, 38, 0.35);
    color: var(--danger);
    background: rgba(220, 38, 38, 0.07);
  }

  .drawer-body {
    display: grid;
    align-content: start;
    gap: 14px;
    overflow-y: auto;
    padding: 16px 18px 20px;
  }

  .drawer-section {
    display: grid;
    gap: 11px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--panel);
  }

  .drawer-section h4 {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--ink-950);
    font-size: 14.5px;
    font-weight: 600;
  }

  .drawer-fields {
    display: grid;
    gap: 9px;
  }

  .two-col {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }

  .control {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    min-width: 0;
    min-height: 48px;
    align-items: center;
    gap: 9px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: var(--panel);
  }

  .control:focus-within {
    border-color: var(--primary);
  }

  .duration-control {
    grid-template-columns: 18px minmax(0, 1fr) auto;
  }

  .textarea-control {
    min-height: 92px;
    align-items: start;
    padding-block: 10px;
  }

  .textarea-control .control-icon {
    margin-top: 3px;
  }

  .control-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }

  .suffix {
    color: var(--muted);
    font-size: 12px;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    color: var(--text);
    background: transparent;
    font: inherit;
    font-size: 13.5px;
    line-height: 1.4;
  }

  textarea {
    min-height: 68px;
    resize: vertical;
  }

  .inst-hint {
    margin: 0;
    color: var(--ink-500);
    font-size: 12.5px;
    line-height: 1.45;
  }

  .deliveries-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .count {
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    color: var(--brand-600);
    background: var(--brand-50);
    font-size: 11.5px;
    font-weight: 700;
  }

  .add-delivery-btn {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--border));
    border-radius: 9px;
    color: var(--brand-600);
    background: var(--brand-50);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .add-delivery-btn:hover:not(:disabled) {
    background: var(--brand-100);
  }

  .empty-deliveries {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 20px 14px;
    border: 1px dashed var(--border-strong);
    border-radius: 13px;
    background: var(--canvas);
    color: var(--ink-500);
    text-align: center;
  }

  .empty-deliveries p {
    margin: 0;
    font-size: 12.5px;
  }

  .delivery-items {
    display: grid;
    gap: 7px;
  }

  .delivery-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--canvas);
    transition: border-color var(--motion-fast) ease;
  }

  .delivery-item:hover {
    border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
  }

  .delivery-open {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 4px;
    padding: 0;
    border: 0;
    outline: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .delivery-open strong {
    overflow: hidden;
    color: var(--ink-950);
    font-size: 13.5px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .delivery-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    color: var(--ink-500);
    font-size: 11.5px;
  }

  .delivery-meta > span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .rec-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border-radius: var(--radius-pill);
    color: #1f6b47;
    background: rgba(93, 172, 131, 0.16);
    font-size: 10.5px;
    font-style: normal;
    font-weight: 600;
  }

  .delivery-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 3px;
  }

  .delivery-actions button {
    display: grid;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 7px;
    color: var(--ink-500);
    background: transparent;
    place-items: center;
    cursor: pointer;
  }

  .delivery-actions button:hover {
    border-color: var(--border);
    color: var(--ink-950);
    background: var(--panel);
  }

  .delivery-actions button.danger:hover {
    border-color: rgba(220, 38, 38, 0.25);
    color: var(--danger);
    background: rgba(220, 38, 38, 0.08);
  }

  @media (max-width: 980px) {
    .project-drawer {
      border-left: 0;
      border-top: 1px solid var(--border);
    }
  }
</style>
