<script lang="ts">
  import { onMount } from "svelte";
  import {
    currentSettings,
    loadSettingsFromServer,
    saveWorkspaceSettings,
    workspaceSettingsAccess,
  } from "$lib/settings/client";
  import type {
    SettingsState,
    ServiceTemplate,
    DeliveryTemplate,
  } from "$lib/settings/types";
  import ServiceTemplateForm from "$lib/settings/ServiceTemplateForm.svelte";
  import DeliveryTemplateForm from "$lib/settings/DeliveryTemplateForm.svelte";
  import TemplateCardGrid, {
    type TemplateCardItem,
  } from "$lib/settings/TemplateCardGrid.svelte";
  import { observeWorkspaces } from "$lib/workspaces/workspace-storage";

  let {
    kind,
    query,
    filter,
  }: { kind: "projects" | "deliveries"; query: string; filter: string } =
    $props();
  let settings = $state(currentSettings());
  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");
  let canManage = $state(false);
  let workspaceId = "";
  let version = 0;
  let request = 0;
  let formOpen = $state(false);
  let editingId = $state<string>();
  let editingProject = $derived(
    settings.serviceTemplates.find(({ id }) => id === editingId),
  );
  let editingDelivery = $derived(
    settings.deliveryTemplates.find(({ id }) => id === editingId),
  );
  let cards = $derived.by((): TemplateCardItem[] => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (kind === "projects")
      return settings.serviceTemplates
        .filter((template) => {
          const recurring = /recorr|rotina/iu.test(template.contractType);
          return (
            `${template.name} ${template.briefing}`
              .toLocaleLowerCase("pt-BR")
              .includes(needle) &&
            (filter === "todos" ||
              (filter === "recurring" ? recurring : !recurring))
          );
        })
        .map((template) => ({
          id: template.id,
          title: template.name,
          status: "Projeto",
          statusColor: "var(--primary)",
          primary: /recorr|rotina/iu.test(template.contractType)
            ? "Recorrente"
            : "Pontual",
          secondary: template.tags || "Sem tags",
          description: template.briefing,
          metric: template.deliveries.length,
          metricLabel: "entregas",
          auxiliary: template.duration || "Livre",
          auxiliaryLabel: "dias",
        }));
    return settings.deliveryTemplates
      .filter(
        (template) =>
          `${template.name} ${template.briefing}`
            .toLocaleLowerCase("pt-BR")
            .includes(needle) &&
          (filter === "todos" ||
            (filter === "tasks"
              ? template.tasks.length > 0
              : template.tasks.length === 0)),
      )
      .map((template) => ({
        id: template.id,
        title: template.name,
        status: "Entrega",
        statusColor: "var(--primary)",
        primary:
          settings.deliveryCategories.find(
            ({ key }) => key === template.category,
          )?.label ?? "Sem categoria",
        secondary: "Modelo de entrega",
        description: template.briefing,
        metric: template.tasks.length,
        metricLabel: "tarefas",
        auxiliary: `${template.tasks.reduce((sum, task) => sum + Number(task.duracao.replace(",", ".")), 0)} h`,
        auxiliaryLabel: "estimativa",
      }));
  });

  export function canCreate(): boolean {
    return canManage && !loading && !saving;
  }
  export function create(): void {
    if (!canManage || saving || loading) return;
    editingId = undefined;
    formOpen = true;
  }
  async function load(): Promise<void> {
    const token = ++request;
    loading = true;
    error = "";
    formOpen = false;
    try {
      const loaded = await loadSettingsFromServer();
      if (token !== request) return;
      settings = loaded;
      const access = workspaceSettingsAccess();
      workspaceId = access.workspaceId;
      version = access.version;
      canManage = access.canManage;
    } catch (cause) {
      if (token === request)
        error =
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar os modelos.";
    } finally {
      if (token === request) loading = false;
    }
  }

  async function persist(next: SettingsState): Promise<boolean> {
    if (saving || !canManage) return false;
    const access = workspaceSettingsAccess();
    if (access.workspaceId !== workspaceId || access.version !== version) {
      error =
        "A biblioteca foi atualizada. Recarregue os modelos antes de salvar.";
      return false;
    }
    saving = true;
    error = "";
    try {
      const saved = await saveWorkspaceSettings(next);
      if (workspaceSettingsAccess().workspaceId === workspaceId) {
        settings = saved;
        version = workspaceSettingsAccess().version;
      }
      return true;
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o modelo.";
      return false;
    } finally {
      saving = false;
    }
  }

  async function saveProject(values: Record<string, string>): Promise<void> {
    const next = structuredClone($state.snapshot(settings));
    const base: ServiceTemplate = editingProject ?? {
      id: crypto.randomUUID(),
      name: "",
      icon: "folder-kanban",
      color: "blue",
      briefing: "",
      tags: "",
      status: "planejamento",
      responsible: "",
      responsibleUserIds: [],
      duration: "",
      contractType: "Pontual",
      amount: "",
      installments: "1",
      paymentMethod: "",
      paymentTerms: "",
      financeNotes: "",
      deliveries: [],
    };
    const template = {
      ...base,
      name: values.name,
      icon: values.icon,
      color: values.color,
      briefing: values.briefing,
      tags: values.tags,
      duration: values.duration,
      contractType: values.contractType,
      deliveries: JSON.parse(values.deliveries),
    };
    next.serviceTemplates = editingProject
      ? next.serviceTemplates.map((item) =>
          item.id === base.id ? template : item,
        )
      : [...next.serviceTemplates, template];
    if (await persist(next)) formOpen = false;
  }

  async function saveDelivery(values: Record<string, string>): Promise<void> {
    const next = structuredClone($state.snapshot(settings));
    const base: DeliveryTemplate = editingDelivery ?? {
      id: crypto.randomUUID(),
      projectTemplateId: "",
      name: "",
      category: "",
      briefing: "",
      tasks: [],
      status: "planejamento",
      priority: "normal",
      tags: "",
      responsible: "",
      responsibleUserIds: [],
      duration: "",
    };
    const template = {
      ...base,
      name: values.name,
      category: values.category,
      briefing: values.briefing,
      tasks: JSON.parse(values.tasks),
      duration: values.duration,
    };
    next.deliveryTemplates = editingDelivery
      ? next.deliveryTemplates.map((item) =>
          item.id === base.id ? template : item,
        )
      : [...next.deliveryTemplates, template];
    if (await persist(next)) formOpen = false;
  }

  async function duplicate(id: string): Promise<void> {
    const next = structuredClone($state.snapshot(settings));
    if (kind === "projects") {
      const source = next.serviceTemplates.find((item) => item.id === id);
      if (!source || next.serviceTemplates.length >= 100) return;
      next.serviceTemplates.push({
        ...source,
        id: crypto.randomUUID(),
        version: undefined,
        serviceId: undefined,
        name: `${source.name} (cópia)`.slice(0, 140),
        deliveries: source.deliveries.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
        })),
      });
    } else {
      const source = next.deliveryTemplates.find((item) => item.id === id);
      if (!source || next.deliveryTemplates.length >= 100) return;
      next.deliveryTemplates.push({
        ...source,
        id: crypto.randomUUID(),
        version: undefined,
        serviceId: undefined,
        name: `${source.name} (cópia)`.slice(0, 140),
        tasks: source.tasks.map((task) => ({
          ...task,
          id: crypto.randomUUID(),
        })),
      });
    }
    await persist(next);
  }

  async function remove(id: string): Promise<void> {
    if (
      !canManage ||
      saving ||
      !window.confirm(
        "Excluir este modelo da biblioteca? Cópias já utilizadas serão preservadas.",
      )
    )
      return;
    const next = structuredClone($state.snapshot(settings));
    if (kind === "projects") {
      next.serviceTemplates = next.serviceTemplates.filter(
        (item) => item.id !== id,
      );
      next.deliveryTemplates = next.deliveryTemplates.map((item) =>
        item.projectTemplateId === id
          ? { ...item, projectTemplateId: "", serviceId: undefined }
          : item,
      );
    } else {
      next.deliveryTemplates = next.deliveryTemplates.filter(
        (item) => item.id !== id,
      );
      next.serviceTemplates = next.serviceTemplates.map((item) => ({
        ...item,
        deliveries: item.deliveries.filter(
          (delivery) => delivery.templateId !== id,
        ),
      }));
    }
    if (await persist(next)) formOpen = false;
  }

  onMount(() => {
    void load();
    const stop = observeWorkspaces(() => void load());
    return () => {
      request++;
      stop();
    };
  });
