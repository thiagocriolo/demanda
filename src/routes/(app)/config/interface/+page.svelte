<script lang="ts">
  import ConfigScaffold from "$lib/settings/ConfigScaffold.svelte";
  import ConfigSaveController from "$lib/settings/ConfigSaveController.svelte";
  import type { ConfigFilter } from "$lib/settings/ConfigFilterBar.svelte";
  import LabelListEditor from "$lib/settings/LabelListEditor.svelte";
  import SettingsCard from "$lib/settings/SettingsCard.svelte";
  import TagEditor from "$lib/settings/TagEditor.svelte";
  import ToggleRow from "$lib/settings/ToggleRow.svelte";
  import {
    savePersonalSettings,
    saveWorkspaceSettings,
  } from "$lib/settings/client";
  import { mergeSettingsScopes } from "$lib/settings/defaults";
  import type { InterfaceTab } from "$lib/settings/routes";
  import type { SettingsState } from "$lib/settings/types";
  import type { TabItem } from "$lib/ui/Tabs.svelte";
  import { untrack } from "svelte";
  import type { LayoutData } from "../../$types";

  type Props = { data: LayoutData; initialTab?: InterfaceTab };
  let { data, initialTab = "aparencia" }: Props = $props();

  const tabs: TabItem[] = [
    { id: "aparencia", label: "Aparência" },
    { id: "status", label: "Status" },
    { id: "rotulos", label: "Rótulos" },
  ];
  const routedTabs = tabs.map((tab) => ({
    ...tab,
    href: `/config/interface/${tab.id}`,
  }));

  const filtersByTab: Record<string, ConfigFilter[]> = {
    aparencia: [],
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

  const initialSettings = untrack(() =>
    mergeSettingsScopes(
      data.settingsSnapshot.personal.settings,
      data.settingsSnapshot.workspace.settings,
    ),
  );
  const initialCanManage = untrack(
    () => data.settingsSnapshot.workspace.canManage,
  );
  let settings = $state<SettingsState>(initialSettings);
  let activeTab = $state<InterfaceTab>("aparencia");
  let activeFilter = $state("");
  let savedSettings = $state(JSON.stringify(initialSettings));
  let settingsMessage = $state("");
  let canManage = $state(initialCanManage);
  let filters = $derived(filtersByTab[activeTab] ?? []);
  let hasUnsavedChanges = $derived(
    savedSettings !== "" && JSON.stringify(settings) !== savedSettings,
  );
  let canSave = $derived(activeTab === "aparencia" || canManage);

  $effect(() => {
    activeTab = initialTab;
  });

  $effect(() => {
    if (!filters.some(({ value }) => value === activeFilter))
      activeFilter = filters[0]?.value ?? "";
  });

  async function save(): Promise<void> {
    try {
      settings = await (activeTab === "aparencia"
        ? savePersonalSettings(settings)
        : saveWorkspaceSettings(settings));
      savedSettings = JSON.stringify(settings);
      settingsMessage =
        activeTab === "aparencia"
          ? "Preferências de aparência salvas"
          : "Configurações do workspace salvas";
    } catch (error) {
      settingsMessage =
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as configurações do workspace.";
      throw error;
    }
  }
</script>

<svelte:head><title>Interface · Demanda</title></svelte:head>

<ConfigSaveController dirty={canSave && hasUnsavedChanges} onsave={save} />

{#if settingsMessage}
  <p class="sr-only" aria-live="polite">{settingsMessage}</p>
{/if}

<ConfigScaffold tabs={routedTabs} bind:activeTab {filters} bind:activeFilter>
  {#if activeTab === "aparencia"}
    <SettingsCard
      title="Aparência"
      description="Preferências visuais pessoais da interface."
    >
      <div class="settings-field-grid three">
        <label class="settings-field"
          >Tema<select class="settings-select" bind:value={settings.theme}
            ><option value="light">Claro</option><option value="dark"
              >Escuro</option
            ></select
          ></label
        >
        <label class="settings-field"
          >Densidade<select
            class="settings-select"
            bind:value={settings.interfaceDensity}
            ><option value="default">Padrão</option><option value="large"
              >Maior</option
            ></select
          ></label
        >
        <label class="settings-field"
          >Menu lateral<select
            class="settings-select"
            bind:value={settings.sidebarDefault}
            ><option value="expanded">Expandido</option><option
              value="collapsed">Recolhido</option
            ></select
          ></label
        >
      </div>
      <ToggleRow
        label="Exibir animações"
        description="Ativa transições de navegação, menu e carregamento."
        bind:checked={settings.interfaceAnimations}
      />
      <ToggleRow
        label="Compactar cabeçalhos e áreas vazias"
        description="Reduz espaços estruturais para deixar o conteúdo mais denso."
        bind:checked={settings.compactHeaders}
      />
    </SettingsCard>
  {:else if activeTab === "status" && activeFilter === "contatos"}
    <SettingsCard
      title="Status de contatos"
      description="Os cinco níveis têm posição fixa; personalize seus nomes e ícones."
      allowOverflow
    >
      <LabelListEditor
        bind:items={settings.personStatuses}
        showHeader={false}
        fixed
        levelMode
        showColor={false}
      />
    </SettingsCard>
  {:else if activeTab === "status" && activeFilter === "negocios"}
    <SettingsCard
      title="Status de negócios"
      description="Nomes e ícones das etapas comerciais."
      allowOverflow
    >
      <LabelListEditor
        bind:items={settings.businessStatuses}
        showHeader={false}
        fixed
        levelMode
        showColor={false}
      />
    </SettingsCard>
  {:else if activeTab === "status" && activeFilter === "projetos"}
    <SettingsCard
      title="Fases de projetos"
      description="Os cinco níveis têm posição fixa; personalize seus nomes e ícones."
      allowOverflow
    >
      <LabelListEditor
        bind:items={settings.projectStatuses}
        showHeader={false}
        fixed
        levelMode
        showColor={false}
      />
    </SettingsCard>
  {:else if activeTab === "status" && activeFilter === "tarefas"}
    <SettingsCard
      title="Status de tarefas"
      description="Os cinco níveis usados no fluxo das tarefas."
      allowOverflow
    >
      <LabelListEditor
        bind:items={settings.deliveryStatuses}
        showHeader={false}
        fixed
        levelMode
        showColor={false}
      />
    </SettingsCard>
  {:else if activeTab === "rotulos" && activeFilter === "negocios"}
    <SettingsCard
      title="Categorias de negócios"
      description="Classificações personalizadas com ícone e cor."
      allowOverflow
    >
      <LabelListEditor
        bind:items={settings.businessCategories}
        showHeader={false}
        max={10}
        lockedKey="outro"
        useIconColorPicker
      />
    </SettingsCard>
  {:else if activeTab === "rotulos" && activeFilter === "tarefas"}
    <SettingsCard
      title="Categorias de tarefas"
      description="Categorias personalizadas com ícone e cor."
      allowOverflow
    >
      <LabelListEditor
        bind:items={settings.deliveryCategories}
        showHeader={false}
        max={30}
        lockedKey="outro"
        useIconColorPicker
      />
    </SettingsCard>
  {:else if activeTab === "rotulos" && activeFilter === "financas"}
    <SettingsCard
      title="Categorias de receitas"
      description="Personalize nome, ícone e cor das receitas."
      allowOverflow
    >
      <LabelListEditor
        bind:items={settings.revenueCategories}
        showHeader={false}
        max={30}
        lockedKey="outros"
        useIconColorPicker
      />
    </SettingsCard>
    <SettingsCard
      title="Categorias de despesas"
      description="Personalize nome, ícone e cor das despesas."
      allowOverflow
    >
      <LabelListEditor
        bind:items={settings.expenseCategories}
        showHeader={false}
        max={30}
        lockedKey="outros"
        useIconColorPicker
      />
    </SettingsCard>
  {:else if activeTab === "rotulos" && activeFilter === "tags"}
    <SettingsCard
      title="Tags"
      description="Vocabulário reutilizável em serviços, entregas e tarefas."
    >
      <TagEditor bind:tags={settings.tags} />
    </SettingsCard>
  {/if}
</ConfigScaffold>
