<script lang="ts">
  import { onMount } from "svelte";
  import { Download, FileText, RefreshCw } from "@lucide/svelte";
  import PageHeader from "$lib/ui/PageHeader.svelte";

  const modules = [
    { id: "deliveries", label: "Tarefas" },
    { id: "tasks", label: "Tarefas" },
    { id: "cronograma", label: "Cronograma" },
    { id: "agenda", label: "Agenda" },
    { id: "projects", label: "Projetos" },
  ] as const;
  type ModuleId = (typeof modules)[number]["id"];
  type Change = { field: string; before: unknown; after: unknown };
  type Event = {
    id: string;
    occurredAt: string;
    actorName: string;
    action: string;
    module: string;
    moduleLabel: string;
    targetId: string | null;
    changes: Change[];
  };
  type Report = {
    range: { from: string; to: string };
    summary: { total: number; byModule: Record<string, number> };
    events: Event[];
  };

  function isoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const today = isoDate(new Date());
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  let from = $state(isoDate(thirtyDaysAgo));
  let to = $state(today);
  let selectedModules = $state<ModuleId[]>(modules.map(({ id }) => id));
  let report = $state<Report | null>(null);
  let loading = $state(false);
  let message = $state("");

  function actionLabel(action: string): string {
    const labels: Record<string, string> = {
      "delivery.status_changed": "Status da tarefa alterado",
      "task.status_changed": "Status da tarefa alterado",
      "delivery.due_date_changed": "Data de entrega da tarefa alterada",
      "project.due_date_changed": "Data de entrega do projeto alterada",
      "agenda.placement_changed": "Posicionamento na agenda alterado",
      "cronograma.block_created": "Bloco adicionado ao cronograma",
      "cronograma.block_changed": "Bloco do cronograma alterado",
      "cronograma.block_deleted": "Bloco removido do cronograma",
    };
    return labels[action] ?? action;
  }

  function fieldLabel(field: string): string {
    const labels: Record<string, string> = {
      status: "Status",
      completedAt: "Conclusao",
      dueDate: "Data de entrega",
      date: "Data",
      position: "Posicao",
      startMinutes: "Horario de inicio",
      durationMinutes: "Duracao",
    };
    return labels[field] ?? field;
  }

  function display(value: unknown): string {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "number" && value >= 0 && value <= 1440) {
      if (value % 30 === 0 && value > 0) {
        const hours = Math.floor(value / 60);
        const minutes = value % 60;
        return hours
          ? `${hours}h${minutes ? ` ${minutes}min` : ""}`
          : `${minutes} min`;
      }
    }
    return String(value);
  }

  function toggleModule(id: ModuleId): void {
    selectedModules = selectedModules.includes(id)
      ? selectedModules.filter((module) => module !== id)
      : [...selectedModules, id];
  }

  async function generate(): Promise<void> {
    if (!selectedModules.length) {
      message = "Selecione pelo menos um tipo de informacao.";
      report = null;
      return;
    }
    loading = true;
    message = "";
    try {
      const query = new URLSearchParams({
        from,
        to,
        modules: selectedModules.join(","),
      });
      const response = await fetch(`/api/history?${query}`);
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message ?? "Nao foi possivel gerar o relatorio.");
      report = body;
    } catch (cause) {
      report = null;
      message =
        cause instanceof Error
          ? cause.message
          : "Nao foi possivel gerar o relatorio.";
    } finally {
      loading = false;
    }
  }

  function downloadCsv(): void {
    if (!report) return;
    const rows = [
      [
        "Data e hora",
        "Responsavel",
        "Modulo",
        "Acao",
        "Campo",
        "Anterior",
        "Novo",
      ],
      ...report.events.flatMap((event) =>
        (event.changes.length
          ? event.changes
          : [{ field: "", before: "", after: "" }]
        ).map((change) => [
          new Date(event.occurredAt).toLocaleString("pt-BR"),
          event.actorName,
          event.moduleLabel,
          actionLabel(event.action),
          fieldLabel(change.field),
          display(change.before),
          display(change.after),
        ]),
      ),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `historico-${report.range.from}-a-${report.range.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  onMount(() => void generate());
</script>

<svelte:head><title>Relatórios - Demanda</title></svelte:head>

<section class="history-page">
  <PageHeader eyebrow="Meu negócio" title="Relatórios" icon={FileText}>
    {#snippet actions()}
      {#if report}
        <button class="secondary" onclick={downloadCsv}
          ><Download size={16} /> Baixar CSV</button
        >
      {/if}
    {/snippet}
  </PageHeader>

  <form
    onsubmit={(event) => {
      event.preventDefault();
      void generate();
    }}
    class="generator"
  >
    <div class="dates">
      <label>De <input type="date" bind:value={from} max={to} /></label>
      <label
        >Ate <input type="date" bind:value={to} min={from} max={today} /></label
      >
    </div>
    <fieldset>
      <legend>Incluir no relatorio</legend>
      <div class="modules">
        {#each modules as module}
          <label class:checked={selectedModules.includes(module.id)}>
            <input
              type="checkbox"
              checked={selectedModules.includes(module.id)}
              onchange={() => toggleModule(module.id)}
            />
            {module.label}
          </label>
        {/each}
      </div>
    </fieldset>
    <button class="primary" disabled={loading}>
      <RefreshCw size={16} class={loading ? "spinning" : ""} />
      {loading ? "Gerando..." : "Gerar relatorio"}
    </button>
  </form>

  {#if message}<p class="message">{message}</p>{/if}

  {#if report}
    <section class="summary" aria-label="Resumo do relatorio">
      <article class="total">
        <FileText size={22} /><strong>{report.summary.total}</strong><span
          >alteracoes encontradas</span
        >
      </article>
      {#each modules as module}
        <article>
          <strong>{report.summary.byModule[module.id] ?? 0}</strong><span
            >{module.label.toLocaleLowerCase("pt-BR")}</span
          >
        </article>
      {/each}
    </section>

    <section class="events">
      <div class="section-title">
        <h2>Alteracoes</h2>
        <span>{report.range.from} a {report.range.to}</span>
      </div>
      {#if report.events.length}
        <ol>
          {#each report.events as event}
            <li>
              <div class="event-top">
                <span class="tag">{event.moduleLabel}</span><strong
                  >{actionLabel(event.action)}</strong
                ><time
                  >{new Date(event.occurredAt).toLocaleString("pt-BR")}</time
                >
              </div>
              <p>Por {event.actorName}</p>
              {#if event.changes.length}
                <div class="changes">
                  {#each event.changes as change}
                    <span
                      ><b>{fieldLabel(change.field)}:</b>
                      {display(change.before)} -&gt; {display(
                        change.after,
                      )}</span
                    >
                  {/each}
                </div>
              {/if}
            </li>
          {/each}
        </ol>
      {:else}
        <div class="empty">
          Nenhuma alteracao encontrada para estes filtros.
        </div>
      {/if}
    </section>
  {/if}
</section>

<style>
  .history-page {
    width: 100%;
    color: #12213a;
  }
  p {
    color: #667085;
    margin: 0;
  }
  .generator,
  .events {
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    background: white;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
  }
  .generator {
    display: flex;
    align-items: end;
    flex-wrap: wrap;
    gap: 18px;
    padding: 18px;
  }
  .dates,
  .modules {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  label {
    display: grid;
    gap: 6px;
    color: #475569;
    font-size: 13px;
    font-weight: 600;
  }
  input[type="date"] {
    min-height: 38px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 0 9px;
    color: #172554;
    font: inherit;
  }
  fieldset {
    min-width: 290px;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: 8px;
    color: #475569;
    font-size: 13px;
    font-weight: 600;
  }
  .modules label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border: 1px solid #dbe2ea;
    border-radius: 8px;
    cursor: pointer;
  }
  .modules label.checked {
    border-color: #9db2ff;
    color: #2047e7;
    background: #f3f6ff;
  }
  button {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 13px;
    border-radius: 8px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .primary {
    border: 0;
    color: white;
    background: #3158ff;
  }
  .secondary {
    border: 1px solid #cbd5e1;
    color: #334155;
    background: white;
  }
  button:disabled {
    opacity: 0.65;
    cursor: wait;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px;
    margin: 20px 0;
  }
  .summary article {
    display: grid;
    gap: 4px;
    padding: 14px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: #fff;
  }
  .summary .total {
    border-color: #b9c8ff;
    background: #f5f7ff;
  }
  .summary strong {
    font-size: 25px;
  }
  .summary span {
    color: #64748b;
    font-size: 12px;
  }
  .events {
    overflow: hidden;
  }
  .section-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px;
    border-bottom: 1px solid #e2e8f0;
  }
  h2 {
    margin: 0;
    font-size: 17px;
  }
  .section-title span {
    color: #64748b;
    font-size: 13px;
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    padding: 16px 18px;
    border-bottom: 1px solid #edf1f5;
  }
  li:last-child {
    border: 0;
  }
  .event-top {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  time {
    margin-left: auto;
    color: #64748b;
    font-size: 12px;
  }
  .tag {
    padding: 3px 7px;
    border-radius: 999px;
    color: #3158ff;
    background: #eef2ff;
    font-size: 11px;
    font-weight: 700;
  }
  li p {
    margin: 6px 0 0;
    font-size: 13px;
  }
  .changes {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 10px;
  }
  .changes span {
    padding: 5px 7px;
    border-radius: 6px;
    color: #475569;
    background: #f8fafc;
    font-size: 12px;
  }
  .message,
  .empty {
    margin-top: 16px;
    padding: 15px;
    border-radius: 10px;
    color: #64748b;
    background: #f8fafc;
  }
  :global(.spinning) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 760px) {
    .summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    time {
      width: 100%;
      margin-left: 0;
    }
  }
</style>
