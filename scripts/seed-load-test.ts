import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import pg from "pg";
import {
  AVATAR_COLORS,
  AVATAR_OPTIONS,
  avatarProfileUrl,
} from "../src/lib/avatar/avatar-options";
import { hashPassword, verifyPassword } from "../src/lib/server/auth/password";
import { parseServerEnvironment } from "../src/lib/server/config/env-schema";
import { defaultWorkspaceSettings } from "../src/lib/settings/defaults";
import {
  materializeProjectContracts,
  seedManualUserFinances,
  type PersonalFinanceSeedProfile,
} from "./seed-finance-data";
import { seedUserOfferings } from "./seed-user-offerings";

const DEVELOPMENT_PASSWORD = "Teste@123";
const PROJECT_COUNTS_BY_WORKSPACE = [5, 6, 7, 5, 6, 8, 10] as const;
const USER_VOLUMES = [
  {
    contacts: 5,
    businesses: 15,
    services: 5,
    deliveries: 15,
    personalTasks: 5,
    manualFinances: 12,
    manualRevenues: 7,
    manualExpenses: 5,
  },
  {
    contacts: 7,
    businesses: 17,
    services: 7,
    deliveries: 17,
    personalTasks: 7,
    manualFinances: 15,
    manualRevenues: 8,
    manualExpenses: 7,
  },
  {
    contacts: 9,
    businesses: 19,
    services: 9,
    deliveries: 19,
    personalTasks: 9,
    manualFinances: 18,
    manualRevenues: 10,
    manualExpenses: 8,
  },
] as const;

type Row = Record<string, unknown>;
type SeedUser = {
  id: string;
  username: string;
  name: string;
  email: string;
};
type WorkspaceSeed = {
  id: string;
  name: string;
  kind: "personal" | "shared";
  owner: SeedUser;
  members: SeedUser[];
  projectCount: number;
};
type PrivateUserData = {
  contacts: Array<{ id: string; workspace_id: string }>;
  businesses: Array<{ id: string; workspace_id: string }>;
};

const accounts = [
  {
    username: "teste1",
    name: "teste1",
    email: "jt.thiagosantos@gmail.com",
  },
  {
    username: "teste2",
    name: "teste2",
    email: "thiagodochess@gmail.com",
  },
  {
    username: "teste3",
    name: "teste3",
    email: "thiagocriolo97@gmail.com",
  },
] as const;

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const replacement = randomInt(index + 1);
    [result[index], result[replacement]] = [
      result[replacement]!,
      result[index]!,
    ];
  }
  return result;
}

function randomDistinctAvatarUrls(total: number): string[] {
  const avatars = shuffled(AVATAR_OPTIONS).slice(0, total);
  const colors = shuffled(AVATAR_COLORS).slice(0, total);
  return avatars.map((avatar, index) =>
    avatarProfileUrl(avatar.id, colors[index]!),
  );
}

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

const contactFirstNames = [
  "Ana",
  "Bruno",
  "Camila",
  "Daniel",
  "Elisa",
  "Felipe",
  "Gabriela",
  "Helena",
  "Igor",
  "Joana",
];
const contactLastNames = [
  "Almeida",
  "Barros",
  "Cardoso",
  "Dias",
  "Esteves",
  "Freitas",
  "Gomes",
  "Henrique",
  "Inácio",
  "Jardim",
];
const companyNames = [
  "Aurora Cafe",
  "Norte Arquitetura",
  "Viva Saude",
  "Solaris Energia",
  "Brisa Cosmeticos",
  "Atlas Educacao",
  "Mangue Tecnologia",
  "Cais Imobiliaria",
  "Verdejar Alimentos",
  "Lume Clinica",
  "Orbe Logistica",
  "Ponto Criativo",
  "Aquarela Kids",
  "Sertao Labs",
  "Mare Turismo",
  "Raiz Organicos",
  "Horizonte Engenharia",
  "Canoa Estudio",
  "Serra Consultoria",
  "Porto Editorial",
];
const projectNames = [
  "Identidade visual",
  "Campanha de lancamento",
  "Landing page",
  "Conteudo para redes",
  "Automacao comercial",
  "Evento de marca",
  "Relatorio de performance",
  "Reposicionamento digital",
  "Portal institucional",
  "Plano de crescimento",
];
const taskNames = [
  "Receber briefing",
  "Realizar pesquisa",
  "Definir conceito",
  "Preparar planejamento",
  "Produzir conteudo",
  "Criar layout",
  "Revisar materiais",
  "Validar internamente",
  "Enviar para aprovacao",
  "Aplicar ajustes",
  "Preparar arquivos",
  "Programar publicacao",
  "Publicar entrega",
  "Acompanhar resultados",
  "Documentar aprendizados",
];
const subtaskNames = ["Executar etapa", "Revisar etapa"];
const scheduleSlots = [480, 540, 600, 660, 840, 900, 960, 1020];

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function nextWorkday(offset: number): string {
  const date = new Date(`${isoDate(1)}T12:00:00.000Z`);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  for (let index = 0; index < offset; index += 1) {
    do {
      date.setUTCDate(date.getUTCDate() + 1);
    } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  }
  return date.toISOString().slice(0, 10);
}

function taskCountForWorkspace(
  workspaceIndex: number,
  projectCount: number,
): number {
  return Array.from(
    { length: projectCount },
    (_, projectIndex) => 5 + ((workspaceIndex + projectIndex) % 6),
  ).reduce((total, count) => total + count, 0);
}

