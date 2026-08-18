<script lang="ts">
  import { resolveColor } from "$lib/ui/icon-color";
  import { FolderKanban } from "@lucide/svelte";
  import ServiceTemplateForm from "./ServiceTemplateForm.svelte";
  import TemplateCardGrid, {
    type TemplateCardItem,
  } from "./TemplateCardGrid.svelte";
  import TemplateDeleteConfirmation from "./TemplateDeleteConfirmation.svelte";
  import type {
    DeliveryTemplate,
    ServiceTemplate,
    TemplateTask,
  } from "./types";

  let { templates = $bindable(), deliveries = $bindable() } = $props<{
    templates: ServiceTemplate[];
    deliveries: DeliveryTemplate[];
  }>();

  let formOpen = $state(false);
  let editingId = $state<string | undefined>();
  let deletingId = $state<string | undefined>();
  let editingTemplate = $derived(
    templates.find((template: ServiceTemplate) => template.id === editingId),
  );
  let deletingTemplate = $derived(
    templates.find((template: ServiceTemplate) => template.id === deletingId),
  );
  let cards = $derived(templates.map(toCard));

  function deliveryCount(template: ServiceTemplate): number {
    if (template.tasks.length) return template.tasks.length;
    return deliveries.filter(
      (delivery: DeliveryTemplate) =>
        delivery.projectTemplateId === template.id ||
        (!!template.serviceId && delivery.serviceId === template.serviceId),
    ).length;
  }

  function formatCurrency(value: string): string {
    if (!value.trim()) return "A definir";
    const amount = Number(value);
    if (!Number.isFinite(amount)) return value;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function contractSummary(template: ServiceTemplate): string {
    const details = [
      template.contractType,
      template.amount.trim() ? formatCurrency(template.amount) : "",
    ].filter(Boolean);
    return details.join(" · ") || "Condições a definir";
  }

  function toCard(template: ServiceTemplate): TemplateCardItem {
    const count = deliveryCount(template);
    return {
      id: template.id,
      title: template.name || "Serviço sem nome",
      status: "Serviço",
      statusColor: template.color.startsWith("#")
        ? template.color
        : resolveColor(template.color),
      primary: contractSummary(template),
      secondary: template.tags || "Sem tags",
      description: template.briefing || "Briefing a definir",
      metric: `${count}`,
      metricLabel: count === 1 ? "entrega" : "entregas",
      auxiliary: template.duration ? `${template.duration} dias` : "Flexível",
      auxiliaryLabel: "prazo",
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

  function save(values: Record<string, string>): void {
    const base: ServiceTemplate = editingTemplate ?? {
      id: crypto.randomUUID(),
      name: "",
      icon: "briefcase-business",
      color: "blue",
      briefing: "",
      tags: "",
      status: "planejamento",
      responsible: "",
      duration: "",
      contractType: "",
      amount: "",
      installments: "1",
      paymentMethod: "",
      paymentTerms: "",
      financeNotes: "",
      tasks: [],
    };
    let tasks: ServiceTemplate["tasks"] = [];
    try {
      const parsed = JSON.parse(values.tasks);
      if (Array.isArray(parsed)) tasks = parsed;
    } catch {
      tasks = [];
    }
    const next: ServiceTemplate = {
      ...base,
      name: values.name.trim(),
      icon: values.icon,
      color: values.color,
      briefing: values.briefing.trim(),
      tags: values.tags.trim(),
      duration: values.duration,
      contractType: values.contractType.trim(),
      amount: values.amount,
      tasks,
    };

    templates = editingTemplate
      ? templates.map((template: ServiceTemplate) =>
          template.id === editingTemplate?.id ? next : template,
        )
      : [next, ...templates];
    closeForm();
  }

  function duplicate(id: string): void {
    if (templates.length >= 100) return;
    const source = templates.find(
      (template: ServiceTemplate) => template.id === id,
    );
    if (!source) return;
    templates = [
      {
        ...structuredClone(source),
        id: crypto.randomUUID(),
        name: `${source.name} (cópia)`,
        serviceId: undefined,
        tasks: source.tasks.map((task: TemplateTask) => ({
          ...task,
          id: crypto.randomUUID(),
        })),
      },
      ...templates,
    ];
  }

  function requestDelete(id = editingId): void {
    if (!id) return;
    deletingId = id;
    closeForm();
  }

  function confirmDelete(): void {
    if (!deletingTemplate) return;
    const id = deletingTemplate.id;
    const legacyServiceId = deletingTemplate.serviceId;
    deliveries = deliveries.map((delivery: DeliveryTemplate) =>
      delivery.projectTemplateId === id ||
      (!delivery.projectTemplateId &&
        !!legacyServiceId &&
        delivery.serviceId === legacyServiceId)
        ? {
            ...delivery,
            projectTemplateId: "",
            serviceId: undefined,
          }
        : delivery,
    );
    templates = templates.filter(
      (template: ServiceTemplate) => template.id !== deletingTemplate?.id,
    );
    deletingId = undefined;
  }
</script>

<section class="template-gallery" aria-labelledby="service-templates-title">
  <header class="gallery-header">
    <span class="gallery-icon" aria-hidden="true">
      <FolderKanban size={20} strokeWidth={1.9} />
    </span>
    <div>
      <p>Modelos de projeto</p>
      <h2 id="service-templates-title">Serviços</h2>
      <span
        >Estruture briefing, prazo, entregas e contrato de cada serviço.</span
      >
    </div>
    <strong>{templates.length} de 100 modelos</strong>
  </header>

  <TemplateCardGrid
    kind="service"
    items={cards}
    onadd={openCreate}
    onedit={openEdit}
    onduplicate={duplicate}
    ondelete={requestDelete}
  />
</section>

{#if formOpen}
  <ServiceTemplateForm
    record={editingTemplate}
    {deliveries}
    oncancel={closeForm}
    onsave={save}
    ondelete={() => requestDelete()}
  />
{/if}

{#if deletingTemplate}
  <TemplateDeleteConfirmation
    kind="service"
    name={deletingTemplate.name}
    relatedCount={deliveryCount(deletingTemplate)}
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
