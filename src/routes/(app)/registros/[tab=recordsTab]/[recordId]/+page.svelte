<script lang="ts">
  import PageHeader from "$lib/ui/PageHeader.svelte";
  import {
    ArrowRight,
    BriefcaseBusiness,
    CalendarClock,
    CircleUserRound,
    FolderKanban,
    LayoutGrid,
    ListTodo,
    Send,
    Table2,
  } from "@lucide/svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const icons = {
    pessoa: CircleUserRound,
    negocio: BriefcaseBusiness,
    projeto: FolderKanban,
    tarefa: ListTodo,
  };
  let Icon = $derived(icons[data.detail.kind]);
  let businessView = $state<"cards" | "table">("cards");
  let taskComments = $state<NonNullable<PageData["taskComments"]>>([]);
  let commentBody = $state("");
  let commentError = $state("");
  let commentSaving = $state(false);

  $effect(() => {
    taskComments = data.taskComments ?? [];
  });

  async function publishComment(): Promise<void> {
    const body = commentBody.trim();
    if (!body || commentSaving) return;
    commentSaving = true;
    commentError = "";
    try {
      const response = await fetch(
        `/api/tasks/${encodeURIComponent(data.detail.id)}/comments`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!response.ok)
        throw new Error("Não foi possível publicar o comentário.");
      taskComments = [...taskComments, await response.json()];
      commentBody = "";
    } catch (cause) {
      commentError =
        cause instanceof Error
          ? cause.message
          : "Não foi possível publicar o comentário.";
    } finally {
      commentSaving = false;
    }
  }
</script>

<svelte:head><title>{data.detail.title} · Demanda</title></svelte:head>