function installmentCountForWorkspace(
  workspaceIndex: number,
  projectCount: number,
): number {
  return Array.from(
    { length: projectCount },
    (_, projectIndex) => 1 + ((workspaceIndex + projectIndex) % 6),
  ).reduce((total, count) => total + count, 0);
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/u.test(identifier)) {
    throw new Error(`Identificador SQL invalido: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function insertRows(
  client: PoolClient,
  table: string,
  rows: Row[],
): Promise<void> {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]!);
  for (let start = 0; start < rows.length; start += 400) {
    const batch = rows.slice(start, start + 400);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await client.query(
      `insert into app.${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) values ${tuples.join(", ")}`,
      values,
    );
  }
}

async function resetUsers(client: PoolClient): Promise<SeedUser[]> {
  await client.query(
    'alter table app.audit_logs disable trigger "audit_logs_prevent_update_delete"',
  );
  await client.query("delete from app.audit_logs");
  await client.query(
    'alter table app.audit_logs enable trigger "audit_logs_prevent_update_delete"',
  );
  await client.query("delete from app.workspaces");
  await client.query("delete from app.auth_sessions");
  await client.query("delete from app.password_reset_tokens");
  await client.query("delete from app.personal_tasks");
  await client.query("delete from app.user_preferences");
  await client.query("delete from app.user_connections");
  await client.query(
    "delete from app.users where lower(username) <> all($1::text[])",
    [accounts.map(({ username }) => username)],
  );

  const avatarUrls = randomDistinctAvatarUrls(accounts.length);
  const users: SeedUser[] = [];
  for (const [index, account] of accounts.entries()) {
    const avatarUrl = avatarUrls[index]!;
    const existing = await client.query<SeedUser>(
      "select id, username, name, email from app.users where lower(username) = $1 limit 1",
      [account.username],
    );
    let user: SeedUser;
    if (existing.rows[0]) {
      const updated = await client.query<SeedUser>(
        `update app.users
         set name = $2, email = $3, avatar_url = $4, deleted_at = null, updated_at = now()
         where id = $1
         returning id, username, name, email`,
        [existing.rows[0].id, account.name, account.email, avatarUrl],
      );
      user = updated.rows[0]!;
    } else {
      const created = await client.query<SeedUser>(
        `insert into app.users (name, username, email, avatar_url, email_verified_at)
         values ($1, $2, $3, $4, now())
         returning id, username, name, email`,
        [account.name, account.username, account.email, avatarUrl],
      );
      user = created.rows[0]!;
    }

    const passwordHash = await hashPassword(DEVELOPMENT_PASSWORD);
    await client.query(
      `insert into app.user_credentials (user_id, password_hash)
       values ($1, $2)
       on conflict (user_id) do update
       set password_hash = excluded.password_hash,
           password_changed_at = now(),
           updated_at = now()`,
      [user.id, passwordHash],
    );
    users.push(user);
  }
  return users;
}

async function createWorkspaces(
  client: PoolClient,
  users: SeedUser[],
): Promise<WorkspaceSeed[]> {
  const [teste1, teste2, teste3] = users as [SeedUser, SeedUser, SeedUser];
  const definitions = [
    {
      name: "Pessoal",
      kind: "personal" as const,
      owner: teste1,
      members: [teste1],
      projectCount: PROJECT_COUNTS_BY_WORKSPACE[0],
    },
    {
      name: "Pessoal",
      kind: "personal" as const,
      owner: teste2,
      members: [teste2],
      projectCount: PROJECT_COUNTS_BY_WORKSPACE[1],
    },
    {
      name: "Pessoal",
      kind: "personal" as const,
      owner: teste3,
      members: [teste3],
      projectCount: PROJECT_COUNTS_BY_WORKSPACE[2],
    },
    {
      name: "Estúdio Horizonte",
      kind: "shared" as const,
      owner: teste1,
      members: [teste1, teste2],
      projectCount: PROJECT_COUNTS_BY_WORKSPACE[3],
    },
    {
      name: "Operação Aurora",
      kind: "shared" as const,
      owner: teste2,
      members: [teste2, teste3],
      projectCount: PROJECT_COUNTS_BY_WORKSPACE[4],
    },
    {
      name: "Núcleo Atlântico",
      kind: "shared" as const,
      owner: teste3,
      members: [teste3, teste1],
      projectCount: PROJECT_COUNTS_BY_WORKSPACE[5],
    },
    {
      name: "Coletivo Prisma",
      kind: "shared" as const,
      owner: teste1,
      members: [teste1, teste2, teste3],
      projectCount: PROJECT_COUNTS_BY_WORKSPACE[6],
    },
  ];

  const workspaces: WorkspaceSeed[] = [];
  for (const [index, definition] of definitions.entries()) {
    const id = randomUUID();
    await insertRows(client, "workspaces", [
      {
        id,
        name: definition.name,
        description:
          definition.kind === "personal"
            ? `Dados pessoais de @${definition.owner.username}.`
            : `Workspace compartilhado por ${definition.members.map(({ username }) => `@${username}`).join(", ")}.`,
        icon: definition.kind === "personal" ? "house" : "users-round",
        color: ["blue", "emerald", "amber", "violet"][index % 4],
        kind: definition.kind,
        owner_user_id: definition.owner.id,
      },
    ]);
    await insertRows(
      client,
      "workspace_members",
      definition.members
        .filter(({ id: userId }) => userId !== definition.owner.id)
        .map((member) => ({
          workspace_id: id,
          user_id: member.id,
          role: "member",
        })),
    );
    await insertRows(client, "workspace_configurations", [
      { workspace_id: id, version: 1, template_gallery_version: 1 },
    ]);
    workspaces.push({ id, ...definition });
  }
  return workspaces;
}

async function seedCatalogs(
  client: PoolClient,
  workspaces: WorkspaceSeed[],
): Promise<void> {
  const settings = defaultWorkspaceSettings();
  const rows: Row[] = [];
  for (const workspace of workspaces) {
    for (const [field, kind] of catalogDefinitions) {
      for (const [sortOrder, item] of settings[field].entries()) {
        rows.push({
          id: randomUUID(),
          workspace_id: workspace.id,
          kind,
          key: item.key,
          label: item.label,
          icon: item.icon ?? null,
          color: item.color ?? null,
          sort_order: sortOrder,
          locked: true,
        });
      }
    }
  }
  await insertRows(client, "workspace_catalog_entries", rows);
}

async function seedPrivateUserData(
  client: PoolClient,
  users: SeedUser[],
  workspaces: WorkspaceSeed[],
): Promise<Map<string, PrivateUserData>> {
  const result = new Map<string, PrivateUserData>();
  for (const [userIndex, user] of users.entries()) {
    const volume = USER_VOLUMES[userIndex]!;
    const personal = workspaces.find(
      (workspace) =>
        workspace.kind === "personal" && workspace.owner.id === user.id,
    );
    if (!personal)
      throw new Error(`Workspace pessoal ausente para ${user.username}.`);
    const contacts = Array.from({ length: volume.contacts }, (_, index) => ({
      id: randomUUID(),
      workspace_id: personal.id,
      owner_user_id: user.id,
      linked_user_id: null,
      name: `${contactFirstNames[index]} ${contactLastNames[(index + userIndex) % contactLastNames.length]}`,
      contact_type: "person",
      status: "active",
      profession: ["Marketing", "Direcao", "Comercial", "Design"][index % 4],
    }));
    await insertRows(client, "contacts", contacts);
    await insertRows(
      client,
      "contact_phones",
      contacts.map((contact, index) => ({
        id: randomUUID(),
        workspace_id: personal.id,
        contact_id: contact.id,
        type: index % 2 ? "mobile" : "whatsapp",
        number: `+55859${String(10000000 + userIndex * 100 + index).slice(-8)}`,
        label: null,
        is_primary: true,
      })),
    );
    await insertRows(
      client,
      "contact_emails",
      contacts.map((contact, index) => ({
        id: randomUUID(),
        workspace_id: personal.id,
        contact_id: contact.id,
        type: "work",
        address: `contato-${user.username}-${index + 1}@seed.demanda.local`,
        label: null,
        is_primary: true,
      })),
    );
    const businesses = companyNames
      .slice(0, volume.businesses)
      .map((name, index) => ({
        id: randomUUID(),
        workspace_id: personal.id,
        owner_user_id: user.id,
        name: `${name} - ${user.username}`,
        category_key: [
          "marca_pessoal",
          "negocio",
          "projeto_alternativo",
          "outro",
        ][index % 4],
        stage_key: ["negociacao", "contratacao", "ativo"][index % 3],
      }));
    await insertRows(client, "businesses", businesses);
    await insertRows(
      client,
      "business_responsibles",
      businesses.map((business, index) => ({
        workspace_id: personal.id,
        business_id: business.id,
        contact_id: contacts[index % contacts.length]!.id,
        sort_order: 0,
      })),
    );
    result.set(user.id, { contacts, businesses });
  }
  return result;
}

async function seedPersonalTaskData(
  client: PoolClient,
  users: SeedUser[],
): Promise<number> {
  const titles = [
    "Revisar prioridades da semana",
    "Organizar arquivos pessoais",
    "Responder mensagens pendentes",
    "Atualizar portfólio profissional",
    "Planejar próximos estudos",
    "Conferir documentos importantes",
    "Preparar pauta da reunião",
    "Revisar metas do mês",
    "Registrar aprendizados recentes",
  ];
  const rows = users.flatMap((user, userIndex) =>
    titles
      .slice(0, USER_VOLUMES[userIndex]!.personalTasks)
      .map((title, index) => ({
        id: randomUUID(),
        user_id: user.id,
        title,
        completed: index % 4 === 0,
        sort_order: index,
      })),
  );
  await insertRows(client, "personal_tasks", rows);
  return rows.length;
}

async function seedWorkspaceData(
  client: PoolClient,
  workspace: WorkspaceSeed,
  workspaceIndex: number,
  privateData: Map<string, PrivateUserData>,
  scheduleCountByUser: Map<string, number>,
): Promise<{
  projects: number;
  tasks: number;
  subtasks: number;
  blocks: number;
  installments: number;
  contractEntries: number;
}> {
  const serviceResult = await client.query<{ id: string }>(
    `select id from app.services where workspace_id = $1 and archived_at is null order by sort_order, id`,
    [workspace.id],
  );
  const serviceIds = serviceResult.rows.map(({ id }) => id);
  const projects = Array.from(
    { length: workspace.projectCount },
    (_, index) => {
      const businessOwner =
        workspace.members[index % workspace.members.length]!;
      const businesses = privateData.get(businessOwner.id)?.businesses;
      if (!businesses?.length)
        throw new Error("Negocios privados ausentes no seed.");
      const installmentCount = 1 + ((workspaceIndex + index) % 6);
      const amountCents = 275_000 + workspaceIndex * 1_000_000 + index * 73_000;
      const firstDueDate = isoDate(7 + workspaceIndex * 2 + index * 5);
      return {
        id: randomUUID(),
        workspace_id: workspace.id,
        business_id: businesses[(index * 2) % businesses.length]!.id,
        source_service_id: serviceIds.length
          ? serviceIds[index % serviceIds.length]
          : null,
        name: `${projectNames[index]} - ${workspaceIndex + 1}.${index + 1}`,
        status_key: ["planejamento", "execucao", "alteracao"][index % 3],
        briefing: `Projeto de teste ${index + 1} do workspace ${workspace.name}.`,
        start_date: isoDate(-7 + index),
        end_date: isoDate(20 + index * 4),
        contract_type: "one_off",
        amount_cents: amountCents,
        first_due_date: firstDueDate,
        payment_method: ["Pix", "Boleto", "Transferência", "Cartão"][
          (workspaceIndex + index) % 4
        ],
        payment_terms:
          installmentCount === 1
            ? "Pagamento integral no primeiro vencimento."
            : `${installmentCount} parcelas mensais; a primeira vence em ${firstDueDate}.`,
        finance_notes: `Contrato ${workspaceIndex + 1}.${index + 1} com ${installmentCount} parcela(s).`,
        installment_count: installmentCount,
        finance_owner_user_id: workspace.owner.id,
      };
    },
  );
  await insertRows(
    client,
    "projects",
    projects.map(
      ({
        installment_count: _installmentCount,
        finance_owner_user_id: _owner,
        ...project
      }) => project,
    ),
  );
  await insertRows(
    client,
    "project_services",
    projects.flatMap((project) =>
      project.source_service_id
        ? [
            {
              workspace_id: workspace.id,
              project_id: project.id,
              service_id: project.source_service_id,
              sort_order: 0,
            },
          ]
        : [],
    ),
  );
  const contractTotals = await materializeProjectContracts(
    client,
    projects.map((project) => ({
      id: project.id,
      workspaceId: project.workspace_id,
      name: project.name,
      ownerUserId: project.finance_owner_user_id,
      amountCents: project.amount_cents,
      firstDueDate: project.first_due_date,
      installmentCount: project.installment_count,
      notes: project.finance_notes,
    })),
  );
  await insertRows(
    client,
    "project_responsibles",
    projects.flatMap((project) =>
      workspace.members.map((member, sortOrder) => ({
        workspace_id: workspace.id,
        project_id: project.id,
        user_id: member.id,
        sort_order: sortOrder,
      })),
    ),
  );

  const tasks: Array<Row & { responsible_user_id: string }> = [];
  for (const [projectIndex, project] of projects.entries()) {
    const taskCount = 5 + ((workspaceIndex + projectIndex) % 6);
    for (let taskIndex = 0; taskIndex < taskCount; taskIndex += 1) {
      const responsible =
        workspace.members[
          (projectIndex + taskIndex) % workspace.members.length
        ]!;
      tasks.push({
        id: randomUUID(),
        workspace_id: workspace.id,
        project_id: project.id,
        business_id: project.business_id,
        name: `${taskNames[taskIndex]} ${projectIndex + 1}`,
        description: `Tarefa ${taskIndex + 1} do projeto ${project.name}.`,
        category_key: [
          "reuniao",
          "planejamento",
          "criacao",
          "escrita",
          "veiculacao",
        ][taskIndex % 5],
        priority_key: ["baixa", "normal", "alta", "emergente", "urgente"][
          taskIndex % 5
        ],
        status_key: ["planejamento", "fila", "producao"][taskIndex % 3],
        due_date:
          taskIndex % 4 === 0
            ? null
            : isoDate(
                2 + ((workspaceIndex * 7 + projectIndex * 3 + taskIndex) % 45),
              ),
        sort_order: taskIndex,
        board_order: JSON.stringify({
          status: taskIndex,
          priority: taskIndex,
          business: taskIndex,
          project: taskIndex,
        }),
        responsible_user_id: responsible.id,
      });
    }
  }
  await insertRows(
    client,
    "tasks",
    tasks.map(({ responsible_user_id: _responsibleUserId, ...task }) => task),
  );
  await insertRows(
    client,
    "task_responsibles",
    tasks.map((task) => ({
      workspace_id: workspace.id,
      task_id: task.id,
      user_id: task.responsible_user_id,
      sort_order: 0,
    })),
  );

  const subtasks = tasks.flatMap((task) =>
    subtaskNames.map((name, index) => ({
      id: randomUUID(),
      workspace_id: workspace.id,
      task_id: task.id,
      name,
      duration_minutes: 60,
      status_key: "pendente",
      sort_order: index,
      completed_at: null,
    })),
  );
  await insertRows(client, "task_subtasks", subtasks);

  const agendaPositions = new Map<string, number>();
  const nextAgendaPosition = (kind: string, date: unknown): number => {
    const key = `${kind}:${String(date ?? "drawer")}`;
    const next = agendaPositions.get(key) ?? 0;
    agendaPositions.set(key, next + 1);
    return next;
  };
  await insertRows(client, "agenda_entries", [
    ...projects.map((project) => ({
      id: randomUUID(),
      workspace_id: workspace.id,
      entity_kind: "project",
      project_id: project.id,
      task_id: null,
      scheduled_date: project.end_date,
      position: nextAgendaPosition("project", project.end_date),
      duration_minutes: 60,
    })),
    ...tasks.map((task) => ({
      id: randomUUID(),
      workspace_id: workspace.id,
      entity_kind: "task",
      project_id: null,
      task_id: task.id,
      scheduled_date: task.due_date,
      position: nextAgendaPosition("task", task.due_date),
      duration_minutes: 240,
    })),
  ]);

  const firstSubtaskByTask = new Map(
    subtasks
      .filter(({ sort_order }) => sort_order === 0)
      .map((subtask) => [subtask.task_id, subtask]),
  );
  const scheduledTasks = tasks;
  const blocks = scheduledTasks.map((task) => {
    const count = scheduleCountByUser.get(task.responsible_user_id) ?? 0;
    scheduleCountByUser.set(task.responsible_user_id, count + 1);
    const subtask = firstSubtaskByTask.get(task.id as string)!;
    return {
      id: randomUUID(),
      workspace_id: workspace.id,
      task_id: task.id,
      subtask_id: subtask.id,
      scheduled_date: nextWorkday(Math.floor(count / scheduleSlots.length)),
      start_minutes: scheduleSlots[count % scheduleSlots.length],
      duration_minutes: 60,
    };
  });
  await insertRows(client, "cronograma_blocks", blocks);

  return {
    projects: projects.length,
    tasks: tasks.length,
    subtasks: subtasks.length,
    blocks: blocks.length,
    installments: contractTotals.installments,
    contractEntries: contractTotals.financialEntries,
  };
}

async function assertSeedInvariants(
  client: PoolClient,
  users: SeedUser[],
  workspaces: WorkspaceSeed[],
): Promise<void> {
  const expectedTasksByWorkspace = workspaces.map((workspace, index) =>
    taskCountForWorkspace(index, workspace.projectCount),
  );
  const expected = {
    users: accounts.length,
    workspaces: workspaces.length,
    contacts: USER_VOLUMES.reduce(
      (total, volume) => total + volume.contacts,
      0,
    ),
    businesses: USER_VOLUMES.reduce(
      (total, volume) => total + volume.businesses,
      0,
    ),
    services: USER_VOLUMES.reduce(
      (total, volume) => total + volume.services,
      0,
    ),
    deliveries: USER_VOLUMES.reduce(
      (total, volume) => total + volume.deliveries,
      0,
    ),
    personalTasks: USER_VOLUMES.reduce(
      (total, volume) => total + volume.personalTasks,
      0,
    ),
    projects: workspaces.reduce(
      (total, workspace) => total + workspace.projectCount,
      0,
    ),
    tasks: expectedTasksByWorkspace.reduce((total, count) => total + count, 0),
    installments: workspaces.reduce(
      (total, workspace, index) =>
        total + installmentCountForWorkspace(index, workspace.projectCount),
      0,
    ),
    manualEntries: USER_VOLUMES.reduce(
      (total, volume) => total + volume.manualFinances,
      0,
    ),
    distinctAvatars: accounts.length,
    legacyAvatars: 0,
  };

  const totals = await client.query<{
    users: number;
    workspaces: number;
    contacts: number;
    businesses: number;
    services: number;
    deliveries: number;
    personalTasks: number;
    projects: number;
    tasks: number;
    subtasks: number;
    blocks: number;
    installments: number;
    manualEntries: number;
    contractEntries: number;
    financialEntries: number;
    distinctAvatars: number;
    legacyAvatars: number;
  }>(`select
        (select count(*)::int from app.users) users,
        (select count(*)::int from app.workspaces) workspaces,
        (select count(*)::int from app.contacts) contacts,
        (select count(*)::int from app.businesses) businesses,
        (select count(*)::int from app.services) services,
        (select count(*)::int from app.delivery_templates) deliveries,
        (select count(*)::int from app.personal_tasks) "personalTasks",
        (select count(*)::int from app.projects) projects,
        (select count(*)::int from app.tasks) tasks,
        (select count(*)::int from app.task_subtasks) subtasks,
        (select count(*)::int from app.cronograma_blocks) blocks,
        (select count(*)::int from app.project_installments) installments,
        (select count(*)::int from app.financial_entries where source = 'manual' and deleted_at is null) "manualEntries",
        (select count(*)::int from app.financial_entries where source = 'project' and deleted_at is null) "contractEntries",
        (select count(*)::int from app.financial_entries where deleted_at is null) "financialEntries",
        (select count(distinct avatar_url)::int from app.users) "distinctAvatars",
        (select count(*)::int from app.users where avatar_url like '/images/%') "legacyAvatars"`);

  const workspaceCounts = await client.query<{
    id: string;
    projects: number;
    tasks: number;
  }>(`select workspace.id,
            count(distinct project.id)::int projects,
            count(task.id)::int tasks
       from app.workspaces workspace
       left join app.projects project on project.workspace_id = workspace.id
       left join app.tasks task on task.project_id = project.id
      group by workspace.id`);
  const workspaceCountById = new Map(
    workspaceCounts.rows.map((row) => [row.id, row]),
  );
  const workspaceCountsValid = workspaces.every((workspace, index) => {
    const actual = workspaceCountById.get(workspace.id);
    return (
      actual?.projects === workspace.projectCount &&
      actual.tasks === expectedTasksByWorkspace[index]
    );
  });

  const memberships = await client.query<{
    workspaceId: string;
    userId: string;
  }>(
    `select workspace_id "workspaceId", user_id "userId"
       from app.workspace_members
      where workspace_id = any($1::uuid[])`,
    [workspaces.map(({ id }) => id)],
  );
  const membershipsValid = workspaces.every((workspace) => {
    const actual = memberships.rows
      .filter(({ workspaceId }) => workspaceId === workspace.id)
      .map(({ userId }) => userId)
      .sort();
    const planned = workspace.members.map(({ id }) => id).sort();
    return JSON.stringify(actual) === JSON.stringify(planned);
  });

  const userCounts = await client.query<{
    id: string;
    username: string;
    contacts: number;
    businesses: number;
    services: number;
    deliveries: number;
    personalTasks: number;
    visibleProjects: number;
    visibleTasks: number;
    assignedTasks: number;
    assignedSubtasks: number;
    scheduledSubtasks: number;
    manualEntries: number;
    manualRevenues: number;
    manualExpenses: number;
  }>(
    `select seed_user.id,
            seed_user.username,
            (select count(*)::int from app.contacts contact where contact.owner_user_id = seed_user.id) contacts,
            (select count(*)::int from app.businesses business where business.owner_user_id = seed_user.id) businesses,
            (select count(*)::int from app.services service inner join app.workspaces workspace on workspace.id = service.workspace_id where workspace.kind = 'personal' and workspace.owner_user_id = seed_user.id) services,
            (select count(*)::int from app.delivery_templates delivery inner join app.workspaces workspace on workspace.id = delivery.workspace_id where workspace.kind = 'personal' and workspace.owner_user_id = seed_user.id) deliveries,
            (select count(*)::int from app.personal_tasks personal_task where personal_task.user_id = seed_user.id) "personalTasks",
            (select count(*)::int from app.projects project inner join app.workspace_members member on member.workspace_id = project.workspace_id where member.user_id = seed_user.id) "visibleProjects",
            (select count(*)::int from app.tasks task inner join app.workspace_members member on member.workspace_id = task.workspace_id where member.user_id = seed_user.id) "visibleTasks",
            (select count(*)::int from app.task_responsibles responsible where responsible.user_id = seed_user.id) "assignedTasks",
            (select count(*)::int from app.task_subtasks subtask inner join app.task_responsibles responsible on responsible.workspace_id = subtask.workspace_id and responsible.task_id = subtask.task_id where responsible.user_id = seed_user.id) "assignedSubtasks",
            (select count(*)::int from app.cronograma_blocks block inner join app.task_responsibles responsible on responsible.workspace_id = block.workspace_id and responsible.task_id = block.task_id where responsible.user_id = seed_user.id) "scheduledSubtasks",
            (select count(*)::int from app.financial_entries entry where entry.source = 'manual' and entry.created_by_user_id = seed_user.id and entry.deleted_at is null) "manualEntries",
            (select count(*)::int from app.financial_entries entry where entry.source = 'manual' and entry.type = 'revenue' and entry.created_by_user_id = seed_user.id and entry.deleted_at is null) "manualRevenues",
            (select count(*)::int from app.financial_entries entry where entry.source = 'manual' and entry.type = 'expense' and entry.created_by_user_id = seed_user.id and entry.deleted_at is null) "manualExpenses"
       from app.users seed_user
      where seed_user.id = any($1::uuid[])
      order by seed_user.username`,
    [users.map(({ id }) => id)],
  );

  const expectedAssignedTasks = new Map(users.map(({ id }) => [id, 0]));
  for (const [workspaceIndex, workspace] of workspaces.entries()) {
    for (
      let projectIndex = 0;
      projectIndex < workspace.projectCount;
      projectIndex += 1
    ) {
      const taskCount = 5 + ((workspaceIndex + projectIndex) % 6);
      for (let taskIndex = 0; taskIndex < taskCount; taskIndex += 1) {
        const responsible =
          workspace.members[
            (projectIndex + taskIndex) % workspace.members.length
          ]!;
        expectedAssignedTasks.set(
          responsible.id,
          (expectedAssignedTasks.get(responsible.id) ?? 0) + 1,
        );
      }
    }
  }
  const userCountsValid = userCounts.rows.every((row) => {
    const userIndex = users.findIndex(({ id }) => id === row.id);
    const volume = USER_VOLUMES[userIndex];
    if (!volume) return false;
    const visibleWorkspaces = workspaces
      .map((workspace, index) => ({ workspace, index }))
      .filter(({ workspace }) =>
        workspace.members.some(({ id }) => id === row.id),
      );
    const visibleProjects = visibleWorkspaces.reduce(
      (total, { workspace }) => total + workspace.projectCount,
      0,
    );
    const visibleTasks = visibleWorkspaces.reduce(
      (total, { index }) => total + expectedTasksByWorkspace[index]!,
      0,
    );
    const assignedTasks = expectedAssignedTasks.get(row.id) ?? 0;
    return (
      row.contacts === volume.contacts &&
      row.businesses === volume.businesses &&
      row.services === volume.services &&
      row.deliveries === volume.deliveries &&
      row.personalTasks === volume.personalTasks &&
      row.visibleProjects === visibleProjects &&
      row.visibleTasks === visibleTasks &&
      row.assignedTasks === assignedTasks &&
      row.assignedSubtasks === assignedTasks * 2 &&
      row.scheduledSubtasks === assignedTasks &&
      row.manualEntries === volume.manualFinances &&
      row.manualRevenues === volume.manualRevenues &&
      row.manualExpenses === volume.manualExpenses
    );
  });
  const distinctUserVolumes = [
    "contacts",
    "businesses",
    "visibleProjects",
    "visibleTasks",
    "assignedTasks",
  ].every(
    (field) =>
      new Set(
        userCounts.rows.map((row) => row[field as keyof typeof row] as number),
      ).size === users.length,
  );

  const violations = await client.query<{
    invalidProjectTaskCounts: number;
    invalidSubtaskCounts: number;
    invalidResponsibles: number;
    agendaDrift: number;
    overlaps: number;
    invalidSchedule: number;
    invalidPrivateData: number;
    invalidOfferings: number;
    invalidManualFinances: number;
    invalidContracts: number;
    invalidContractEntries: number;
  }>(`select
      (select count(*)::int from (
        select project.id from app.projects project
        left join app.tasks task on task.project_id = project.id
        group by project.id having count(task.id) not between 5 and 10
      ) invalid) "invalidProjectTaskCounts",
      (select count(*)::int from (
        select task.id from app.tasks task
        left join app.task_subtasks subtask on subtask.workspace_id = task.workspace_id and subtask.task_id = task.id
        group by task.id having count(subtask.id) <> 2
      ) invalid) "invalidSubtaskCounts",
      (select count(*)::int from (
        select task.id from app.tasks task
        left join app.task_responsibles responsible on responsible.workspace_id = task.workspace_id and responsible.task_id = task.id
        group by task.id having count(responsible.user_id) <> 1
      ) invalid) "invalidResponsibles",
      (select count(*)::int from app.tasks task
        inner join app.agenda_entries agenda on agenda.workspace_id = task.workspace_id and agenda.task_id = task.id
        where agenda.scheduled_date is distinct from task.due_date) "agendaDrift",
      (select count(*)::int
        from app.cronograma_blocks first_block
        inner join app.task_responsibles first_responsible on first_responsible.workspace_id = first_block.workspace_id and first_responsible.task_id = first_block.task_id
        inner join app.cronograma_blocks second_block on second_block.id > first_block.id and second_block.scheduled_date = first_block.scheduled_date
        inner join app.task_responsibles second_responsible on second_responsible.workspace_id = second_block.workspace_id and second_responsible.task_id = second_block.task_id and second_responsible.user_id = first_responsible.user_id
        where first_block.start_minutes < second_block.start_minutes + second_block.duration_minutes
          and second_block.start_minutes < first_block.start_minutes + first_block.duration_minutes) "overlaps",
      (select count(*)::int from app.cronograma_blocks block
        inner join app.task_subtasks subtask on subtask.workspace_id = block.workspace_id and subtask.id = block.subtask_id
        where subtask.sort_order <> 0
           or block.duration_minutes <> 60
           or extract(isodow from block.scheduled_date) not between 1 and 5
           or block.start_minutes not in (480, 540, 600, 660, 840, 900, 960, 1020)) "invalidSchedule",
      (select count(*)::int from (
        select contact.id from app.contacts contact inner join app.workspaces workspace on workspace.id = contact.workspace_id
         where workspace.kind <> 'personal' or workspace.owner_user_id <> contact.owner_user_id
        union all
        select business.id from app.businesses business inner join app.workspaces workspace on workspace.id = business.workspace_id
         where workspace.kind <> 'personal' or workspace.owner_user_id <> business.owner_user_id
        union all
        select workspace.id from app.workspaces workspace where workspace.kind = 'personal' and workspace.name <> 'Pessoal'
      ) invalid) "invalidPrivateData",
      (select count(*)::int from (
        select service.id from app.services service inner join app.workspaces workspace on workspace.id = service.workspace_id
         where workspace.kind <> 'personal'
            or (select count(*) from app.service_responsibles responsible where responsible.workspace_id = service.workspace_id and responsible.service_id = service.id) <> 1
            or not exists (select 1 from app.service_responsibles responsible where responsible.workspace_id = service.workspace_id and responsible.service_id = service.id and responsible.user_id = workspace.owner_user_id)
        union all
        select delivery.id from app.delivery_templates delivery inner join app.workspaces workspace on workspace.id = delivery.workspace_id
         where workspace.kind <> 'personal'
            or (select count(*) from app.delivery_template_responsibles responsible where responsible.workspace_id = delivery.workspace_id and responsible.delivery_template_id = delivery.id) <> 1
            or not exists (select 1 from app.delivery_template_responsibles responsible where responsible.workspace_id = delivery.workspace_id and responsible.delivery_template_id = delivery.id and responsible.user_id = workspace.owner_user_id)
            or (select count(*) from app.delivery_template_subtasks subtask where subtask.workspace_id = delivery.workspace_id and subtask.delivery_template_id = delivery.id) <> 2
      ) invalid) "invalidOfferings",
      (select count(*)::int from app.financial_entries entry
        inner join app.workspaces workspace on workspace.id = entry.workspace_id
       where entry.source = 'manual'
         and (workspace.kind <> 'personal'
          or workspace.owner_user_id <> entry.created_by_user_id
          or entry.updated_by_user_id <> entry.created_by_user_id
          or entry.project_id is not null
          or entry.project_installment_id is not null)) "invalidManualFinances",
      (select count(*)::int from (
        select project.id
          from app.projects project
          left join app.project_installments installment on installment.workspace_id = project.workspace_id and installment.project_id = project.id
          left join app.financial_entries entry on entry.workspace_id = installment.workspace_id and entry.project_installment_id = installment.id and entry.source = 'project' and entry.deleted_at is null
         group by project.id, project.amount_cents, project.first_due_date
        having project.amount_cents is null
            or project.amount_cents <= 0
            or project.first_due_date is null
            or count(installment.id) < 1
            or sum(installment.amount_cents) <> project.amount_cents
            or min(installment.due_date) <> project.first_due_date
            or min(installment.number) <> 1
            or max(installment.number) <> count(installment.id)
            or count(distinct installment.number) <> count(installment.id)
            or count(entry.id) <> count(installment.id)
            or sum((entry.amount * 100)::bigint) <> project.amount_cents
      ) invalid) "invalidContracts",
      (select count(*)::int
         from app.financial_entries entry
         inner join app.project_installments installment on installment.workspace_id = entry.workspace_id and installment.id = entry.project_installment_id
        where entry.source = 'project'
          and (entry.project_id <> installment.project_id
           or entry.type <> 'revenue'
           or entry.category <> 'Contratos'
           or (entry.amount * 100)::bigint <> installment.amount_cents
           or entry.due_date <> installment.due_date
           or entry.competence_date <> installment.due_date
           or entry.series_id <> installment.project_id
           or entry.series_kind <> 'installment'
           or entry.series_number <> installment.number)) "invalidContractEntries"`);

  const contractVariety = await client.query<{
    projects: number;
    amounts: number;
    methods: number;
    installmentPlans: number;
  }>(`select count(*)::int projects,
            count(distinct amount_cents)::int amounts,
            count(distinct payment_method)::int methods,
            count(distinct installment_count)::int "installmentPlans"
       from (
         select project.id, project.amount_cents, project.payment_method, count(installment.id)::int installment_count
           from app.projects project
           inner join app.project_installments installment on installment.workspace_id = project.workspace_id and installment.project_id = project.id
          group by project.id, project.amount_cents, project.payment_method
       ) plans`);

  const credentialRows = await client.query<{
    userId: string;
    passwordHash: string;
  }>(
    `select credential.user_id "userId", credential.password_hash "passwordHash"
       from app.user_credentials credential
      where credential.user_id = any($1::uuid[])`,
    [users.map(({ id }) => id)],
  );
  const credentialsValid =
    credentialRows.rows.length === users.length &&
    (
      await Promise.all(
        credentialRows.rows.map(({ passwordHash }) =>
          verifyPassword(DEVELOPMENT_PASSWORD, passwordHash),
        ),
      )
    ).every(Boolean);

  const actual = totals.rows[0];
  const violation = violations.rows[0];
  const variety = contractVariety.rows[0];
  const expectedTotals = {
    users: expected.users,
    workspaces: expected.workspaces,
    contacts: expected.contacts,
    businesses: expected.businesses,
    services: expected.services,
    deliveries: expected.deliveries,
    personalTasks: expected.personalTasks,
    projects: expected.projects,
    tasks: expected.tasks,
    subtasks: expected.tasks * 2,
    blocks: expected.tasks,
    installments: expected.installments,
    manualEntries: expected.manualEntries,
    contractEntries: expected.installments,
    financialEntries: expected.installments + expected.manualEntries,
    distinctAvatars: expected.distinctAvatars,
    legacyAvatars: expected.legacyAvatars,
  };
  const totalsValid =
    !!actual &&
    Object.entries(expectedTotals).every(
      ([key, value]) => actual[key as keyof typeof actual] === value,
    );
  const violationsValid =
    !!violation && Object.values(violation).every((total) => total === 0);
  const varietyValid =
    !!variety &&
    variety.projects === expected.projects &&
    variety.amounts === expected.projects &&
    variety.methods >= 4 &&
    variety.installmentPlans >= 6;

  if (
    !totalsValid ||
    !workspaceCountsValid ||
    !membershipsValid ||
    !userCountsValid ||
    !distinctUserVolumes ||
    !credentialsValid ||
    !violationsValid ||
    !varietyValid
  ) {
    throw new Error(
      `A verificacao final encontrou invariantes invalidas no seed: ${JSON.stringify(
        {
          totalsValid,
          workspaceCountsValid,
          membershipsValid,
          userCountsValid,
          distinctUserVolumes,
          credentialsValid,
          violations: violation,
          variety,
          actual,
          expected: expectedTotals,
          userCounts: userCounts.rows,
        },
      )}`,
    );
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("O seed de desenvolvimento nao pode rodar em producao.");
  }

  const environment = parseServerEnvironment(process.env);
  const pool = new pg.Pool({
    connectionString: environment.DATABASE_URL,
    max: environment.DATABASE_POOL_MAX,
    connectionTimeoutMillis: environment.DATABASE_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: environment.DATABASE_IDLE_TIMEOUT_MS,
  });
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [2026071402]);
    const users = await resetUsers(client);
    const workspaces = await createWorkspaces(client, users);
    await seedCatalogs(client, workspaces);
    const personalProfiles = users.map((user, userIndex) => {
      const workspace = workspaces.find(
        (candidate) =>
          candidate.kind === "personal" && candidate.owner.id === user.id,
      );
      if (!workspace) {
        throw new Error(`Workspace pessoal ausente para ${user.username}.`);
      }
      return {
        user,
        workspace,
        volume: USER_VOLUMES[userIndex]!,
      };
    });
    const offeringTotals = await seedUserOfferings(
      client,
      personalProfiles.map(({ user, workspace, volume }) => ({
        userId: user.id,
        username: user.username,
        workspaceId: workspace.id,
        serviceCount: volume.services,
        deliveryCount: volume.deliveries,
      })),
    );
    const privateData = await seedPrivateUserData(client, users, workspaces);
    const personalTasks = await seedPersonalTaskData(client, users);

    let projects = 0;
    let tasks = 0;
    let subtasks = 0;
    let blocks = 0;
    let installments = 0;
    let contractEntries = 0;
    const scheduleCountByUser = new Map<string, number>();
    for (const [index, workspace] of workspaces.entries()) {
      const totals = await seedWorkspaceData(
        client,
        workspace,
        index,
        privateData,
        scheduleCountByUser,
      );
      projects += totals.projects;
      tasks += totals.tasks;
      subtasks += totals.subtasks;
      blocks += totals.blocks;
      installments += totals.installments;
      contractEntries += totals.contractEntries;
    }

    const manualFinanceTotals = await seedManualUserFinances(
      client,
      personalProfiles.map(
        ({ user, workspace }): PersonalFinanceSeedProfile => ({
          userId: user.id,
          username: user.username as PersonalFinanceSeedProfile["username"],
          workspaceId: workspace.id,
        }),
      ),
    );

    const connectionRows = [
      [users[0]!, users[1]!],
      [users[1]!, users[2]!],
      [users[2]!, users[0]!],
    ].map(([left, right]) => {
      const [userA, userB] = left.id < right.id ? [left, right] : [right, left];
      return {
        user_a_id: userA.id,
        user_b_id: userB.id,
        manual_connected_at: null,
        workspace_connected_at: new Date(),
      };
    });
    await insertRows(client, "user_connections", connectionRows);
    await assertSeedInvariants(client, users, workspaces);

    await client.query("commit");
    console.log(
      [
        "Seed aplicado com sucesso:",
        `- usuarios: ${users.length}`,
        `- workspaces: ${workspaces.length} (3 pessoais + 4 compartilhados)`,
        `- contatos privados: ${USER_VOLUMES.map(({ contacts }) => contacts).join("/")} por usuario`,
        `- negocios privados: ${USER_VOLUMES.map(({ businesses }) => businesses).join("/")} por usuario`,
        `- servicos pessoais: ${offeringTotals.services} (${USER_VOLUMES.map(({ services }) => services).join("/")})`,
        `- entregas pessoais: ${offeringTotals.deliveries} (${USER_VOLUMES.map(({ deliveries }) => deliveries).join("/")})`,
        `- projetos: ${projects}`,
        `- tarefas: ${tasks} (1 responsavel por tarefa)`,
        `- subtarefas: ${subtasks}`,
        `- blocos no Cronograma: ${blocks} (50% das subtarefas por usuario)`,
        `- itens de tarefario pessoal: ${personalTasks}`,
        `- parcelas/receitas de contratos: ${installments}/${contractEntries}`,
        `- lancamentos avulsos: ${manualFinanceTotals.entries} (${manualFinanceTotals.revenues} receitas e ${manualFinanceTotals.expenses} despesas)`,
        `- senha redefinida para as 3 contas: ${DEVELOPMENT_PASSWORD}`,
      ].join("\n"),
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error(`[database] Falha ao aplicar seed: ${message}`);
  process.exitCode = 1;
});
