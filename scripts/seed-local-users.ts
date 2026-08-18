import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pg from "pg";
import { parseServerEnvironment } from "../src/lib/server/config/env-schema";
import { defaultWorkspaceSettings } from "../src/lib/settings/defaults";

type SeedUser = {
  id: string;
  username: string;
};

type PersonalWorkspace = {
  id: string;
  name: string;
};

type SeedTotals = {
  users: number;
  workspaces: number;
  contacts: number;
  clients: number;
  businesses: number;
  services: number;
  deliveries: number;
  deliverySubtasks: number;
  projects: number;
  tasks: number;
  subtasks: number;
};

type ContactSeed = {
  name: string;
  profession: string;
};

type BusinessSeed = {
  name: string;
  categoryKey: string;
  stageKey: string;
};

type ServiceSeed = {
  name: string;
  description: string;
  icon: string;
  color: string;
  statusKey: string;
  durationDays: number;
  amountCents: number;
};

type DeliverySeed = {
  name: string;
  description: string;
  categoryKey: string;
  priorityKey: string;
  durationMinutes: number;
  subtasks: readonly string[];
};

type ProjectSeed = {
  name: string;
  statusKey: string;
  durationDays: number;
};

const SEED_PREFIX = "Seed ·";

const contactSeeds: readonly ContactSeed[] = [
  { name: "Ana Martins", profession: "Diretora de marketing" },
  { name: "Bruno Almeida", profession: "Empreendedor" },
  { name: "Camila Rocha", profession: "Gerente de produto" },
  { name: "Daniel Freitas", profession: "Coordenador comercial" },
  { name: "Elisa Gomes", profession: "Fundadora" },
];

const businessSeeds: readonly BusinessSeed[] = [
  { name: "Aurora Café", categoryKey: "negocio", stageKey: "ativo" },
  {
    name: "Norte Arquitetura",
    categoryKey: "negocio",
    stageKey: "negociacao",
  },
  {
    name: "Viva Saúde",
    categoryKey: "negocio",
    stageKey: "contratacao",
  },
  {
    name: "Solaris Energia",
    categoryKey: "negocio",
    stageKey: "ativo",
  },
  {
    name: "Lume Estúdio",
    categoryKey: "marca_pessoal",
    stageKey: "ativo",
  },
];

const serviceSeeds: readonly ServiceSeed[] = [
  {
    name: "Estratégia de marca",
    description: "Diagnóstico, posicionamento e plano estratégico de marca.",
    icon: "compass",
    color: "blue",
    statusKey: "planejamento",
    durationDays: 20,
    amountCents: 480_000,
  },
  {
    name: "Identidade visual",
    description: "Criação do sistema visual e de suas principais aplicações.",
    icon: "palette",
    color: "violet",
    statusKey: "execucao",
    durationDays: 30,
    amountCents: 720_000,
  },
  {
    name: "Gestão de conteúdo",
    description: "Planejamento e produção recorrente para canais digitais.",
    icon: "messages-square",
    color: "pink",
    statusKey: "execucao",
    durationDays: 30,
    amountCents: 390_000,
  },
  {
    name: "Landing page",
    description: "Conteúdo, interface e publicação de página de conversão.",
    icon: "panels-top-left",
    color: "cyan",
    statusKey: "planejamento",
    durationDays: 18,
    amountCents: 560_000,
  },
];

const deliverySeeds: readonly DeliverySeed[] = [
  {
    name: "Diagnóstico e oportunidades",
    description: "Levantamento do cenário e priorização das oportunidades.",
    categoryKey: "planejamento",
    priorityKey: "alta",
    durationMinutes: 180,
    subtasks: ["Reunir informações", "Consolidar oportunidades"],
  },
  {
    name: "Apresentação executiva",
    description: "Síntese visual das decisões e dos próximos passos.",
    categoryKey: "criacao",
    priorityKey: "normal",
    durationMinutes: 180,
    subtasks: ["Estruturar narrativa", "Diagramar apresentação"],
  },
];

