<script lang="ts">
  import ConfigScaffold from "$lib/settings/ConfigScaffold.svelte";
  import ConfigSaveController from "$lib/settings/ConfigSaveController.svelte";
  import type { ConfigFilter } from "$lib/settings/ConfigFilterBar.svelte";
  import DeliveryTemplatesEditor from "$lib/settings/DeliveryTemplatesEditor.svelte";
  import LabelListEditor from "$lib/settings/LabelListEditor.svelte";
  import ServiceTemplatesEditor from "$lib/settings/ServiceTemplatesEditor.svelte";
  import SettingsCard from "$lib/settings/SettingsCard.svelte";
  import TagEditor from "$lib/settings/TagEditor.svelte";
  import {
    loadSettingsFromServer,
    saveWorkspaceSettings,
    workspaceSettingsAccess,
  } from "$lib/settings/client";
  import { freshSettings } from "$lib/settings/defaults";
  import type { SettingsState } from "$lib/settings/types";
  import type { TabItem } from "$lib/ui/Tabs.svelte";
  import { onMount } from "svelte";

  const tabs: TabItem[] = [
    { id: "servicos", label: "Serviços" },
    { id: "entregas", label: "Entregas" },
    { id: "status", label: "Status" },
    { id: "rotulos", label: "Rótulos" },
  ];
  const filtersByTab: Record<string, ConfigFilter[]> = {
    servicos: [],
    entregas: [],
    status: [
      { value: "contatos", label: "Contatos" },
      { value: "negocios", label: "Negócios" },
      { value: "projetos", label: "Projetos" },
      { value: "tarefas", label: "Tarefas" },
    ],
    rotulos: [
      { value: "negocios", label: "Negócios" },
      { value: "tarefas", label: "Tarefas" },
      { value: "financas", label: "Finanças" },
      { value: "tags", label: "Tags" },
    ],
  };

  let settings = $state<SettingsState>(freshSettings());
  let activeTab = $state("servicos");
  let activeFilter = $state("");
  let savedSettings = $state("");
  let settingsMessage = $state("");
  let canManage = $state(false);
  let filters = $derived(filtersByTab[activeTab] ?? []);
  let hasUnsavedChanges = $derived(
    savedSettings !== "" && JSON.stringify(settings) !== savedSettings,
  );
  $effect(() => {
    if (!filters.some(({ value }) => value === activeFilter))
      activeFilter = filters[0]?.value ?? "";
  });
  onMount(() => {
    void loadSettingsFromServer()
      .then((loaded) => {
        settings = loaded;
        canManage = workspaceSettingsAccess().canManage;
        savedSettings = JSON.stringify(loaded);
      })
      .catch((error) => {
        settingsMessage =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as configurações do workspace.";
      });
  });

  async function save(): Promise<void> {
    try {
      settings = await saveWorkspaceSettings(settings);
      savedSettings = JSON.stringify(settings);
      settingsMessage = "Configurações compartilhadas salvas";
    } catch (error) {
      settingsMessage =
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as configurações compartilhadas.";
      throw error;
    }
  }
</script>

<svelte:head><title>Meu negócio · Demanda</title></svelte:head>

<ConfigSaveController dirty={canManage && hasUnsavedChanges} onsave={save} />

{#if settingsMessage}
  <p class="sr-only" aria-live="polite">{settingsMessage}</p>
{/if}

<ConfigScaffold {tabs} bind:activeTab {filters} bind:activeFilter>
  {#if activeTab === "servicos"}
    <ServiceTemplatesEditor
      bind:templates={settings.serviceTemplates}
      bind:deliveries={settings.deliveryTemplates}
    />
  {:else if activeTab === "entregas"}
    <DeliveryTemplatesEditor
      bind:templates={settings.deliveryTemplates}
      bind:services={settings.serviceTemplates}
      categories={settings.taskCategories}
      defaultDuration={settings.defaultTaskDuration}
    />
  {:else if activeTab === "status" && activeFilter === "contatos"}
    <SettingsCard
      title="Status de contatos"
      description="Os cinco níveis têm posição fixa; personalize seus nomes e ícones."
      allowOverflow
      ><LabelListEditor
        bind:items={settings.personStatuses}
        showHeader={false}
        fixed
        levelMode
        showColor={false}
      /></SettingsCard
    >
  {:else if activeTab === "status" && activeFilter === "negocios"}
    <SettingsCard
      title="Status de negócios"
      description="Nomes e ícones das etapas comerciais."
      allowOverflow
      ><LabelListEditor
        bind:items={settings.businessStatuses}
        showHeader={false}
        fixed
        levelMode
        showColor={false}
      /></SettingsCard
    >
  {:else if activeTab === "status" && activeFilter === "projetos"}
    <SettingsCard
      title="Fases de projetos"
      description="Os cinco níveis têm posição fixa; personalize seus nomes e ícones."
      allowOverflow
      ><LabelListEditor
        bind:items={settings.projectStatuses}
        showHeader={false}
        fixed
        levelMode
        showColor={false}
      /></SettingsCard
    >
  {:else if activeTab === "status" && activeFilter === "tarefas"}
    <SettingsCard
      title="Status de tarefas"
      description="Os cinco níveis usados no fluxo das tarefas."
      allowOverflow
      ><LabelListEditor
        bind:items={settings.taskStatuses}
        showHeader={false}
        fixed
        levelMode
        showColor={false}
      /></SettingsCard
    >
  {:else if activeTab === "rotulos" && activeFilter === "negocios"}
    <SettingsCard
      title="Categorias de negócios"
      description="Classificações personalizadas com ícone e cor."
      allowOverflow
      ><LabelListEditor
        bind:items={settings.businessCategories}
        showHeader={false}
        max={10}
        lockedKey="outro"
        useIconColorPicker
      /></SettingsCard
    >
  {:else if activeTab === "rotulos" && activeFilter === "tarefas"}
    <SettingsCard
      title="Categorias de tarefas"
      description="Categorias personalizadas com ícone e cor."
      allowOverflow
      ><LabelListEditor
        bind:items={settings.taskCategories}
        showHeader={false}
        max={30}
        lockedKey="outro"
        useIconColorPicker
      /></SettingsCard
    >
  {:else if activeTab === "rotulos" && activeFilter === "financas"}
    <SettingsCard
      title="Categorias de receitas"
      description="Personalize nome, ícone e cor das receitas."
      allowOverflow
      ><LabelListEditor
        bind:items={settings.revenueCategories}
        showHeader={false}
        max={30}
        lockedKey="outros"
        useIconColorPicker
      /></SettingsCard
    >
    <SettingsCard
      title="Categorias de despesas"
      description="Personalize nome, ícone e cor das despesas."
      allowOverflow
      ><LabelListEditor
        bind:items={settings.expenseCategories}
        showHeader={false}
        max={30}
        lockedKey="outros"
        useIconColorPicker
      /></SettingsCard
    >
  {:else if activeTab === "rotulos" && activeFilter === "tags"}
    <SettingsCard
      title="Tags"
      description="Vocabulário reutilizável em serviços, entregas e tarefas."
      ><TagEditor bind:tags={settings.tags} /></SettingsCard
    >
  {/if}
</ConfigScaffold>