</script>

<p class="library-hint">
  Modelos compartilhados do workspace selecionado.{#if !canManage && !loading}
    Edição disponível para administradores.{/if}
</p>
{#if error}<div class="library-error" role="alert">
    {error}
    <button type="button" disabled={saving} onclick={() => void load()}
      >Recarregar modelos</button
    >
  </div>{/if}
{#if loading}<p role="status">Carregando modelos…</p>{:else}
  <TemplateCardGrid
    kind={kind === "projects" ? "service" : "delivery"}
    items={cards}
    {canManage}
    showAdd={false}
    onadd={create}
    onedit={(id) => {
      if (canManage && !saving) {
        editingId = id;
        formOpen = true;
      }
    }}
    onduplicate={(id) => void duplicate(id)}
    ondelete={(id) => void remove(id)}
  />
  {#if !cards.length}<p>Nenhum modelo encontrado para este filtro.</p>{/if}
{/if}
{#if formOpen && kind === "projects"}
  <ServiceTemplateForm
    record={editingProject}
    deliveries={settings.deliveryTemplates}
    {saving}
    errorMessage={error}
    oncancel={() => {
      if (!saving) formOpen = false;
    }}
    onsave={saveProject}
    ondelete={editingId ? () => void remove(editingId!) : undefined}
  />
{:else if formOpen}
  <DeliveryTemplateForm
    record={editingDelivery}
    categories={settings.deliveryCategories}
    defaultDuration={settings.defaultDeliveryDuration}
    {saving}
    errorMessage={error}
    oncancel={() => {
      if (!saving) formOpen = false;
    }}
    onsave={saveDelivery}
    ondelete={editingId ? () => void remove(editingId!) : undefined}
  />
{/if}

<style>
  .library-hint {
    color: var(--muted);
    font-size: var(--text-sm);
    margin: 0;
  }
  .library-error {
    color: var(--danger);
  }
  button {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--panel);
    color: var(--text);
  }
</style>