const projectSeeds: readonly ProjectSeed[] = [
  {
    name: "Reposicionamento de marca",
    statusKey: "planejamento",
    durationDays: 28,
  },
  { name: "Campanha de lançamento", statusKey: "execucao", durationDays: 35 },
  { name: "Presença digital", statusKey: "alteracao", durationDays: 24 },
  { name: "Plano de crescimento", statusKey: "execucao", durationDays: 42 },
];

const taskNames = [
  "Receber briefing",
  "Realizar pesquisa",
  "Produzir materiais",
  "Enviar para aprovação",
] as const;

const catalogDefinitions = [
  ["personStatuses", "person_status"],
  ["businessStatuses", "business_status"],
  ["projectStatuses", "project_status"],
  ["taskStatuses", "task_status"],
  ["businessCategories", "business_category"],
  ["taskCategories", "task_category"],
  ["taskPriorities", "task_priority"],
  ["revenueCategories", "revenue_category"],
  ["expenseCategories", "expense_category"],
] as const;

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function seedName(name: string): string {
  return `${SEED_PREFIX} ${name}`;
}

function emailUsername(username: string): string {
  const normalized = username
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized || "usuario";
}

async function ensurePersonalWorkspace(
  client: PoolClient,
  user: SeedUser,
): Promise<PersonalWorkspace> {
  const existing = await client.query<PersonalWorkspace>(
    `select id, name
       from app.workspaces
      where owner_user_id = $1
        and kind = 'personal'
        and archived_at is null
      limit 1`,
    [user.id],
  );

  let workspace = existing.rows[0];
  if (!workspace) {
    const created = await client.query<PersonalWorkspace>(
      `insert into app.workspaces (
         name, description, icon, color, kind, owner_user_id
       ) values (
         'Pessoal', 'Seus projetos e tarefas particulares.', 'house', 'blue',
         'personal', $1
       )
       returning id, name`,
      [user.id],
    );
    workspace = created.rows[0];
  }
  if (!workspace) {
    throw new Error(`Não foi possível obter o workspace de @${user.username}.`);
  }

  await client.query(
    `insert into app.workspace_members (workspace_id, user_id, role)
     values ($1, $2, 'owner')
     on conflict (workspace_id, user_id) do update set role = 'owner'`,
    [workspace.id, user.id],
  );
  await client.query(
    `insert into app.workspace_configurations (workspace_id)
     values ($1)
     on conflict (workspace_id) do nothing`,
    [workspace.id],
  );

  const catalogCount = await client.query<{ total: number }>(
    `select count(*)::int total
       from app.workspace_catalog_entries
      where workspace_id = $1`,
    [workspace.id],
  );
  if (catalogCount.rows[0]?.total === 0) {
    const settings = defaultWorkspaceSettings();
    for (const [field, kind] of catalogDefinitions) {
      for (const [sortOrder, item] of settings[field].entries()) {
        await client.query(
          `insert into app.workspace_catalog_entries (
             id, workspace_id, kind, key, label, icon, color, sort_order, locked
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, true)
           on conflict do nothing`,
          [
            randomUUID(),
            workspace.id,
            kind,
            item.key,
            item.label,
            item.icon ?? null,
            item.color ?? null,
            sortOrder,
          ],
        );
      }
    }
  }

  return workspace;
}