<div class="record-page">
  <PageHeader
    eyebrow={data.detail.typeLabel}
    title={data.detail.title}
    icon={Icon}
  />

  <section
    class="record-detail"
    aria-label={`Detalhes de ${data.detail.title}`}
  >
    <div class="record-detail__toolbar">
      <a href={data.backHref}
        >← Voltar para {data.detail.typeLabel.toLowerCase()}s</a
      >
      {#if data.detail.archived}
        <span class="record-detail__archived">Registro arquivado</span>
      {/if}
    </div>

    {#if data.contactDashboard}
      <section class="contact-dashboard" aria-label="Central de operação">
        <header class="contact-dashboard__header">
          <div>
            <span>Central de operação</span>
            <h2>O que precisa de atenção agora</h2>
          </div>
          <CalendarClock size={20} aria-hidden="true" />
        </header>

        <div class="contact-dashboard__metrics" aria-label="Resumo operacional">
          <div>
            <strong>{data.contactDashboard.metrics.activeBusinesses}</strong>
            <span>Negócios ativos</span>
          </div>
          <div>
            <strong>{data.contactDashboard.metrics.activeProjects}</strong>
            <span>Projetos em andamento</span>
          </div>
          <div>
            <strong>{data.contactDashboard.metrics.openTasks}</strong>
            <span>Tarefas abertas</span>
          </div>
          <div class:attention={data.contactDashboard.metrics.overdueTasks > 0}>
            <strong>{data.contactDashboard.metrics.overdueTasks}</strong>
            <span>Tarefas vencidas</span>
          </div>
        </div>

        {#if data.contactDashboard.nextAction}
          <a
            class:urgent={data.contactDashboard.nextAction.tone === "urgent"}
            class="contact-dashboard__next-action"
            href={data.contactDashboard.nextAction.href}
          >
            <span>
              <small>Próxima ação</small>
              <strong>{data.contactDashboard.nextAction.title}</strong>
              <em>{data.contactDashboard.nextAction.description}</em>
            </span>
            <ArrowRight size={19} aria-hidden="true" />
          </a>
        {:else if data.contactDashboard.metrics.activeBusinesses === 0}
          <a class="contact-dashboard__next-action" href="/registros/negócios">
            <span>
              <small>Próximo passo recomendado</small>
              <strong>Inicie uma oportunidade comercial</strong>
              <em>Este contato ainda não está vinculado a nenhum negócio.</em>
            </span>
            <ArrowRight size={19} aria-hidden="true" />
          </a>
        {:else}
          <div class="contact-dashboard__quiet-state">
            Não há tarefas com prazo próximo. Use os relacionamentos abaixo para
            planejar a próxima ação.
          </div>
        {/if}

        <div class="contact-dashboard__relations">
          <section>
            <header>
              <span><BriefcaseBusiness size={16} />Negócios</span>
              <a href="/registros/negócios">Ver todos</a>
            </header>
            {#if data.contactDashboard.businesses.length}
              <div class="contact-dashboard__list">
                {#each data.contactDashboard.businesses as business (business.id)}
                  <a href={`/registros/negócios/${business.id}`}>
                    <span>{business.name}</span><small>{business.stage}</small>
                  </a>
                {/each}
              </div>
            {:else}
              <p>Nenhum negócio relacionado.</p>
            {/if}
          </section>

          <section>
            <header>
              <span><FolderKanban size={16} />Projetos</span>
              <a href="/registros/projetos">Ver todos</a>
            </header>
            {#if data.contactDashboard.projects.length}
              <div class="contact-dashboard__list">
                {#each data.contactDashboard.projects as project (project.id)}
                  <a href={`/registros/projetos/${project.id}`}>
                    <span>{project.name}</span>
                    <small
                      >{project.endDate
                        ? `Prazo: ${project.endDate}`
                        : project.status}</small
                    >
                  </a>
                {/each}
              </div>
            {:else}
              <p>Nenhum projeto ativo.</p>
            {/if}
          </section>

          <section>
            <header>
              <span><ListTodo size={16} />Tarefas</span>
              <a href="/registros/tarefas">Ver todas</a>
            </header>
            {#if data.contactDashboard.tasks.length}
              <div class="contact-dashboard__list">
                {#each data.contactDashboard.tasks as task (task.id)}
                  <a href={`/registros/tarefas/${task.id}`}>
                    <span>{task.name}</span>
                    <small
                      >{task.dueDate
                        ? `Prazo: ${task.dueDate}`
                        : task.projectName}</small
                    >
                  </a>
                {/each}
              </div>
            {:else}
              <p>Nenhuma tarefa aberta.</p>
            {/if}
          </section>
        </div>
      </section>
    {/if}

    {#if data.businessDashboard}
      <section class="operations-dashboard" aria-label="Operação do negócio">
        <header class="operations-dashboard__header">
          <div>
            <span>Visão operacional</span>
            <h2>Projetos e execução do cliente</h2>
          </div>
          <div class="view-switcher" aria-label="Modo de visualização">
            <button
              class:active={businessView === "cards"}
              type="button"
              aria-pressed={businessView === "cards"}
              onclick={() => (businessView = "cards")}
              ><LayoutGrid size={16} />Cartões</button
            >
            <button
              class:active={businessView === "table"}
              type="button"
              aria-pressed={businessView === "table"}
              onclick={() => (businessView = "table")}
              ><Table2 size={16} />Tabela</button
            >
          </div>
        </header>

        <div class="operations-dashboard__metrics">
          <div>
            <strong>{data.businessDashboard.metrics.projects}</strong><span
              >Projetos ativos</span
            >
          </div>
          <div>
            <strong>{data.businessDashboard.metrics.openTasks}</strong><span
              >Tarefas abertas</span
            >
          </div>
          <div>
            <strong>{data.businessDashboard.metrics.completedTasks}</strong
            ><span>Tarefas concluídas</span>
          </div>
          <div
            class:attention={data.businessDashboard.metrics.overdueTasks > 0}
          >
            <strong>{data.businessDashboard.metrics.overdueTasks}</strong><span
              >Em atraso</span
            >
          </div>
        </div>

        {#if businessView === "cards"}
          <div class="operations-dashboard__cards">
            <section class="operations-dashboard__panel">
              <header>
                <h3>Projetos em andamento</h3>
                <a href="/registros/projetos">Ver projetos</a>
              </header>
              {#if data.businessDashboard.projects.length}
                <div class="project-operation-cards">
                  {#each data.businessDashboard.projects as project (project.id)}
                    <a href={`/registros/projetos/${project.id}`}>
                      <span>{project.status}</span><strong
                        >{project.name}</strong
                      >
                      <small
                        >{project.openTasks} abertas · {project.completedTasks} concluídas</small
                      >
                      <em
                        >{project.endDate
                          ? `Prazo: ${project.endDate}`
                          : "Sem prazo definido"}</em
                      >
                    </a>
                  {/each}
                </div>
              {:else}<p>Nenhum projeto em andamento.</p>{/if}
            </section>
            <section class="operations-dashboard__panel">
              <header>
                <h3>Fila de trabalho</h3>
                <a href="/registros/tarefas">Ver tarefas</a>
              </header>
              {#if data.businessDashboard.tasks.length}
                <div class="task-operation-list">
                  {#each data.businessDashboard.tasks
                    .filter((task) => !task.completed)
                    .slice(0, 6) as task (task.id)}
                    <a href={`/registros/tarefas/${task.id}`}>
                      <span>{task.name}</span><small
                        >{task.projectName} · {task.dueDate
                          ? `Prazo: ${task.dueDate}`
                          : task.priority}</small
                      >
                    </a>
                  {/each}
                </div>
              {:else}<p>Não há tarefas pendentes.</p>{/if}
            </section>
          </div>
        {:else}
          <div class="operations-table-wrap">
            <table>
              <thead
                ><tr
                  ><th>Tarefa</th><th>Projeto</th><th>Prioridade</th><th
                    >Prazo</th
                  ><th>Status</th></tr
                ></thead
              >
              <tbody>
                {#each data.businessDashboard.tasks as task (task.id)}
                  <tr>
                    <td
                      ><a href={`/registros/tarefas/${task.id}`}>{task.name}</a
                      ></td
                    ><td>{task.projectName}</td><td>{task.priority}</td><td
                      >{task.dueDate ?? "—"}</td
                    ><td>{task.completed ? "Concluída" : task.status}</td>
                  </tr>
                {:else}<tr><td colspan="5">Nenhuma tarefa registrada.</td></tr
                  >{/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {/if}

    {#if data.projectDashboard}
      <section class="operations-dashboard" aria-label="Execução do projeto">
        <header class="operations-dashboard__header">
          <div>
            <span>Execução do projeto</span>
            <h2>Planejamento e entregas</h2>
          </div>
          <a
            class="operations-dashboard__business-link"
            href={`/registros/negócios/${data.projectDashboard.business.id}`}
            >Ver {data.projectDashboard.business.name}</a
          >
        </header>
        <div
          class="operations-dashboard__metrics operations-dashboard__metrics--three"
        >
          <div>
            <strong>{data.projectDashboard.metrics.openTasks}</strong><span
              >Tarefas abertas</span
            >
          </div>
          <div>
            <strong>{data.projectDashboard.metrics.completedTasks}</strong><span
              >Tarefas concluídas</span
            >
          </div>
          <div class:attention={data.projectDashboard.metrics.overdueTasks > 0}>
            <strong>{data.projectDashboard.metrics.overdueTasks}</strong><span
              >Em atraso</span
            >
          </div>
        </div>
        <section class="operations-dashboard__panel">
          <header>
            <h3>Entregas do projeto</h3>
            <a href="/registros/tarefas">Ver todas</a>
          </header>
          <div class="task-operation-list task-operation-list--wide">
            {#each data.projectDashboard.tasks as task (task.id)}
              <a href={`/registros/tarefas/${task.id}`}>
                <span>{task.name}</span><small
                  >{task.completed ? "Concluída" : task.status} · {task.dueDate
                    ? `Prazo: ${task.dueDate}`
                    : "Sem prazo"}</small
                >
              </a>
            {:else}<p>Nenhuma tarefa vinculada a este projeto.</p>{/each}
          </div>
        </section>
      </section>
    {/if}

    {#if data.taskComments}
      <section class="task-comments" aria-label="Comentários da tarefa">
        <header>
          <div>
            <span>Colaboração</span>
            <h2>Comentários</h2>
          </div>
        </header>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void publishComment();
          }}
        >
          <label>
            <span class="sr-only">Adicionar comentário</span>
            <textarea
              bind:value={commentBody}
              maxlength="4000"
              placeholder="Compartilhe uma atualização, dúvida ou instrução…"
            ></textarea>
          </label>
          <div class="task-comments__form-actions">
            {#if commentError}<p role="alert">{commentError}</p>{/if}
            <button
              type="submit"
              disabled={commentSaving || !commentBody.trim()}
              ><Send size={16} />{commentSaving
                ? "Publicando…"
                : "Comentar"}</button
            >
          </div>
        </form>
        <div class="task-comments__list">
          {#each taskComments as comment (comment.id)}
            <article>
              <header>
                <strong>{comment.authorName}</strong><time
                  datetime={comment.createdAt}
                  >{new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(comment.createdAt))}</time
                >
              </header>
              <p>{comment.body}</p>
            </article>
          {:else}<p class="task-comments__empty">
              Ainda não há comentários. Registre o contexto que ajuda a equipe a
              avançar.
            </p>{/each}
        </div>
      </section>
    {/if}

    <article class="record-detail__summary">
      <div>
        <span>Status</span>
        <strong>{data.detail.status}</strong>
      </div>
      <div>
        <span>Atualizado em</span>
        <strong>{data.detail.updatedAt}</strong>
      </div>
    </article>

    <section class="record-detail__section" aria-label="Informações principais">
      <h2>Informações principais</h2>
      <dl class="record-detail__fields">
        {#each data.detail.fields as field (field.label)}
          <div>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        {/each}
      </dl>
    </section>

    {#each data.detail.sections as section (section.title)}
      <section class="record-detail__section" aria-label={section.title}>
        <h2>{section.title}</h2>
        <dl class="record-detail__fields">
          {#each section.fields as field (field.label)}
            <div>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          {/each}
        </dl>
      </section>
    {/each}
  </section>
</div>

<style>
  .record-page {
    display: grid;
    width: min(100%, var(--social-content-width));
    gap: 14px;
    margin-inline: auto;
    padding-bottom: 30px;
  }
  .record-detail {
    display: grid;
    gap: 14px;
  }
  .record-detail__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .record-detail__toolbar a {
    color: var(--brand-600);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .record-detail__toolbar a:hover {
    text-decoration: underline;
  }
  .record-detail__archived {
    padding: 5px 9px;
    border-radius: var(--radius-pill);
    color: var(--ink-600);
    background: var(--surface-hover);
    font-size: var(--text-xs);
    font-weight: 700;
  }
  .record-detail__summary,
  .record-detail__section {
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }
  .contact-dashboard {
    display: grid;
    gap: 14px;
    padding: 18px;
    border: 1px solid color-mix(in srgb, var(--brand-500) 28%, var(--border));
    border-radius: var(--radius-xl);
    background:
      linear-gradient(135deg, rgba(46, 86, 255, 0.08), transparent 52%),
      var(--panel);
  }
  .contact-dashboard__header,
  .contact-dashboard__header > div,
  .contact-dashboard__relations section > header,
  .contact-dashboard__relations section > header span {
    display: flex;
    align-items: center;
  }
  .contact-dashboard__header {
    justify-content: space-between;
    gap: 12px;
  }
  .contact-dashboard__header > div {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }
  .contact-dashboard__header > div > span,
  .contact-dashboard__next-action small {
    color: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .contact-dashboard__header > :global(svg) {
    color: var(--brand-600);
  }
  .contact-dashboard__header h2 {
    margin: 0;
  }
  .contact-dashboard__metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--panel);
  }
  .contact-dashboard__metrics div {
    display: grid;
    gap: 2px;
    padding: 13px;
  }
  .contact-dashboard__metrics div + div {
    border-left: 1px solid var(--border);
  }
  .contact-dashboard__metrics strong {
    color: var(--text);
    font-size: var(--text-xl);
  }
  .contact-dashboard__metrics span {
    color: var(--muted);
    font-size: var(--text-xs);
  }
  .contact-dashboard__metrics .attention strong {
    color: var(--red-500);
  }
  .contact-dashboard__next-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px;
    border: 1px solid color-mix(in srgb, var(--brand-500) 32%, var(--border));
    border-radius: var(--radius-lg);
    color: var(--text);
    background: color-mix(in srgb, var(--brand-50) 62%, var(--panel));
  }
  .contact-dashboard__next-action:hover {
    border-color: var(--brand-500);
  }
  .contact-dashboard__next-action > span {
    display: grid;
    gap: 3px;
  }
  .contact-dashboard__next-action strong {
    font-size: var(--text-md);
  }
  .contact-dashboard__next-action em {
    color: var(--muted);
    font-size: var(--text-sm);
    font-style: normal;
  }
  .contact-dashboard__next-action > :global(svg) {
    flex: 0 0 auto;
    color: var(--brand-600);
  }
  .contact-dashboard__next-action.urgent {
    border-color: color-mix(in srgb, var(--red-500) 45%, var(--border));
    background: color-mix(in srgb, var(--red-500) 7%, var(--panel));
  }
  .contact-dashboard__next-action.urgent small,
  .contact-dashboard__next-action.urgent > :global(svg) {
    color: var(--red-500);
  }
  .contact-dashboard__quiet-state {
    padding: 13px;
    border-radius: var(--radius-lg);
    color: var(--muted);
    background: var(--canvas);
    font-size: var(--text-sm);
  }
  .contact-dashboard__relations {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .contact-dashboard__relations section {
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--panel);
  }
  .contact-dashboard__relations section > header {
    justify-content: space-between;
    gap: 8px;
  }
  .contact-dashboard__relations section > header span {
    min-width: 0;
    gap: 6px;
    color: var(--text);
    font-size: var(--text-sm);
    font-weight: 700;
  }
  .contact-dashboard__relations section > header :global(svg) {
    color: var(--brand-600);
  }
  .contact-dashboard__relations section > header a {
    color: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 700;
  }
  .contact-dashboard__relations section > p {
    margin-top: 12px;
    color: var(--muted);
    font-size: var(--text-xs);
  }
  .contact-dashboard__list {
    display: grid;
    gap: 4px;
    margin-top: 10px;
  }
  .contact-dashboard__list a {
    display: grid;
    gap: 3px;
    padding: 8px;
    border-radius: var(--radius-md);
  }
  .contact-dashboard__list a:hover {
    background: var(--brand-50);
  }
  .contact-dashboard__list span,
  .contact-dashboard__list small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .operations-dashboard {
    display: grid;
    gap: 14px;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }
  .operations-dashboard__header,
  .operations-dashboard__header > div,
  .operations-dashboard__panel > header,
  .view-switcher {
    display: flex;
    align-items: center;
  }
  .operations-dashboard__header {
    justify-content: space-between;
    gap: 14px;
  }
  .operations-dashboard__header > div:first-child {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }
  .operations-dashboard__header > div:first-child > span {
    color: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .operations-dashboard__header h2 {
    margin: 0;
  }
  .operations-dashboard__business-link {
    max-width: 38%;
    overflow: hidden;
    color: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .view-switcher {
    gap: 4px;
    padding: 3px;
    border-radius: var(--radius-md);
    background: var(--canvas);
  }
  .view-switcher button {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    color: var(--muted);
    background: transparent;
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 700;
  }
  .view-switcher button.active {
    color: var(--brand-600);
    background: var(--panel);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
  }
  .operations-dashboard__metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  .operations-dashboard__metrics--three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .operations-dashboard__metrics div {
    display: grid;
    gap: 2px;
    padding: 13px;
    background: var(--canvas);
  }
  .operations-dashboard__metrics div + div {
    border-left: 1px solid var(--border);
  }
  .operations-dashboard__metrics strong {
    color: var(--text);
    font-size: var(--text-xl);
  }
  .operations-dashboard__metrics span {
    color: var(--muted);
    font-size: var(--text-xs);
  }
  .operations-dashboard__metrics .attention strong {
    color: var(--red-500);
  }
  .operations-dashboard__cards {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
    gap: 12px;
  }
  .operations-dashboard__panel {
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--canvas);
  }
  .operations-dashboard__panel > header {
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }
  .operations-dashboard__panel h3 {
    color: var(--text);
    font-size: var(--text-md);
  }
  .operations-dashboard__panel > header a {
    color: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 700;
  }
  .operations-dashboard__panel > p,
  .task-operation-list > p {
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .project-operation-cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .project-operation-cards a {
    display: grid;
    min-width: 0;
    gap: 5px;
    padding: 11px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--panel);
  }
  .project-operation-cards a:hover,
  .task-operation-list a:hover {
    border-color: var(--brand-500);
    background: var(--brand-50);
  }
  .project-operation-cards span {
    color: var(--brand-600);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .project-operation-cards strong,
  .task-operation-list span {
    overflow: hidden;
    color: var(--text);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-operation-cards small,
  .project-operation-cards em,
  .task-operation-list small {
    overflow: hidden;
    color: var(--muted);
    font-size: var(--text-xs);
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .task-operation-list {
    display: grid;
    gap: 5px;
  }
  .task-operation-list a {
    display: grid;
    gap: 3px;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
  }
  .operations-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    color: var(--text-soft);
    font-size: var(--text-sm);
  }
  th,
  td {
    padding: 11px 12px;
    border-bottom: 1px solid var(--border);
    text-align: left;
    white-space: nowrap;
  }
  th {
    color: var(--muted);
    background: var(--canvas);
    font-size: var(--text-xs);
  }
  tr:last-child td {
    border-bottom: 0;
  }
  td a {
    color: var(--brand-600);
    font-weight: 700;
  }
  .task-comments {
    display: grid;
    gap: 13px;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }
  .task-comments > header > div {
    display: grid;
    gap: 3px;
  }
  .task-comments > header span {
    color: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .task-comments h2 {
    margin: 0;
  }
  .task-comments form {
    display: grid;
    gap: 8px;
  }
  .task-comments textarea {
    width: 100%;
    min-height: 88px;
    padding: 11px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    outline: 0;
    color: var(--text);
    background: var(--canvas);
    font: inherit;
    font-size: var(--text-sm);
    line-height: 1.45;
    resize: vertical;
  }
  .task-comments textarea:focus {
    border-color: var(--brand-500);
    box-shadow: var(--focus-ring);
  }
  .task-comments__form-actions {
    display: flex;
    min-height: 32px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .task-comments__form-actions p {
    color: var(--red-500);
    font-size: var(--text-xs);
  }
  .task-comments__form-actions button {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    padding: 0 11px;
    border: 0;
    border-radius: 9px;
    color: white;
    background: var(--brand-600);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 700;
  }
  .task-comments__form-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  .task-comments__list {
    display: grid;
    gap: 8px;
  }
  .task-comments__list article {
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--canvas);
  }
  .task-comments__list article header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .task-comments__list strong {
    color: var(--text);
    font-size: var(--text-sm);
  }
  .task-comments__list time {
    color: var(--muted);
    font-size: var(--text-xs);
  }
  .task-comments__list article p {
    margin-top: 7px;
    color: var(--text-soft);
    font-size: var(--text-sm);
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .task-comments__empty {
    padding: 12px;
    border-radius: var(--radius-md);
    color: var(--muted);
    background: var(--canvas);
    font-size: var(--text-sm);
  }
  .contact-dashboard__list span {
    color: var(--text-soft);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .contact-dashboard__list small {
    color: var(--muted);
    font-size: var(--text-xs);
  }
  .record-detail__summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .record-detail__summary div {
    display: grid;
    gap: 4px;
    padding: 16px 18px;
  }
  .record-detail__summary div + div {
    border-left: 1px solid var(--border);
  }
  .record-detail__summary span,
  dt {
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .record-detail__summary strong {
    color: var(--text);
    font-size: var(--text-md);
  }
  .record-detail__section {
    padding: 18px;
  }
  h2 {
    margin-bottom: 14px;
    color: var(--text);
    font-size: var(--text-lg);
  }
  .record-detail__fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .record-detail__fields div {
    min-width: 0;
    padding: 12px;
    border-radius: var(--radius-md);
    background: var(--canvas);
  }
  dd {
    margin: 5px 0 0;
    overflow-wrap: anywhere;
    color: var(--text);
    font-size: var(--text-sm);
    line-height: 1.5;
    white-space: pre-wrap;
  }
  @media (max-width: 640px) {
    .record-detail__summary,
    .record-detail__fields {
      grid-template-columns: 1fr;
    }
    .record-detail__summary div + div {
      border-top: 1px solid var(--border);
      border-left: 0;
    }
    .contact-dashboard__metrics,
    .contact-dashboard__relations,
    .operations-dashboard__metrics,
    .operations-dashboard__metrics--three,
    .operations-dashboard__cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .contact-dashboard__metrics div:nth-child(3) {
      border-left: 0;
      border-top: 1px solid var(--border);
    }
    .contact-dashboard__metrics div:nth-child(4) {
      border-top: 1px solid var(--border);
    }
    .operations-dashboard__metrics div:nth-child(3) {
      border-left: 0;
      border-top: 1px solid var(--border);
    }
    .operations-dashboard__metrics div:nth-child(4) {
      border-top: 1px solid var(--border);
    }
    .operations-dashboard__metrics--three div:nth-child(3) {
      border-left: 0;
    }
  }
</style>
