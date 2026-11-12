<script lang="ts">
  import type { ActionData, PageData } from "./$types";
  import ComingSoon from "$lib/settings/ComingSoon.svelte";
  import ConfigScaffold from "$lib/settings/ConfigScaffold.svelte";
  import ConfigSaveController from "$lib/settings/ConfigSaveController.svelte";
  import type { ConfigFilter } from "$lib/settings/ConfigFilterBar.svelte";
  import SettingsCard from "$lib/settings/SettingsCard.svelte";
  import ToggleRow from "$lib/settings/ToggleRow.svelte";
  import { freshSettings } from "$lib/settings/defaults";
  import {
    exportSettingsBackup,
    importSettingsBackup,
    loadSettingsFromServer,
    resetPersonalSettings,
    savePersonalSettings,
  } from "$lib/settings/client";
  import type { SettingsState } from "$lib/settings/types";
  import type { TabItem } from "$lib/ui/Tabs.svelte";
  import {
    Download,
    KeyRound,
    RefreshCcw,
    ShieldX,
    Upload,
    Plus,
    Trash2,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  type Props = { data: PageData; form: ActionData };

  let { data, form }: Props = $props();

  const tabs: TabItem[] = [
    { id: "geral", label: "Geral" },
    { id: "interface", label: "Interface" },
    { id: "seguranca", label: "Segurança" },
    { id: "dados", label: "Dados" },
    { id: "avancado", label: "Avançado" },
  ];
  const filtersByTab: Record<string, ConfigFilter[]> = {
    geral: [
      { value: "inicializacao", label: "Inicialização" },
      { value: "navegacao", label: "Navegação" },
      { value: "regionalizacao", label: "Idioma e formatos" },
    ],
    interface: [
      { value: "aparencia", label: "Aparência" },
      { value: "cores", label: "Cores" },
      { value: "cores-niveis", label: "Cores de níveis" },
      { value: "tipografia", label: "Tipografia" },
    ],
    seguranca: [
      { value: "senha", label: "Senha" },
      { value: "sessoes", label: "Sessões" },
    ],
    dados: [
      { value: "backup", label: "Backup" },
      { value: "restaurar", label: "Restaurar" },
      { value: "resetar", label: "Resetar" },
    ],
    avancado: [
      { value: "desenvolvimento", label: "Desenvolvimento" },
      { value: "diagnostico", label: "Diagnóstico" },
    ],
  };

  let settings = $state<SettingsState>(freshSettings());
  let activeTab = $state("geral");
  let activeFilter = $state("inicializacao");
  let savedSettings = $state("");
  let dataMessage = $state("");
  let restoreFile = $state<File>();
  let resetConfirmation = $state("");
  let filters = $derived(filtersByTab[activeTab] ?? []);
  let hasUnsavedChanges = $derived(
    savedSettings !== "" && JSON.stringify(settings) !== savedSettings,
  );
  let activeSessions = $derived(data.security.sessions);
  let currentSession = $derived(
    activeSessions.find(({ id }) => id === data.security.currentSessionId),
  );

  function formatSessionDate(value: Date | string | undefined): string {
    if (!value) return "Sem registro";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }

  $effect(() => {
    if (!filters.some(({ value }) => value === activeFilter))
      activeFilter = filters[0]?.value ?? "";
  });
  onMount(() => {
    void loadSettingsFromServer()
      .then((loaded) => {
        settings = loaded;
        savedSettings = JSON.stringify(settings);
      })
      .catch((error) => {
        dataMessage =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as configurações.";
      });
  });

  async function save(): Promise<void> {
    try {
      settings = await savePersonalSettings(settings);
      savedSettings = JSON.stringify(settings);
      dataMessage = "Preferências salvas";
    } catch (error) {
      dataMessage =
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as preferências.";
      throw error;
    }
  }

  function addColor(): void {
    settings.customPalette = [
      ...settings.customPalette,
      { id: crypto.randomUUID(), name: "Nova cor", color: "#6D28D9" },
    ];
  }

  async function downloadBackup(): Promise<void> {
    const blob = new Blob([await exportSettingsBackup()], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `demanda-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    dataMessage = "Backup gerado";
  }

  async function restoreBackup(): Promise<void> {
    if (!restoreFile) return;
    if (!window.confirm("Restaurar este backup e substituir os dados atuais?"))
      return;
    try {
      settings = await importSettingsBackup(await restoreFile.text());
      savedSettings = JSON.stringify(settings);
      dataMessage = "Backup restaurado";
    } catch (error) {
      dataMessage =
        error instanceof Error
          ? error.message
          : "Não foi possível restaurar o backup.";
    }
  }

  async function resetData(): Promise<void> {
    if (resetConfirmation !== "RESETAR") return;
    settings = await resetPersonalSettings();
    savedSettings = JSON.stringify(settings);
    resetConfirmation = "";
    dataMessage = "Preferências pessoais restauradas";
  }
</script>

<svelte:head><title>Configurações · Demanda</title></svelte:head>

<ConfigSaveController dirty={hasUnsavedChanges} onsave={save} />

<ConfigScaffold {tabs} bind:activeTab {filters} bind:activeFilter>
  {#if activeTab === "geral" && activeFilter === "inicializacao"}
    <SettingsCard
      title="Inicialização"
      description="Escolha a primeira página apresentada ao entrar no Demanda."
    >
      <label class="settings-field"
        >Tela inicial<select
          class="settings-select"
          bind:value={settings.startPage}
          ><option value="dashboard">Dashboard</option><option value="pauta"
            >Pauta</option
          ><option value="agenda">Agenda</option><option value="cronograma"
            >Cronograma</option
          ><option value="registros">Registros</option><option
            value="financeiro">Financeiro</option
          ><option value="last">Último local acessado</option></select
        ></label
      >
    </SettingsCard>
  {:else if activeTab === "geral" && activeFilter === "navegacao"}
    <SettingsCard
      title="Navegação"
      description="Preferências mantidas neste navegador."
    >
      <ToggleRow
        label="Lembrar última aba acessada"
        description="Reabre a aba e a subdivisão recentes ao voltar para uma página."
        bind:checked={settings.rememberLastTab}
      />
      <ToggleRow
        label="Salvar filtros automaticamente"
        description="Mantém os filtros das listagens entre visitas."
        bind:checked={settings.autoSaveFilters}
      />
    </SettingsCard>
  {:else if activeTab === "geral" && activeFilter === "regionalizacao"}
    <SettingsCard
      title="Idioma e formatos"
      description="Controla idioma, fuso e formatos usados para datas, horas e semanas."
    >
      <div class="settings-field-grid">
        <label class="settings-field"
          >Idioma<select class="settings-select" bind:value={settings.language}
            ><option value="pt-BR">Português (Brasil)</option><option
              value="en-US">English (US)</option
            ></select
          ></label
        >
        <label class="settings-field"
          >Fuso horário<select
            class="settings-select"
            bind:value={settings.timezone}
            ><option value="America/Fortaleza">America/Fortaleza</option><option
              value="America/Sao_Paulo">America/Sao_Paulo</option
            ><option value="America/Manaus">America/Manaus</option><option
              value="America/Belem">America/Belem</option
            ><option value="UTC">UTC</option></select
          ></label
        >
        <label class="settings-field"
          >Formato de data<select
            class="settings-select"
            bind:value={settings.dateFormat}
            ><option value="d.m.Y">31.12.2026</option></select
          ></label
        >
        <label class="settings-field"
          >Formato de hora<select
            class="settings-select"
            bind:value={settings.timeFormat}
            ><option value="24h">24 horas</option><option value="12h"
              >12 horas (AM/PM)</option
            ></select
          ></label
        >
        <label class="settings-field"
          >Início da semana<select
            class="settings-select"
            bind:value={settings.weekStart}
            ><option value="sunday">Domingo</option><option value="monday"
              >Segunda</option
            ></select
          ></label
        >
      </div>
    </SettingsCard>
  {:else if activeTab === "interface" && activeFilter === "aparencia"}
    <SettingsCard
      title="Aparência"
      description="Preferências visuais e de densidade da interface."
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
      <p class="settings-notice">
        O tema escuro será aplicado quando a paleta escura global for
        implementada; a preferência já ficará armazenada.
      </p>
    </SettingsCard>
  {:else if activeTab === "interface" && activeFilter === "cores"}
    <SettingsCard
      title="Cores principais"
      description="Cores usadas como identidade visual da interface."
    >
      <div class="settings-field-grid">
        <label class="settings-field"
          >Cor primária<input
            class="settings-input"
            type="color"
            bind:value={settings.primaryColor}
          /></label
        >
        <label class="settings-field"
          >Cor secundária<input
            class="settings-input"
            type="color"
            bind:value={settings.secondaryColor}
          /></label
        >
      </div>
    </SettingsCard>
    <SettingsCard
      title="Paleta personalizada"
      description="Cores adicionais disponíveis em categorias e rótulos."
    >
      <div class="palette-head">
        <span>{settings.customPalette.length} de 24 cores</span><button
          class="settings-button"
          type="button"
          disabled={settings.customPalette.length >= 24}
          onclick={addColor}><Plus size={16} />Adicionar cor</button
        >
      </div>
      <div class="palette-list">
        {#each settings.customPalette as color (color.id)}
          <div>
            <input
              class="settings-input"
              maxlength="40"
              bind:value={color.name}
              aria-label="Nome da cor"
            /><input
              class="settings-input"
              type="color"
              bind:value={color.color}
              aria-label={`Cor de ${color.name}`}
            /><button
              class="settings-button remove"
              type="button"
              aria-label="Excluir cor"
              onclick={() =>
                (settings.customPalette = settings.customPalette.filter(
                  ({ id }) => id !== color.id,
                ))}><Trash2 size={16} /></button
            >
          </div>
        {:else}<p>Nenhuma cor personalizada.</p>{/each}
      </div>
    </SettingsCard>
  {:else if activeTab === "interface" && activeFilter === "cores-niveis"}
    <SettingsCard
      title="Cores dos níveis"
      description="Uma mesma cor representa o mesmo nível em Contatos, Negócios, Projetos e Tarefas."
    >
      <div class="status-colors">
        {#each settings.statusColors as color, index}
          <label class="settings-field"
            >Nível {index + 1}<input
              class="settings-input"
              type="color"
              bind:value={settings.statusColors[index]}
            /></label
          >
        {/each}
      </div>
    </SettingsCard>
  {:else if activeTab === "interface"}
    <SettingsCard
      title="Tipografia"
      description="Família e proporção da fonte usada na interface."
    >
      <div class="settings-field-grid">
        <label class="settings-field"
          >Família<select
            class="settings-select"
            bind:value={settings.fontFamily}
            ><option value="system">Sistema padrão</option><option value="arial"
              >Arial</option
            ><option value="pogonia">Pogonia</option><option value="georgia"
              >Georgia</option
            ></select
          ></label
        >
        <label class="settings-field"
          >Escala: {settings.fontScale}%<input
            class="settings-input range"
            type="range"
            min="85"
            max="135"
            step="5"
            bind:value={settings.fontScale}
          /></label
        >
      </div>
    </SettingsCard>
  {:else if activeTab === "seguranca" && activeFilter === "senha"}
    <SettingsCard
      title="Alterar senha"
      description="Use de 6 a 16 caracteres, com maiúscula, minúscula e número."
    >
      {#if form?.message}
        <p class="settings-notice">{form.message}</p>
      {/if}
      <form method="POST" action="?/changePassword">
        <div class="settings-field-grid">
          <label class="settings-field"
            >Senha atual<input
              class="settings-input"
              name="currentPassword"
              type="password"
              autocomplete="current-password"
              required
            /></label
          >
          <label class="settings-field"
            >Nova senha<input
              class="settings-input"
              name="password"
              type="password"
              autocomplete="new-password"
              minlength="6"
              maxlength="16"
              required
            /></label
          >
        </div>
        <label class="settings-field"
          >Confirmar nova senha<input
            class="settings-input"
            name="passwordConfirmation"
            type="password"
            autocomplete="new-password"
            minlength="6"
            maxlength="16"
            required
          /></label
        >
        <button class="settings-button primary" type="submit"
          ><KeyRound size={16} />Alterar senha</button
        >
      </form>
    </SettingsCard>
  {:else if activeTab === "seguranca"}
    <SettingsCard
      title="Sessões"
      description="Dispositivos e acessos vinculados ao usuário autenticado."
    >
      {#if form?.message}
        <p class="settings-notice">{form.message}</p>
      {/if}
      <div class="session-summary">
        <div>
          <span>Último acesso</span><strong
            >{formatSessionDate(currentSession?.lastSeenAt)}</strong
          >
        </div>
        <div>
          <span>Sessões ativas</span><strong>{activeSessions.length}</strong>
        </div>
      </div>
      <form method="POST" action="?/revokeOtherSessions">
        <button
          class="settings-button"
          type="submit"
          disabled={activeSessions.length <= 1}
          ><ShieldX size={16} />Encerrar outras sessões</button
        >
      </form>
      <form method="POST" action="?/revokeAllSessions">
        <button class="settings-button" type="submit"
          ><ShieldX size={16} />Sair de todos os dispositivos</button
        >
      </form>
    </SettingsCard>
  {:else if activeTab === "dados" && activeFilter === "backup"}
    <SettingsCard
      title="Gerar backup"
      description="Baixa configurações e registros armazenados localmente em um arquivo JSON."
    >
      <button
        class="settings-button primary"
        type="button"
        onclick={downloadBackup}><Download size={16} />Gerar backup</button
      >
      {#if dataMessage}<p class="settings-notice">{dataMessage}</p>{/if}
    </SettingsCard>
  {:else if activeTab === "dados" && activeFilter === "restaurar"}
    <SettingsCard
      title="Restaurar backup"
      description="Importa um arquivo JSON e substitui os dados locais atuais."
    >
      <label class="settings-field"
        >Arquivo de backup<input
          class="settings-input"
          type="file"
          accept=".json,application/json"
          onchange={(event) =>
            (restoreFile = (event.currentTarget as HTMLInputElement)
              .files?.[0])}
        /></label
      >
      <button
        class="settings-button primary"
        type="button"
        disabled={!restoreFile}
        onclick={restoreBackup}><Upload size={16} />Restaurar backup</button
      >
      {#if dataMessage}<p class="settings-notice">{dataMessage}</p>{/if}
    </SettingsCard>
  {:else if activeTab === "dados"}
    <SettingsCard
      title="Resetar dados"
      description="Limpa configurações e registros locais. Esta ação não pode ser desfeita."
      tone="danger"
    >
      <label class="settings-field"
        >Confirmação<small>Digite RESETAR para confirmar.</small><input
          class="settings-input"
          maxlength="20"
          bind:value={resetConfirmation}
        /></label
      >
      <button
        class="settings-button danger"
        type="button"
        disabled={resetConfirmation !== "RESETAR"}
        onclick={resetData}><RefreshCcw size={16} />Resetar</button
      >
      {#if dataMessage}<p class="settings-notice">{dataMessage}</p>{/if}
    </SettingsCard>
  {:else if activeTab === "avancado" && activeFilter === "desenvolvimento"}
    <ComingSoon
      title="Gerar dados de teste"
      description="Tarefas agora pertencem ao PostgreSQL. Use o script de seed do backend para gerar dados relacionais consistentes."
    />
  {:else}
    <ComingSoon
      title="Diagnóstico"
      description="Versão, ambiente e integridade do armazenamento serão adicionados em uma próxima etapa."
    />
  {/if}
</ConfigScaffold>

<style>
  .palette-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .palette-head span,
  .palette-list p {
    color: var(--ink-400);
    font-size: var(--text-sm);
  }
  .palette-list {
    display: grid;
    gap: 8px;
  }
  .palette-list > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 64px 40px;
    gap: 8px;
  }
  .remove {
    width: 40px;
    padding: 0;
    color: var(--danger);
  }
  .range {
    padding: 0;
    accent-color: var(--brand-600);
  }
  .status-colors {
    display: grid;
    grid-template-columns: repeat(5, minmax(100px, 1fr));
    gap: 12px;
  }
  .session-summary {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .session-summary div {
    display: grid;
    gap: 4px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--canvas);
  }
  .session-summary span {
    color: var(--ink-500);
    font-size: var(--text-xs);
  }
  .session-summary strong {
    color: var(--ink-700);
    font-size: var(--text-md);
  }
  @media (max-width: 700px) {
    .status-colors {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