async function ensureContacts(
  client: PoolClient,
  user: SeedUser,
  workspace: PersonalWorkspace,
  userIndex: number,
): Promise<string[]> {
  const ids: string[] = [];
  const username = emailUsername(user.username);

  for (const [index, definition] of contactSeeds.entries()) {
    const name = seedName(definition.name);
    const existing = await client.query<{ id: string }>(
      `select id
         from app.contacts
        where workspace_id = $1
          and owner_user_id = $2
          and name = $3
          and archived_at is null
        limit 1`,
      [workspace.id, user.id, name],
    );
    let id = existing.rows[0]?.id;
    if (!id) {
      const created = await client.query<{ id: string }>(
        `insert into app.contacts (
           workspace_id, owner_user_id, name, contact_type, status, profession
         ) values ($1, $2, $3, 'person', 'active', $4)
         returning id`,
        [workspace.id, user.id, name, definition.profession],
      );
      id = created.rows[0]!.id;
    }

    const phoneSuffix = String(10_000_000 + userIndex * 100 + index).slice(-8);
    await client.query(
      `insert into app.contact_phones (
         workspace_id, contact_id, type, number, is_primary
       )
       select $1, $2, 'whatsapp', $3, true
       where not exists (
         select 1 from app.contact_phones
          where workspace_id = $1 and contact_id = $2
       )`,
      [workspace.id, id, `+55859${phoneSuffix}`],
    );
    await client.query(
      `insert into app.contact_emails (
         workspace_id, contact_id, type, address, is_primary
       )
       select $1, $2, 'work', $3, true
       where not exists (
         select 1 from app.contact_emails
          where workspace_id = $1 and contact_id = $2
       )`,
      [workspace.id, id, `cliente-${index + 1}-${username}@seed.demanda.local`],
    );
    ids.push(id);
  }
  return ids;
}

async function ensureBusinesses(
  client: PoolClient,
  user: SeedUser,
  workspace: PersonalWorkspace,
  contactIds: string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const [index, definition] of businessSeeds.entries()) {
    const name = seedName(definition.name);
    const existing = await client.query<{ id: string }>(
      `select id
         from app.businesses
        where workspace_id = $1
          and owner_user_id = $2
          and name = $3
          and archived_at is null
        limit 1`,
      [workspace.id, user.id, name],
    );
    let id = existing.rows[0]?.id;
    if (!id) {
      const created = await client.query<{ id: string }>(
        `insert into app.businesses (
           workspace_id, owner_user_id, name, category_key, stage_key
         ) values ($1, $2, $3, $4, $5)
         returning id`,
        [
          workspace.id,
          user.id,
          name,
          definition.categoryKey,
          definition.stageKey,
        ],
      );
      id = created.rows[0]!.id;
    }

    await client.query(
      `insert into app.business_responsibles (
         workspace_id, business_id, contact_id, sort_order
       ) values ($1, $2, $3, 0)
       on conflict do nothing`,
      [workspace.id, id, contactIds[index]!],
    );
    const note = "Cliente criado pelo seed local para demonstração.";
    await client.query(
      `insert into app.business_notes (
         workspace_id, business_id, body, sort_order
       )
       select $1, $2, $3, 0
       where not exists (
         select 1 from app.business_notes
          where workspace_id = $1
            and business_id = $2
            and body = $3
            and archived_at is null
       )`,
      [workspace.id, id, note],
    );
    ids.push(id);
  }
  return ids;
}

async function ensureServices(
  client: PoolClient,
  user: SeedUser,
  workspace: PersonalWorkspace,
): Promise<string[]> {
  const ids: string[] = [];
  for (const [index, definition] of serviceSeeds.entries()) {
    const name = seedName(definition.name);
    const existing = await client.query<{ id: string }>(
      `select id
         from app.services
        where workspace_id = $1 and name = $2 and archived_at is null
        limit 1`,
      [workspace.id, name],
    );
    let id = existing.rows[0]?.id;
    if (!id) {
      const created = await client.query<{ id: string }>(
        `insert into app.services (
           workspace_id, name, description, default_briefing, icon, color,
           default_status_key, default_duration_days, default_contract_type,
           default_amount_cents, default_installment_count,
           default_payment_method, default_payment_terms, default_finance_notes,
           sort_order
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8, 'one_off', $9, 2,
           'Pix', '50% na entrada e 50% na entrega.',
           'Valores e condições de demonstração.', $10
         )
         returning id`,
        [
          workspace.id,
          name,
          definition.description,
          `${definition.description} Validar escopo e aprovações antes do início.`,
          definition.icon,
          definition.color,
          definition.statusKey,
          definition.durationDays,
          definition.amountCents,
          index,
        ],
      );
      id = created.rows[0]!.id;
    }
    await client.query(
      `insert into app.service_responsibles (
         workspace_id, service_id, user_id, sort_order
       ) values ($1, $2, $3, 0)
       on conflict do nothing`,
      [workspace.id, id, user.id],
    );
    ids.push(id);
  }
  return ids;
}

