<script lang="ts">
  import ChoiceRow from "$lib/settings/ChoiceRow.svelte";
  import ConfigSaveController from "$lib/settings/ConfigSaveController.svelte";
  import ConfigScaffold from "$lib/settings/ConfigScaffold.svelte";
  import SettingsCard from "$lib/settings/SettingsCard.svelte";
  import ToggleRow from "$lib/settings/ToggleRow.svelte";
  import WorkdayEditor from "$lib/settings/WorkdayEditor.svelte";
  import {
    loadSettingsFromServer,
    savePersonalSettings,
  } from "$lib/settings/client";
  import { freshSettings } from "$lib/settings/defaults";
  import type { SettingsState } from "$lib/settings/types";
  import { cardScale, normalizeCardScale } from "$lib/ui/card-scale";
  import type { TabItem } from "$lib/ui/Tabs.svelte";
  import { ExternalLink } from "@lucide/svelte";
  import { onMount } from "svelte";

  const tabs: TabItem[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "workspace", label: "Workspace" },
    { id: "registro", label: "Registro" },
    { id: "pauta", label: "Pauta" },
    { id: "cronograma", label: "Cronograma" },
    { id: "agenda", label: "Agenda" },
    { id: "financeiro", label: "Financeiro" },
  ];

  const durationOptions = [
    { value: "0.5", label: "30 minutos" },
    { value: "1", label: "1 hora" },
    { value: "1.5", label: "1h30" },
    { value: "2", label: "2 horas" },
    { value: "3", label: "3 horas" },
    { value: "4", label: "4 horas" },
  ];

  let settings = $state<SettingsState>(freshSettings());
  let activeTab = $state("dashboard");
  let savedSettings = $state("");
  let saveMessage = $state("");
  let hasUnsavedChanges = $derived(
    savedSettings !== "" && JSON.stringify(settings) !== savedSettings,
  );

  onMount(() => {
    void loadSettingsFromServer()
      .then((loaded) => {
        settings = loaded;
        savedSettings = JSON.stringify(settings);
      })
      .catch((error) => {
        saveMessage =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as preferências.";
      });
  });

  async function save(): Promise<void> {
    settings.recordsCardLevel = normalizeCardScale(settings.recordsCardLevel);
    try {
      settings = await savePersonalSettings(settings);
      cardScale.set(settings.recordsCardLevel);
      savedSettings = JSON.stringify(settings);
      saveMessage = "Preferências salvas";
    } catch (error) {
      saveMessage =
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as preferências.";
      throw error;
    }
  }
</script>

<svelte:head><title>Preferências · Demanda</title></svelte:head>

<ConfigSaveController dirty={hasUnsavedChanges} onsave={save} />

