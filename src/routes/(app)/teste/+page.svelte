<script lang="ts">
  import { peopleConfig } from "$lib/entities/catalog";
  import { loadEntityRecords } from "$lib/entities/storage";
  import type { EntityRecord } from "$lib/entities/types";
  import EntityCardList from "$lib/ui/EntityCardList.svelte";
  import CardScaleControl from "$lib/ui/CardScaleControl.svelte";
  import FilterBar, { type FilterOption } from "$lib/ui/FilterBar.svelte";
  import FloatingMenu, {
    type FloatingMenuItem,
  } from "$lib/ui/FloatingMenu.svelte";
  import IconColorPicker from "$lib/ui/IconColorPicker.svelte";
  import MagneticBoard, {
    type BoardColumn,
  } from "$lib/ui/MagneticBoard.svelte";
  import PageHeader from "$lib/ui/PageHeader.svelte";
  import GlobalSelector, {
    type GlobalSelectorItem,
  } from "$lib/ui/GlobalSelector.svelte";
  import Switcher from "$lib/ui/Switcher.svelte";
  import TabSystem from "$lib/ui/TabSystem.svelte";
  import type { TabItem } from "$lib/ui/Tabs.svelte";
  import {
    CalendarDays,
    CheckCircle2,
    FileText,
    FolderKanban,
    Plus,
    WandSparkles,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  const tabs: TabItem[] = [
    { id: "abas", label: "Abas" },
    { id: "filtros", label: "Filtros" },
    { id: "cards", label: "Cards" },
    { id: "switcher", label: "Switcher" },
    { id: "icone-cor", label: "Ícone + cor" },
    { id: "arrastar", label: "Arrastar e soltar" },
    { id: "menu", label: "Menu flutuante" },
    { id: "pessoas", label: "Seletor global" },
  ];
  let activeTab = $state("abas");
  let exampleTab = $state("contatos");

  const filterOptions: FilterOption[] = [
    { value: "todos", label: "Todos", count: 6 },
    { value: "ativos", label: "Ativos", count: 3 },
    { value: "rascunhos", label: "Rascunhos", count: 2 },
    { value: "concluidos", label: "Concluídos", count: 1 },
  ];
  const records = [
    { name: "Campanha de inverno", status: "ativos" },
    { name: "Novo portfólio", status: "ativos" },
    { name: "Calendário editorial", status: "rascunhos" },
    { name: "Guia da marca", status: "concluidos" },
    { name: "Pesquisa de público", status: "rascunhos" },
    { name: "Landing page", status: "ativos" },
  ];
  let filter = $state("todos");
  let query = $state("");
  let filteredRecords = $derived(
    records.filter(
      (item) =>
        (filter === "todos" || item.status === filter) &&
        item.name.toLowerCase().includes(query.toLowerCase()),
    ),
  );

  let view = $state("semana");
  let selectedIcon = $state("rocket");
  let selectedColor = $state("blue");

  let columns = $state<BoardColumn[]>([
    {
      id: "ideias",
      title: "Ideias",
      items: [
        { id: "1", title: "Nova identidade", detail: "Marca" },
        { id: "2", title: "Roteiro do vídeo", detail: "Conteúdo" },
      ],
    },
    {
      id: "fazendo",
      title: "Em andamento",
      items: [{ id: "3", title: "Página inicial", detail: "Produto" }],
    },
    {
      id: "pronto",
      title: "Concluído",
      items: [{ id: "4", title: "Briefing", detail: "Documento" }],
    },
  ]);
  const menuItems: FloatingMenuItem[] = [
    {
      id: "tarefa",
      label: "Nova tarefa",
      description: "Crie um item de trabalho",
      icon: CheckCircle2,
    },
    {
      id: "evento",
      label: "Novo evento",
      description: "Reserve um horário",
      icon: CalendarDays,
    },
    {
      id: "nota",
      label: "Nova nota",
      description: "Registre uma ideia",
      icon: FileText,
    },
  ];
  let menuFeedback = $state("Nenhuma ação selecionada");

  function toSelectorItem(
    person: EntityRecord | Record<string, string>,
    index: number,
  ): GlobalSelectorItem {
    const role = person.cargo || "Pessoa cadastrada";
    const contact = person.email ? ` · ${person.email}` : "";
    return {
      id: person.id ?? `pessoa-${index + 1}`,
      label: person.nome,
      description: `${role}${contact}`,
      relevance: 100 - index,
      updatedAt: person.updatedAt,
    };
  }

  let people = $state<GlobalSelectorItem[]>(
    peopleConfig.seeds.map(toSelectorItem),
  );
  let selectedPeople = $state<GlobalSelectorItem[]>([]);

  onMount(() => {
    people = loadEntityRecords(peopleConfig).map(toSelectorItem);
  });
</script>

<svelte:head><title>Teste de componentes · Demanda</title></svelte:head>

<PageHeader
  eyebrow="Laboratório"
  title="Teste de componentes"
  icon={WandSparkles}
/>

<TabSystem
  items={tabs}
  bind:value={activeTab}
  ariaLabel="Componentes disponíveis"
  idPrefix="test-components"
  class="test-tab-system"
  tabListClass="test-tabs"
  tabClass="test-tab"
  panelClass="test-panel"
  minHeight="410px"
  mobileMinHeight="500px"
>
  {#if activeTab === "abas"}
    <div class="section-copy">
      <span>01</span>
      <div>
        <h2>Sistema de abas</h2>
        <p>
          Organiza subpáginas relacionadas sem tirar o usuário do contexto
          atual. Use as abas acima para navegar por este laboratório.
        </p>
      </div>
    </div>
    <div class="demo-frame compact tab-demo">
      <TabSystem
        items={[
          { id: "contatos", label: "Contatos" },
          { id: "negocios", label: "Negócios" },
          { id: "projetos", label: "Projetos" },
          { id: "tarefas", label: "Tarefas" },
        ]}
        bind:value={exampleTab}
        ariaLabel="Exemplo do sistema de abas"
        idPrefix="test-example"
        class="sample-tab-system"
        tabListClass="sample-tabs"
        tabClass="sample-tab"
        panelClass="sample-panel"
        minHeight="110px"
      >
        <div class="sample-panel__content">
          <strong
            >{exampleTab === "contatos"
              ? "Contatos"
              : exampleTab === "negocios"
                ? "Negócios"
                : exampleTab === "projetos"
                  ? "Projetos"
                  : "Tarefas"}</strong
          >
          <p>A aba ativa se conecta visualmente a este painel.</p>
        </div>
      </TabSystem>
    </div>
  {:else if activeTab === "filtros"}
    <div class="section-copy">
      <span>02</span>
      <div>
        <h2>Sistema de filtros</h2>
        <p>
          Combina categorias rápidas, contadores e pesquisa textual. O resultado
          abaixo reage aos dois controles.
        </p>
      </div>
    </div>
    <FilterBar
      options={filterOptions}
      bind:selected={filter}
      bind:query
      placeholder="Buscar projeto..."
    />
    <div class="results">
      {#each filteredRecords as item (item.name)}<div>
          <FolderKanban size={17} /><strong>{item.name}</strong><small
            >{filterOptions.find((option) => option.value === item.status)
              ?.label}</small
          >
        </div>{:else}<p>Nenhum projeto encontrado.</p>{/each}
    </div>
  {:else if activeTab === "cards"}
    <div class="cards-section-head">
      <div class="section-copy">
        <span>03</span>
        <div>
          <h2>Sistema de cards</h2>
          <p>
            Modelos de pessoa, negócio, projeto e entrega com escala de
            densidade e informações progressivas.
          </p>
        </div>
      </div>
      <CardScaleControl />
    </div>
    <EntityCardList />
  {:else if activeTab === "switcher"}
    <div class="section-copy">
      <span>04</span>
      <div>
        <h2>Botão Switcher</h2>
        <p>
          Alterna entre visões equivalentes. Este padrão pode ser usado na
          Agenda para dia, semana e mês.
        </p>
      </div>
    </div>
    <div class="demo-frame switch-demo">
      <div>
        <strong>Visualização da agenda</strong><small>Selecionado: {view}</small
        >
      </div>
      <Switcher
        options={[
          { value: "dia", label: "Dia" },
          { value: "semana", label: "Semana" },
          { value: "mes", label: "Mês" },
        ]}
        bind:value={view}
      />
    </div>
  {:else if activeTab === "icone-cor"}
    <div class="section-copy">
      <span>05</span>
      <div>
        <h2>Ícone + cor</h2>
        <p>
          Uma escolha dupla para personalizar categorias, etiquetas e tipos sem
          perder a consistência.
        </p>
      </div>
    </div>
    <div class="demo-frame">
      <IconColorPicker bind:selectedIcon bind:selectedColor />
    </div>
  {:else if activeTab === "arrastar"}
    <div class="section-copy">
      <span>06</span>
      <div>
        <h2>Arrastar e soltar com magnetismo</h2>
        <p>
          Arraste um cartão entre as colunas. O destino ganha destaque e o item
          se encaixa automaticamente.
        </p>
      </div>
    </div>
    <MagneticBoard bind:columns />
  {:else if activeTab === "menu"}
    <div class="section-copy">
      <span>07</span>
      <div>
        <h2>Caixa de menu flutuante</h2>
        <p>
          O balão fica ancorado ao botão de origem, com ponta direcional, sombra
          e fechamento por clique externo ou tecla Esc.
        </p>
      </div>
    </div>
    <div class="demo-frame menu-demo">
      <FloatingMenu
        label="Criar novo"
        icon={Plus}
        items={menuItems}
        onselect={(item) => (menuFeedback = item.label)}
      />
      <p>{menuFeedback}</p>
    </div>
  {:else if activeTab === "pessoas"}
    <div class="section-copy">
      <span>08</span>
      <div>
        <h2>Seletor global</h2>
        <p>
          Use a mesma base para buscar ou escolher pessoas e outras entidades,
          com seleção única ou múltipla conforme o contexto.
        </p>
      </div>
    </div>
    <div class="demo-frame people-demo">
      <GlobalSelector
        items={people}
        bind:selected={selectedPeople}
        presentation="search"
        selection="multiple"
        label="Selecionar pessoas"
        placeholder="Digite um nome para buscar..."
        showInitials
        showLabel
        showHelper
      />
    </div>
  {/if}
</TabSystem>

<style>
  .section-copy {
    display: flex;
    align-items: flex-start;
    gap: 13px;
    margin-bottom: 24px;
  }
  .cards-section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 24px;
  }
  .cards-section-head .section-copy {
    min-width: 0;
    margin-bottom: 0;
  }
  .section-copy > span {
    display: grid;
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 9px;
    color: var(--brand-600);
    background: var(--brand-50);
    font-size: var(--text-xs);
    font-weight: 700;
  }
  h2 {
    color: var(--ink-950);
    font-size: var(--text-xl);
    letter-spacing: -0.02em;
  }
  .section-copy p {
    max-width: 720px;
    margin-top: 5px;
    color: var(--ink-500);
    font-size: var(--text-sm);
    line-height: 1.55;
  }
  .demo-frame {
    padding: 22px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--canvas);
  }
  .demo-frame.compact {
    max-width: 620px;
  }
  .demo-frame.tab-demo {
    padding: 22px 0 0;
    overflow: hidden;
    background: var(--main-background);
  }
  .sample-panel__content strong {
    color: var(--ink-800);
    font-size: var(--text-md);
  }
  .sample-panel__content p {
    margin-top: 6px;
    color: var(--ink-500);
    font-size: var(--text-sm);
  }
  .switch-demo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .switch-demo strong,
  .switch-demo small {
    display: block;
  }
  .switch-demo strong {
    color: var(--ink-800);
    font-size: var(--text-md);
  }
  .switch-demo small {
    margin-top: 4px;
    color: var(--ink-400);
    font-size: var(--text-xs);
    text-transform: capitalize;
  }
  .results {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
    gap: 9px;
    margin-top: 14px;
  }
  .results > div {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 13px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--brand-600);
    background: var(--surface);
  }
  .results strong {
    overflow: hidden;
    color: var(--ink-700);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .results small {
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  .results > p {
    padding: 24px;
    color: var(--ink-400);
    font-size: var(--text-sm);
  }
  .menu-demo {
    min-height: 230px;
  }
  .menu-demo > p {
    margin-top: 18px;
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  .people-demo {
    width: min(760px, 100%);
    min-height: 470px;
  }
  @media (max-width: 640px) {
    .switch-demo {
      align-items: flex-start;
      flex-direction: column;
    }
    .cards-section-head {
      gap: 14px;
      flex-direction: column;
    }
  }
</style>