async function ensureDeliveries(
  client: PoolClient,
  user: SeedUser,
  workspace: PersonalWorkspace,
  serviceIds: string[],
): Promise<number> {
  let deliveryCount = 0;
  for (const [serviceIndex, serviceId] of serviceIds.entries()) {
    for (const [deliveryIndex, definition] of deliverySeeds.entries()) {
      const name = seedName(`${definition.name} ${serviceIndex + 1}`);
      const existing = await client.query<{ id: string }>(
        `select id
           from app.delivery_templates
          where workspace_id = $1 and name = $2 and archived_at is null
          limit 1`,
        [workspace.id, name],
      );
      let id = existing.rows[0]?.id;
      if (!id) {
        const created = await client.query<{ id: string }>(
          `insert into app.delivery_templates (
             workspace_id, service_id, name, description, category_key,
             default_status_key, default_priority_key,
             default_duration_minutes, sort_order
           ) values ($1, $2, $3, $4, $5, 'planejamento', $6, $7, $8)
           returning id`,
          [
            workspace.id,
            serviceId,
            name,
            definition.description,
            definition.categoryKey,
            definition.priorityKey,
            definition.durationMinutes,
            serviceIndex * deliverySeeds.length + deliveryIndex,
          ],
        );
        id = created.rows[0]!.id;
      }
      await client.query(
        `insert into app.delivery_template_responsibles (
           workspace_id, delivery_template_id, user_id, sort_order
         ) values ($1, $2, $3, 0)
         on conflict do nothing`,
        [workspace.id, id, user.id],
      );
      for (const [subtaskIndex, subtask] of definition.subtasks.entries()) {
        await client.query(
          `insert into app.delivery_template_subtasks (
             workspace_id, delivery_template_id, name, duration_minutes,
             default_status_key, sort_order
           )
           select $1, $2, $3::text, 90, 'pendente', $4
           where not exists (
             select 1 from app.delivery_template_subtasks
              where workspace_id = $1
                and delivery_template_id = $2
                and name = $3::text
           )`,
          [workspace.id, id, subtask, subtaskIndex],
        );
      }
      deliveryCount += 1;
    }
  }
  return deliveryCount;
}

