<script lang="ts">
  import { ListTodo } from "@lucide/svelte";
  import DeliveryTemplateForm from "./DeliveryTemplateForm.svelte";
  import TemplateCardGrid, {
    type TemplateCardItem,
  } from "./TemplateCardGrid.svelte";
  import TemplateDeleteConfirmation from "./TemplateDeleteConfirmation.svelte";
  import type {
    DeliveryTemplate,
    ServiceTemplate,
    StyledChoice,
    TemplateTask,
  } from "./types";

  let {
    templates = $bindable(),
    services = $bindable(),
    categories,
    defaultDuration = "1",
    onchange,
  } = $props<{
    templates: DeliveryTemplate[];
    services: ServiceTemplate[];
    categories: StyledChoice[];
    defaultDuration?: string;
    onchange?: () => void | Promise<void>;
  }>();

  let formOpen = $state(false);
  let saving = $state(false);
  let saveError = $state("");
  let editingId = $state<string | undefined>();
  let deletingId = $state<string | undefined>();
  let editingTemplate = $derived(
    templates.find((template: DeliveryTemplate) => template.id === editingId),
  );
  let deletingTemplate = $derived(
    templates.find((template: DeliveryTemplate) => template.id === deletingId),
  );
  let cards = $derived(templates.map(toCard));
  let relatedCount = $derived(
    deletingTemplate
      ? services.reduce(
          (total: number, service: ServiceTemplate) =>
            total +
            service.tasks.filter(
              (task: TemplateTask) => task.templateId === deletingTemplate?.id,
            ).length,
          0,
        )
      : 0,
  );

  function toCard(template: DeliveryTemplate): TemplateCardItem {
    const category = categories.find(
      (item: StyledChoice) => item.key === template.category,
    );
    return {
      id: template.id,
      title: template.name || "Entrega sem nome",
      status: "Entrega",
      statusColor: category?.color ?? "#64748b",
      primary: category?.label ?? "Sem categoria",
      secondary:
        template.subtasks.length === 1
          ? "1 subtarefa"
          : `${template.subtasks.length} subtarefas`,
      description: template.briefing || "Briefing a definir",
      metric: template.subtasks.length,
      metricLabel: template.subtasks.length === 1 ? "subtarefa" : "subtarefas",
      auxiliary: template.duration
        ? `${template.duration} h`
        : "Sem estimativa",
      auxiliaryLabel: "duração",
    };
  }

  function openCreate(): void {
    editingId = undefined;
    formOpen = true;
  }

  function openEdit(id: string): void {
    editingId = id;
    formOpen = true;
  }

  function closeForm(): void {
    formOpen = false;
    editingId = undefined;
  }

  async function persist(): Promise<boolean> {
    saving = true;
    saveError = "";
    try {
      await onchange?.();
      return true;
    } catch (error) {
      saveError =
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a entrega. Tente novamente.";
      return false;
    } finally {
      saving = false;
    }
  }

  async function save(values: Record<string, string>): Promise<void> {
    const base: DeliveryTemplate = editingTemplate ?? {
      id: crypto.randomUUID(),
      projectTemplateId: "",
      name: "",
      category: "",
      briefing: "",
      subtasks: [],
      status: "planejamento",
      priority: "normal",
      tags: "",
      responsible: "",
      duration: "",
    };
    const next: DeliveryTemplate = {
      ...base,
      name: values.name.trim(),
      category: values.category,
      briefing: values.briefing.trim(),
      duration: values.duration,
      subtasks: JSON.parse(values.subtasks),
    };

    templates = editingTemplate
      ? templates.map((template: DeliveryTemplate) =>
          template.id === editingTemplate?.id ? next : template,
        )
      : [next, ...templates];
    if (await persist()) closeForm();
  }

  async function duplicate(id: string): Promise<void> {
    if (templates.length >= 100) return;
    const source = templates.find(
      (template: DeliveryTemplate) => template.id === id,
    );
    if (!source) return;
    templates = [
      {
        ...structuredClone(source),
        id: crypto.randomUUID(),
        name: `${source.name} (cópia)`,
      },
      ...templates,
    ];
    await persist();
  }

  function requestDelete(id = editingId): void {
    if (!id) return;
    deletingId = id;
    closeForm();
  }

  async function confirmDelete(): Promise<void> {
    if (!deletingTemplate) return;
    const templateId = deletingTemplate.id;
    services = services.map((service: ServiceTemplate) => ({
      ...service,
      tasks: service.tasks.filter(
        (task: TemplateTask) => task.templateId !== templateId,
      ),
    }));
    templates = templates.filter(
      (template: DeliveryTemplate) => template.id !== deletingTemplate?.id,
    );
    if (await persist()) deletingId = undefined;
  }
</script>

<section class="template-gallery" aria-labelledby="delivery-templates-title">
  <header class="gallery-header">
    <span class="gallery-icon" aria-hidden="true">
      <ListTodo size={20} strokeWidth={1.9} />
    </span>
    <div>
      <p>Modelos de tarefa</p>
      <h2 id="delivery-templates-title">Entregas</h2>
      <span>Padronize nome, categoria, briefing e subtarefas recorrentes.</span>
    </div>
    <strong>{templates.length} de 100 modelos</strong>
  </header>

  {#if saveError}
    <p class="template-save-error" role="alert">{saveError}</p>
  {/if}

  <TemplateCardGrid
    kind="delivery"
    items={cards}
    onadd={openCreate}
    onedit={openEdit}
    onduplicate={duplicate}
    ondelete={requestDelete}
  />
</section>

{#if formOpen}
  <DeliveryTemplateForm
    record={editingTemplate}
    {categories}
    {defaultDuration}
    {saving}
    oncancel={closeForm}
    onsave={save}
    ondelete={() => requestDelete()}
  />
{/if}

{#if deletingTemplate}
  <TemplateDeleteConfirmation
    kind="delivery"
    name={deletingTemplate.name}
    {relatedCount}
    oncancel={() => (deletingId = undefined)}
    onconfirm={confirmDelete}
  />
{/if}

<style>
  .template-gallery {
    display: grid;
    gap: 16px;
  }
  .gallery-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }
  .gallery-icon {
    display: grid;
    width: 42px;
    height: 42px;
    border: 1px solid color-mix(in srgb, var(--brand-500) 24%, var(--border));
    border-radius: 13px;
    color: var(--brand-600);
    background: var(--brand-50);
    place-items: center;
  }
  .gallery-header div {
    min-width: 0;
  }
  .gallery-header p {
    color: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .gallery-header h2 {
    margin-top: 2px;
    color: var(--ink-950);
    font-size: var(--text-xl);
  }
  .gallery-header div > span {
    display: block;
    max-width: 720px;
    margin-top: 4px;
    color: var(--ink-500);
    font-size: var(--text-sm);
    line-height: 1.45;
  }
  .gallery-header > strong {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    color: var(--ink-500);
    background: var(--surface);
    font-size: var(--text-xs);
    font-weight: 500;
    white-space: nowrap;
  }
  .template-save-error {
    margin: 0;
    color: var(--red-600, #b91c1c);
    font-size: var(--text-sm);
  }
  @media (max-width: 640px) {
    .gallery-header {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
    }
    .gallery-header > strong {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>