{#if saveMessage}<p class="sr-only" aria-live="polite">{saveMessage}</p>{/if}

<ConfigScaffold {tabs} bind:activeTab>
  {#if activeTab === "dashboard"}
    <SettingsCard
      title="Visão geral"
      description="Defina o período e os blocos que aparecem ao abrir o Dashboard."
    >
      <ChoiceRow
        label="Período padrão"
        description="Intervalo usado como referência nos indicadores e resumos."
        options={[
          { value: "week", label: "Semana atual" },
          { value: "month", label: "Mês atual" },
        ]}
        bind:value={settings.dashboardDefaultPeriod}
      />
      <ToggleRow
        label="Indicadores principais"
        description="Exibe os números de demandas, conclusões, prazos e horas planejadas."
        bind:checked={settings.dashboardShowMetrics}
      />
      <ToggleRow
        label="Agenda de hoje"
        description="Mantém os compromissos do dia no resumo operacional."
        bind:checked={settings.dashboardShowTodaySchedule}
      />
      <ToggleRow
        label="Carga da semana"
        description="Exibe a distribuição entre horas planejadas, realizadas e disponíveis."
        bind:checked={settings.dashboardShowWorkload}
      />
      <ToggleRow
        label="Atividade recente"
        description="Mostra as últimas movimentações realizadas no workspace."
        bind:checked={settings.dashboardShowRecentActivity}
      />
    </SettingsCard>
  {:else if activeTab === "workspace"}
    <SettingsCard
      title="Organização da listagem"
      description="Escolha a ordem e quais workspaces fazem parte da visão principal."
    >
      <ChoiceRow
        label="Ordenar workspaces por"
        description="O workspace em uso pode permanecer no topo ou seguir a ordenação geral."
        options={[
          { value: "active", label: "Workspace em uso" },
          { value: "updated", label: "Atualização recente" },
          { value: "name", label: "Nome (A–Z)" },
        ]}
        bind:value={settings.workspaceOrderBy}
      />
      <ToggleRow
        label="Exibir workspaces inativos"
        description="Inclui espaços sem projetos ou tarefas em andamento."
        bind:checked={settings.workspaceShowInactive}
      />
    </SettingsCard>

    <SettingsCard
      title="Conteúdo dos cards"
      description="Controle o nível de informação apresentado em cada workspace."
    >
      <ToggleRow
        label="Projetos associados"
        description="Exibe a faixa de projetos vinculados ao workspace."
        bind:checked={settings.workspaceShowProjectPreviews}
      />
      <ToggleRow
        label="Colaboradores"
        description="Exibe os avatares dos membros em cada card."
        bind:checked={settings.workspaceShowCollaborators}
      />
      <ToggleRow
        label="Incluir projetos arquivados"
        description="Considera projetos arquivados na contagem e na faixa de associados."
        bind:checked={settings.workspaceIncludeArchivedProjects}
      />
      <a class="settings-link" href="/workspaces">
        Abrir gerenciamento de workspaces <ExternalLink size={15} />
      </a>
    </SettingsCard>
  {:else if activeTab === "registro"}
    <SettingsCard
      title="Abertura e listagem"
      description="Defina como os registros são apresentados ao entrar na página."
    >
      <ChoiceRow
        label="Aba inicial"
        description="Tipo de registro selecionado na primeira abertura."
        options={[
          { value: "pessoas", label: "Contatos" },
          { value: "negocios", label: "Negócios" },
          { value: "projetos", label: "Projetos" },
          { value: "tarefas", label: "Tarefas" },
        ]}
        bind:value={settings.recordsDefaultTab}
      />
      <ChoiceRow
        label="Ordenar registros por"
        description="Ordem inicial aplicada aos cards antes de uma busca ou filtro."
        options={[
          { value: "updated", label: "Atualização recente" },
          { value: "name_asc", label: "Nome (A–Z)" },
          { value: "name_desc", label: "Nome (Z–A)" },
        ]}
        bind:value={settings.recordsOrderBy}
      />
      <ToggleRow
        label="Exibir registros arquivados"
        description="Inclui itens arquivados nas listagens e nos resultados de busca."
        bind:checked={settings.recordsShowArchived}
      />
      <div class="settings-range-row">
        <span>
          <strong>Nível de detalhes dos cards</strong>
          <small
            >Níveis menores são mais compactos; níveis maiores mostram mais
            informações.</small
          >
        </span>
        <label class="settings-range-control">
          <span class="sr-only">Nível de detalhes dos cards</span>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            bind:value={settings.recordsCardLevel}
          />
          <output>{settings.recordsCardLevel}</output>
        </label>
      </div>
    </SettingsCard>

    <SettingsCard
      title="Novas tarefas"
      description="Valor inicial usado ao criar um registro de tarefa."
    >
      <ChoiceRow
        label="Duração padrão"
        description="Pode ser ajustada individualmente durante a programação."
        options={durationOptions}
        bind:value={settings.defaultTaskDuration}
      />
    </SettingsCard>
  {:else if activeTab === "pauta"}
    <SettingsCard
      title="Organização da pauta"
      description="Configure a ordem dos cards dentro de cada etapa do quadro."
    >
      <ChoiceRow
        label="Ordenar cards por"
        description="A organização manual preserva a sequência definida no quadro."
        options={[
          { value: "manual", label: "Organização manual" },
          { value: "priority", label: "Prioridade" },
          { value: "deadline", label: "Prazo" },
          { value: "updated", label: "Atualização recente" },
        ]}
        bind:value={settings.pautaOrderBy}
      />
      <ToggleRow
        label="Exibir projeto e responsável"
        description="Mantém o contexto da tarefa visível em cada card."
        bind:checked={settings.pautaShowCardDetails}
      />
    </SettingsCard>

    <SettingsCard
      title="Visibilidade das tarefas"
      description="Escolha quais estados permanecem disponíveis na pauta."
    >
      <ToggleRow
        label="Exibir tarefas concluídas"
        description="Inclui entregas finalizadas na etapa de conclusão."
        bind:checked={settings.pautaShowDone}
      />
      <ToggleRow
        label="Exibir tarefas arquivadas"
        description="Inclui tarefas arquivadas quando elas ainda pertencem a uma etapa do quadro."
        bind:checked={settings.pautaShowArchived}
      />
    </SettingsCard>
  {:else if activeTab === "cronograma"}
    <SettingsCard
      title="Grade semanal"
      description="Defina a área útil e os elementos que aparecem no Cronograma."
    >
      <ChoiceRow
        label="Padrão da gaveta “Tarefas a programar”"
        description="Estado usado ao abrir o Cronograma em uma nova visita."
        options={[
          { value: "expanded", label: "Expandida" },
          { value: "collapsed", label: "Contraída" },
        ]}
        bind:value={settings.cronogramaDrawerDefault}
      />
      <ChoiceRow
        label="Dias exibidos"
        description="Escolha se o sábado faz parte da grade de planejamento."
        options={[
          { value: "weekdays", label: "Segunda a sexta" },
          { value: "saturday", label: "Segunda a sábado" },
        ]}
        bind:value={settings.cronogramaDays}
      />
      <ToggleRow
        label="Marcador do horário atual"
        description="Destaca a posição do horário corrente na coluna do dia."
        bind:checked={settings.cronogramaShowCurrentTime}
      />
    </SettingsCard>

    <SettingsCard
      title="Expediente"
      description="Horários usados para dimensionar o Cronograma e distribuir tarefas na Agenda."
    >
      <WorkdayEditor bind:shifts={settings.workdayShifts} />
    </SettingsCard>

    <SettingsCard
      title="Programação de tarefas"
      description="Duração aplicada quando uma tarefa ainda não possui estimativa."
    >
      <ChoiceRow
        label="Duração padrão"
        description="O valor continua podendo ser alterado em cada tarefa."
        options={durationOptions}
        bind:value={settings.defaultTaskDuration}
      />
    </SettingsCard>
  {:else if activeTab === "agenda"}
    <SettingsCard
      title="Abertura da Agenda"
      description="Escolha o conteúdo e a visualização usados como ponto de partida."
    >
      <ChoiceRow
        label="Conteúdo inicial"
        description="Alterna entre o planejamento de projetos e o de tarefas."
        options={[
          { value: "projects", label: "Projetos" },
          { value: "tasks", label: "Tarefas" },
        ]}
        bind:value={settings.agendaDefaultMode}
      />
      <ChoiceRow
        label="Visualização inicial"
        description="Período mostrado ao entrar na página."
        options={[
          { value: "day", label: "Diária" },
          { value: "week", label: "Semanal" },
          { value: "month", label: "Mensal" },
        ]}
        bind:value={settings.agendaDefaultView}
      />
      <ChoiceRow
        label="Gaveta de itens não programados"
        description="Estado padrão da área usada para organizar itens sem data."
        options={[
          { value: "expanded", label: "Expandida" },
          { value: "collapsed", label: "Contraída" },
        ]}
        bind:value={settings.agendaDrawerDefault}
      />
      <ToggleRow
        label="Lembrar a última visualização"
        description="Ao voltar à Agenda, prioriza o conteúdo, período e estado da gaveta usados por último."
        bind:checked={settings.agendaRememberLastView}
      />
      <ToggleRow
        label="Exibir fins de semana"
        description="Inclui sábado e domingo nas visualizações semanal e mensal."
        bind:checked={settings.agendaShowWeekends}
      />
    </SettingsCard>

    <SettingsCard
      title="Lembretes de tarefa"
      description="Configure a antecedência e a notificação pessoal."
    >
      <ChoiceRow
        label="Lembrar antes"
        description="Antecedência aplicada aos lembretes das tarefas agendadas."
        options={[
          { value: "0", label: "Sem lembrete" },
          { value: "10", label: "10 minutos" },
          { value: "15", label: "15 minutos" },
          { value: "30", label: "30 minutos" },
          { value: "60", label: "1 hora" },
          { value: "120", label: "2 horas" },
        ]}
        bind:value={settings.taskReminderMinutes}
      />
      <ToggleRow
        label="Notificar lembretes"
        description="Envia uma notificação quando chegar a antecedência escolhida."
        bind:checked={settings.notifyTaskReminders}
      />
    </SettingsCard>
  {:else if activeTab === "financeiro"}
    <SettingsCard
      title="Abertura e período"
      description="Defina a visão inicial e o alcance do planejamento financeiro."
    >
      <ChoiceRow
        label="Aba inicial"
        description="Área selecionada ao entrar no Financeiro."
        options={[
          { value: "painel", label: "Painel" },
          { value: "receitas", label: "Receitas" },
          { value: "despesas", label: "Despesas" },
        ]}
        bind:value={settings.financeDefaultTab}
      />
      <ChoiceRow
        label="Período inicial"
        description="Escolha entre o calendário atual e o último mês consultado."
        options={[
          { value: "current", label: "Mês atual" },
          { value: "last", label: "Último mês acessado" },
        ]}
        bind:value={settings.financeInitialPeriod}
      />
      <ChoiceRow
        label="Horizonte do planejamento"
        description="Quantidade de meses apresentada na projeção do Painel."
        options={[
          { value: "3", label: "3 meses" },
          { value: "6", label: "6 meses" },
          { value: "12", label: "12 meses" },
        ]}
        bind:value={settings.financePlanningMonths}
      />
    </SettingsCard>

    <SettingsCard
      title="Conteúdo financeiro"
      description="Controle quais informações aparecem no Painel e nas listagens."
    >
      <ToggleRow
        label="Exibir valores no Painel"
        description="Mostra os totais financeiros nos indicadores e no planejamento."
        bind:checked={settings.financeShowDashboardValues}
      />
      <ToggleRow
        label="Exibir lançamentos quitados"
        description="Inclui receitas recebidas e despesas pagas nas listagens."
        bind:checked={settings.financeShowSettled}
      />
      <ToggleRow
        label="Exibir lançamentos pausados"
        description="Inclui cobranças e pagamentos temporariamente pausados."
        bind:checked={settings.financeShowPaused}
      />
    </SettingsCard>
  {/if}
</ConfigScaffold>

<style>
  .settings-link {
    display: inline-flex;
    width: fit-content;
    min-height: 39px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 13px;
    border: 1px solid color-mix(in srgb, var(--brand-600) 24%, var(--border));
    border-radius: 9px;
    color: var(--brand-700, var(--brand-600));
    background: var(--brand-50);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .settings-link:hover {
    border-color: var(--brand-500);
    background: color-mix(in srgb, var(--brand-50) 72%, white);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