async function ensureProjectsAndTasks(
  client: PoolClient,
  user: SeedUser,
  workspace: PersonalWorkspace,
  businessIds: string[],
  serviceIds: string[],
): Promise<{ projects: number; tasks: number; subtasks: number }> {
  let taskCount = 0;
  let subtaskCount = 0;

  for (const [projectIndex, definition] of projectSeeds.entries()) {
    const name = seedName(definition.name);
    const businessId = businessIds[projectIndex % businessIds.length]!;
    const serviceId = serviceIds[projectIndex % serviceIds.length]!;
    const existing = await client.query<{ id: string }>(
      `select id
         from app.projects
        where workspace_id = $1 and name = $2 and archived_at is null
        limit 1`,
      [workspace.id, name],
    );
    let projectId = existing.rows[0]?.id;
    if (!projectId) {
      const created = await client.query<{ id: string }>(
        `insert into app.projects (
           workspace_id, business_id, source_service_id, name, status_key,
           briefing, start_date, end_date, contract_type, amount_cents,
           first_due_date, payment_method, payment_terms, finance_notes
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8, 'one_off', $9, $10, 'Pix',
           'Duas parcelas iguais.', 'Contrato de demonstração do seed local.'
         )
         returning id`,
        [
          workspace.id,
          businessId,
          serviceId,
          name,
          definition.statusKey,
          `Briefing de demonstração para ${definition.name.toLowerCase()}.`,
          isoDate(-projectIndex * 3),
          isoDate(definition.durationDays),
          420_000 + projectIndex * 115_000,
          isoDate(7 + projectIndex * 3),
        ],
      );
      projectId = created.rows[0]!.id;
    }

    await client.query(
      `insert into app.project_services (
         workspace_id, project_id, service_id, sort_order
       ) values ($1, $2, $3, 0)
       on conflict do nothing`,
      [workspace.id, projectId, serviceId],
    );
    await client.query(
      `insert into app.project_responsibles (
         workspace_id, project_id, user_id, sort_order
       ) values ($1, $2, $3, 0)
       on conflict do nothing`,
      [workspace.id, projectId, user.id],
    );

    for (const [taskIndex, taskName] of taskNames.entries()) {
      const name = seedName(taskName);
      const existingTask = await client.query<{ id: string }>(
        `select id
           from app.tasks
          where workspace_id = $1
            and project_id = $2
            and name = $3
            and archived_at is null
          limit 1`,
        [workspace.id, projectId, name],
      );
      let taskId = existingTask.rows[0]?.id;
      if (!taskId) {
        const createdTask = await client.query<{ id: string }>(
          `insert into app.tasks (
             workspace_id, project_id, business_id, name, description,
             category_key, priority_key, status_key, due_date, sort_order,
             board_order
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
           returning id`,
          [
            workspace.id,
            projectId,
            businessId,
            name,
            `Etapa de demonstração do projeto ${definition.name}.`,
            ["reuniao", "planejamento", "criacao", "veiculacao"][taskIndex],
            ["normal", "alta", "emergente", "urgente"][taskIndex],
            ["planejamento", "fila", "producao", "fila"][taskIndex],
            isoDate(3 + projectIndex * 7 + taskIndex * 2),
            taskIndex,
            JSON.stringify({
              status: taskIndex,
              priority: taskIndex,
              business: taskIndex,
              project: taskIndex,
            }),
          ],
        );
        taskId = createdTask.rows[0]!.id;
      }
      await client.query(
        `insert into app.task_responsibles (
           workspace_id, task_id, user_id, sort_order
         ) values ($1, $2, $3, 0)
         on conflict do nothing`,
        [workspace.id, taskId, user.id],
      );

      for (const [subtaskIndex, subtaskName] of [
        "Executar etapa",
        "Revisar etapa",
      ].entries()) {
        await client.query(
          `insert into app.task_subtasks (
             workspace_id, task_id, name, duration_minutes, status_key,
             sort_order
           )
           select $1, $2, $3::text, 60, 'pendente', $4
           where not exists (
             select 1 from app.task_subtasks
              where workspace_id = $1
                and task_id = $2
                and name = $3::text
                and archived_at is null
           )`,
          [workspace.id, taskId, seedName(subtaskName), subtaskIndex],
        );
        subtaskCount += 1;
      }
      taskCount += 1;
    }
  }

  return {
    projects: projectSeeds.length,
    tasks: taskCount,
    subtasks: subtaskCount,
  };
}

async function assertSeededUser(
  client: PoolClient,
  user: SeedUser,
  workspace: PersonalWorkspace,
): Promise<void> {
  const result = await client.query<{
    contacts: number;
    businesses: number;
    services: number;
    deliveries: number;
    projects: number;
    tasks: number;
    subtasks: number;
  }>(
    `select
       (select count(*)::int from app.contacts
         where workspace_id = $1 and owner_user_id = $2
           and name like $3::text and archived_at is null) contacts,
       (select count(*)::int from app.businesses
         where workspace_id = $1 and owner_user_id = $2
           and name like $3::text and archived_at is null) businesses,
       (select count(*)::int from app.services
         where workspace_id = $1 and name like $3::text and archived_at is null) services,
       (select count(*)::int from app.delivery_templates
         where workspace_id = $1 and name like $3::text and archived_at is null) deliveries,
       (select count(*)::int from app.projects
         where workspace_id = $1 and name like $3::text and archived_at is null) projects,
       (select count(*)::int from app.tasks
         where workspace_id = $1 and name like $3::text and archived_at is null) tasks,
       (select count(*)::int from app.task_subtasks
         where workspace_id = $1 and name like $3::text and archived_at is null) subtasks`,
    [workspace.id, user.id, `${SEED_PREFIX}%`],
  );
  const counts = result.rows[0];
  if (
    !counts ||
    counts.contacts < contactSeeds.length ||
    counts.businesses < businessSeeds.length ||
    counts.services < serviceSeeds.length ||
    counts.deliveries < serviceSeeds.length * deliverySeeds.length ||
    counts.projects < projectSeeds.length ||
    counts.tasks < projectSeeds.length * taskNames.length ||
    counts.subtasks < projectSeeds.length * taskNames.length * 2
  ) {
    throw new Error(`O seed de @${user.username} ficou incompleto.`);
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("O seed local não pode rodar em produção.");
  }

  const environment = parseServerEnvironment(process.env);
  const pool = new pg.Pool({
    connectionString: environment.DATABASE_URL,
    max: environment.DATABASE_POOL_MAX,
    connectionTimeoutMillis: environment.DATABASE_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: environment.DATABASE_IDLE_TIMEOUT_MS,
  });
  const client = await pool.connect();
  let currentStage = "inicialização";

  try {
    currentStage = "abertura da transação";
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [2026081701]);
    currentStage = "leitura dos usuários";
    const users = await client.query<SeedUser>(
      `select id, username
         from app.users
        where deleted_at is null
        order by lower(username)`,
    );
    if (users.rows.length === 0) {
      throw new Error("Nenhum usuário ativo foi encontrado no banco local.");
    }

    const totals: SeedTotals = {
      users: users.rows.length,
      workspaces: 0,
      contacts: 0,
      clients: 0,
      businesses: 0,
      services: 0,
      deliveries: 0,
      deliverySubtasks: 0,
      projects: 0,
      tasks: 0,
      subtasks: 0,
    };

    for (const [userIndex, user] of users.rows.entries()) {
      currentStage = `workspace de @${user.username}`;
      const workspace = await ensurePersonalWorkspace(client, user);
      currentStage = `contatos de @${user.username}`;
      const contactIds = await ensureContacts(
        client,
        user,
        workspace,
        userIndex,
      );
      currentStage = `negócios de @${user.username}`;
      const businessIds = await ensureBusinesses(
        client,
        user,
        workspace,
        contactIds,
      );
      currentStage = `serviços de @${user.username}`;
      const serviceIds = await ensureServices(client, user, workspace);
      currentStage = `entregas de @${user.username}`;
      const deliveries = await ensureDeliveries(
        client,
        user,
        workspace,
        serviceIds,
      );
      currentStage = `projetos e tarefas de @${user.username}`;
      const projectTotals = await ensureProjectsAndTasks(
        client,
        user,
        workspace,
        businessIds,
        serviceIds,
      );
      currentStage = `verificação de @${user.username}`;
      await assertSeededUser(client, user, workspace);

      totals.workspaces += 1;
      totals.contacts += contactIds.length;
      totals.clients += businessIds.length;
      totals.businesses += businessIds.length;
      totals.services += serviceIds.length;
      totals.deliveries += deliveries;
      totals.deliverySubtasks += deliveries * 2;
      totals.projects += projectTotals.projects;
      totals.tasks += projectTotals.tasks;
      totals.subtasks += projectTotals.subtasks;
    }

    currentStage = "commit";
    await client.query("commit");
    console.log(
      [
        "Seed local aplicado com sucesso:",
        `- usuários: ${totals.users}`,
        `- workspaces pessoais: ${totals.workspaces}`,
        `- contatos: ${totals.contacts}`,
        `- clientes: ${totals.clients} (negócios com contato responsável)`,
        `- negócios: ${totals.businesses}`,
        `- serviços: ${totals.services}`,
        `- entregas: ${totals.deliveries}`,
        `- subtarefas de entrega: ${totals.deliverySubtasks}`,
        `- projetos: ${totals.projects}`,
        `- tarefas: ${totals.tasks}`,
        `- subtarefas: ${totals.subtasks}`,
      ].join("\n"),
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    const message =
      error instanceof Error ? error.message : "Erro desconhecido";
    throw new Error(`${currentStage}: ${message}`, { cause: error });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error(`[database] Falha ao aplicar seed local: ${message}`);
  process.exitCode = 1;
});
