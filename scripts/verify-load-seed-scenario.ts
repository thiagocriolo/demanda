import "dotenv/config";
import type { PoolClient, QueryResultRow } from "pg";
import { verifyPassword } from "../src/lib/server/auth/password";
import { parseServerEnvironment } from "../src/lib/server/config/env-schema";
import { createDatabasePool } from "../src/lib/server/db/pool";

const USERNAMES = ["teste1", "teste2", "teste3"] as const;
const DEVELOPMENT_PASSWORD = "Teste@123";
type SeedUsername = (typeof USERNAMES)[number];

const EXPECTED_SHARED_WORKSPACES = [
  {
    name: "Estúdio Horizonte",
    owner: "teste1",
    members: ["teste1", "teste2"],
    projects: 5,
  },
  {
    name: "Operação Aurora",
    owner: "teste2",
    members: ["teste2", "teste3"],
    projects: 6,
  },
  {
    name: "Núcleo Atlântico",
    owner: "teste3",
    members: ["teste1", "teste3"],
    projects: 8,
  },
  {
    name: "Coletivo Prisma",
    owner: "teste1",
    members: ["teste1", "teste2", "teste3"],
    projects: 10,
  },
] as const;

const EXPECTED_PERSONAL_PROJECTS: Record<SeedUsername, number> = {
  teste1: 5,
  teste2: 6,
  teste3: 7,
};

const EXPECTED_MANUAL_ENTRIES: Record<SeedUsername, number> = {
  teste1: 12,
  teste2: 15,
  teste3: 18,
};

type CountRow = {
  username: SeedUsername;
  total: number;
};

type VisibleCountRow = {
  username: SeedUsername;
  projects: number;
  tasks: number;
};

type ScheduleCountRow = {
  username: SeedUsername;
  subtasks: number;
  scheduled: number;
};

type WorkspaceRow = {
  id: string;
  name: string;
  kind: "personal" | "shared";
  ownerUsername: SeedUsername;
  archived: boolean;
  projectCount: number;
};

type WorkspaceMemberRow = {
  workspaceId: string;
  username: SeedUsername;
  role: "owner" | "admin" | "member";
};

type ManualEntryCountRow = {
  username: SeedUsername;
  total: number;
  revenues: number;
  expenses: number;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

function formatCounts(rows: readonly CountRow[]): string {
  return rows.map(({ username, total }) => `${username}=${total}`).join(", ");
}

function assertSeedUserRows<T extends { username: string }>(
  rows: readonly T[],
  label: string,
): asserts rows is Array<T & { username: SeedUsername }> {
  invariant(
    rows.length === USERNAMES.length &&
      sameStrings(
        rows.map(({ username }) => username),
        USERNAMES,
      ),
    `${label}: eram esperadas linhas para teste1, teste2 e teste3.`,
  );
}

function assertCountRange(
  rows: readonly CountRow[],
  label: string,
  minimum: number,
  maximum: number,
  distinct: boolean,
): void {
  assertSeedUserRows(rows, label);
  invariant(
    rows.every(({ total }) => total >= minimum && total <= maximum),
    `${label}: cada usuário deve ter entre ${minimum} e ${maximum}; encontrado ${formatCounts(rows)}.`,
  );
  if (distinct) {
    invariant(
      new Set(rows.map(({ total }) => total)).size === USERNAMES.length,
      `${label}: as quantidades precisam ser diferentes; encontrado ${formatCounts(rows)}.`,
    );
  }
}

function assertDistinctUserMetric(
  rows: readonly VisibleCountRow[],
  metric: "projects" | "tasks",
  label: string,
): void {
  assertSeedUserRows(rows, label);
  const values = rows.map((row) => row[metric]);
  invariant(
    values.every((value) => value > 0) &&
      new Set(values).size === USERNAMES.length,
    `${label}: a métrica precisa ser positiva e diferente por usuário; encontrado ${rows
      .map((row) => `${row.username}=${row[metric]}`)
      .join(", ")}.`,
  );
}

async function scalar(
  client: PoolClient,
  statement: string,
  values: unknown[] = [],
): Promise<number> {
  const result = await client.query<{ total: number }>(statement, values);
  invariant(
    result.rows.length === 1,
    "Uma verificação escalar não retornou uma linha.",
  );
  return result.rows[0]!.total;
}

async function rows<T extends QueryResultRow>(
  client: PoolClient,
  statement: string,
  values: unknown[] = [],
): Promise<T[]> {
  return (await client.query<T>(statement, values)).rows;
}

async function verifyUsersAndWorkspaces(
  client: PoolClient,
): Promise<WorkspaceRow[]> {
  const users = await rows<{ username: string }>(
    client,
    `select username
       from app.users
      order by username`,
  );
  invariant(
    users.length === 3 &&
      sameStrings(
        users.map(({ username }) => username),
        USERNAMES,
      ),
    `Usuários inválidos: esperado somente ${USERNAMES.join(", ")}.`,
  );

  const workspaces = await rows<WorkspaceRow>(
    client,
    `select workspace.id,
            workspace.name,
            workspace.kind,
            owner.username as "ownerUsername",
            workspace.archived_at is not null as archived,
            count(project.id)::int as "projectCount"
       from app.workspaces workspace
       inner join app.users owner on owner.id = workspace.owner_user_id
       left join app.projects project
         on project.workspace_id = workspace.id
        and project.archived_at is null
      group by workspace.id, owner.username
      order by workspace.kind, workspace.name, owner.username`,
  );
  invariant(
    workspaces.length === 7,
    `Workspaces inválidos: esperado 7, encontrado ${workspaces.length}.`,
  );
  invariant(
    workspaces.every(({ archived }) => !archived),
    "O cenário não deve conter workspace arquivado.",
  );

  const membershipRows = await rows<WorkspaceMemberRow>(
    client,
    `select member.workspace_id as "workspaceId", seed_user.username, member.role
       from app.workspace_members member
       inner join app.users seed_user on seed_user.id = member.user_id
      order by member.workspace_id, seed_user.username`,
  );
  const membersByWorkspace = new Map<string, WorkspaceMemberRow[]>();
  for (const membership of membershipRows) {
    membersByWorkspace.set(membership.workspaceId, [
      ...(membersByWorkspace.get(membership.workspaceId) ?? []),
      membership,
    ]);
  }

  const personalWorkspaces = workspaces.filter(
    ({ kind }) => kind === "personal",
  );
  invariant(
    personalWorkspaces.length === 3,
    "Devem existir exatamente 3 workspaces pessoais.",
  );
  for (const username of USERNAMES) {
    const matches = personalWorkspaces.filter(
      ({ ownerUsername }) => ownerUsername === username,
    );
    invariant(
      matches.length === 1,
      `Workspace pessoal ausente ou duplicado para ${username}.`,
    );
    const workspace = matches[0]!;
    invariant(
      workspace.name === "Pessoal",
      `O workspace pessoal de ${username} deve se chamar Pessoal.`,
    );
    invariant(
      workspace.projectCount === EXPECTED_PERSONAL_PROJECTS[username],
      `O workspace pessoal de ${username} deve ter ${EXPECTED_PERSONAL_PROJECTS[username]} projetos, mas possui ${workspace.projectCount}.`,
    );
    const memberships = membersByWorkspace.get(workspace.id) ?? [];
    invariant(
      memberships.length === 1 &&
        memberships[0]!.username === username &&
        memberships[0]!.role === "owner",
      `A composição do workspace pessoal de ${username} está incorreta.`,
    );
  }

  const sharedWorkspaces = workspaces.filter(({ kind }) => kind === "shared");
  invariant(
    sharedWorkspaces.length === 4,
    "Devem existir exatamente 4 workspaces compartilhados.",
  );
  for (const expected of EXPECTED_SHARED_WORKSPACES) {
    const matches = sharedWorkspaces.filter(
      ({ name }) => name === expected.name,
    );
    invariant(
      matches.length === 1,
      `Workspace compartilhado ausente ou duplicado: ${expected.name}.`,
    );
    const workspace = matches[0]!;
    invariant(
      workspace.ownerUsername === expected.owner,
      `O proprietário de ${expected.name} deveria ser ${expected.owner}.`,
    );
    invariant(
      workspace.projectCount === expected.projects,
      `${expected.name} deve ter ${expected.projects} projetos, mas possui ${workspace.projectCount}.`,
    );
    const memberships = membersByWorkspace.get(workspace.id) ?? [];
    invariant(
      sameStrings(
        memberships.map(({ username }) => username),
        expected.members,
      ),
      `Membros incorretos em ${expected.name}.`,
    );
    invariant(
      memberships.every(({ username, role }) =>
        username === expected.owner ? role === "owner" : role === "member",
      ),
      `Papéis incorretos em ${expected.name}.`,
    );
  }

  invariant(
    workspaces.every(
      ({ projectCount }) => projectCount >= 5 && projectCount <= 10,
    ),
    "Cada workspace deve conter entre 5 e 10 projetos.",
  );
  return workspaces;
}

async function verifyPrivateRecords(client: PoolClient): Promise<{
  contacts: CountRow[];
  businesses: CountRow[];
}> {
  const contacts = await rows<CountRow>(
    client,
    `select seed_user.username, count(contact.id)::int total
       from app.users seed_user
       left join app.contacts contact on contact.owner_user_id = seed_user.id
      where seed_user.username = any($1::text[])
      group by seed_user.id, seed_user.username
      order by seed_user.username`,
    [USERNAMES],
  );
  const businesses = await rows<CountRow>(
    client,
    `select seed_user.username, count(business.id)::int total
       from app.users seed_user
       left join app.businesses business on business.owner_user_id = seed_user.id
      where seed_user.username = any($1::text[])
      group by seed_user.id, seed_user.username
      order by seed_user.username`,
    [USERNAMES],
  );
  assertCountRange(contacts, "Contatos", 5, 10, true);
  assertCountRange(businesses, "Negócios", 15, 20, true);

  const invalidPrivateRecords = await scalar(
    client,
    `select (
        select count(*)
          from app.contacts contact
          inner join app.workspaces workspace on workspace.id = contact.workspace_id
         where contact.archived_at is not null
            or workspace.kind <> 'personal'
            or workspace.owner_user_id <> contact.owner_user_id
      )::int + (
        select count(*)
          from app.businesses business
          inner join app.workspaces workspace on workspace.id = business.workspace_id
         where business.archived_at is not null
            or workspace.kind <> 'personal'
            or workspace.owner_user_id <> business.owner_user_id
      )::int as total`,
  );
  invariant(
    invalidPrivateRecords === 0,
    `Há ${invalidPrivateRecords} contatos ou negócios fora do workspace pessoal do proprietário, ou arquivados.`,
  );

  const duplicatePrivateNames = await scalar(
    client,
    `select count(*)::int total
       from (
         select contact.owner_user_id, lower(btrim(contact.name)) name
           from app.contacts contact
          group by contact.owner_user_id, lower(btrim(contact.name))
         having count(*) > 1
         union all
         select business.owner_user_id, lower(btrim(business.name)) name
           from app.businesses business
          group by business.owner_user_id, lower(btrim(business.name))
         having count(*) > 1
       ) duplicate`,
  );
  invariant(
    duplicatePrivateNames === 0,
    "Contatos e negócios devem ter nomes distintos por usuário.",
  );
  return { contacts, businesses };
}

async function verifyProjectAndTaskCounts(client: PoolClient): Promise<{
  visible: VisibleCountRow[];
  assigned: VisibleCountRow[];
}> {
  const archivedTasks = await scalar(
    client,
    `select count(*)::int total
       from app.tasks task
      where task.archived_at is not null`,
  );
  invariant(
    archivedTasks === 0,
    "O cenário não deve conter tarefas arquivadas.",
  );

  const invalidTasksPerProject = await scalar(
    client,
    `select count(*)::int total
       from (
         select project.id
           from app.projects project
           left join app.tasks task
             on task.workspace_id = project.workspace_id
            and task.project_id = project.id
            and task.archived_at is null
          where project.archived_at is null
          group by project.id
         having count(task.id) not between 5 and 10
       ) invalid`,
  );
  invariant(
    invalidTasksPerProject === 0,
    `${invalidTasksPerProject} projetos não possuem entre 5 e 10 tarefas.`,
  );

  const visible = await rows<VisibleCountRow>(
    client,
    `with user_workspaces as (
       select workspace.owner_user_id user_id, workspace.id workspace_id
         from app.workspaces workspace
       union
       select member.user_id, member.workspace_id
         from app.workspace_members member
     )
     select seed_user.username,
            count(distinct project.id)::int projects,
            count(distinct task.id)::int tasks
       from app.users seed_user
       left join user_workspaces access on access.user_id = seed_user.id
       left join app.projects project
         on project.workspace_id = access.workspace_id
        and project.archived_at is null
       left join app.tasks task
         on task.workspace_id = access.workspace_id
        and task.archived_at is null
      where seed_user.username = any($1::text[])
      group by seed_user.id, seed_user.username
      order by seed_user.username`,
    [USERNAMES],
  );
  assertDistinctUserMetric(visible, "projects", "Projetos visíveis");
  assertDistinctUserMetric(visible, "tasks", "Tarefas visíveis");

  const assigned = await rows<VisibleCountRow>(
    client,
    `select seed_user.username,
            count(distinct project_responsible.project_id)::int projects,
            count(distinct task_responsible.task_id)::int tasks
       from app.users seed_user
       left join app.project_responsibles project_responsible
         on project_responsible.user_id = seed_user.id
       left join app.task_responsibles task_responsible
         on task_responsible.user_id = seed_user.id
      where seed_user.username = any($1::text[])
      group by seed_user.id, seed_user.username
      order by seed_user.username`,
    [USERNAMES],
  );
  assertDistinctUserMetric(assigned, "projects", "Projetos atribuídos");
  assertDistinctUserMetric(assigned, "tasks", "Tarefas atribuídas");

  const projectsWithoutResponsible = await scalar(
    client,
    `select count(*)::int total
       from (
         select project.id
           from app.projects project
           left join app.project_responsibles responsible
             on responsible.workspace_id = project.workspace_id
            and responsible.project_id = project.id
          group by project.id
         having count(responsible.user_id) < 1
       ) invalid`,
  );
  invariant(
    projectsWithoutResponsible === 0,
    "Todo projeto deve possuir ao menos um responsável.",
  );

  const invalidTaskResponsibles = await scalar(
    client,
    `select count(*)::int total
       from (
         select task.id
           from app.tasks task
           left join app.task_responsibles responsible
             on responsible.workspace_id = task.workspace_id
            and responsible.task_id = task.id
          group by task.id
         having count(responsible.user_id) <> 1
       ) invalid`,
  );
  invariant(
    invalidTaskResponsibles === 0,
    `${invalidTaskResponsibles} tarefas não possuem exatamente um responsável.`,
  );
  return { visible, assigned };
}

async function verifyPersonalCatalogs(client: PoolClient): Promise<{
  services: CountRow[];
  deliveries: CountRow[];
  personalTasks: CountRow[];
}> {
  const services = await rows<CountRow>(
    client,
    `select seed_user.username, count(service.id)::int total
       from app.users seed_user
       inner join app.workspaces workspace
         on workspace.owner_user_id = seed_user.id
        and workspace.kind = 'personal'
       left join app.services service on service.workspace_id = workspace.id
      where seed_user.username = any($1::text[])
      group by seed_user.id, seed_user.username
      order by seed_user.username`,
    [USERNAMES],
  );
  const deliveries = await rows<CountRow>(
    client,
    `select seed_user.username, count(delivery.id)::int total
       from app.users seed_user
       inner join app.workspaces workspace
         on workspace.owner_user_id = seed_user.id
        and workspace.kind = 'personal'
       left join app.delivery_templates delivery on delivery.workspace_id = workspace.id
      where seed_user.username = any($1::text[])
      group by seed_user.id, seed_user.username
      order by seed_user.username`,
    [USERNAMES],
  );
  const personalTasks = await rows<CountRow>(
    client,
    `select seed_user.username, count(personal_task.id)::int total
       from app.users seed_user
       left join app.personal_tasks personal_task on personal_task.user_id = seed_user.id
      where seed_user.username = any($1::text[])
      group by seed_user.id, seed_user.username
      order by seed_user.username`,
    [USERNAMES],
  );
  assertCountRange(services, "Serviços", 5, 10, false);
  assertCountRange(deliveries, "Entregas", 15, 20, false);
  assertCountRange(personalTasks, "Tarefário pessoal", 5, 10, false);

  const invalidServices = await scalar(
    client,
    `select count(*)::int total
       from app.services service
       inner join app.workspaces workspace on workspace.id = service.workspace_id
      where service.archived_at is not null
         or workspace.kind <> 'personal'
         or (select count(*)
               from app.service_responsibles responsible
              where responsible.workspace_id = service.workspace_id
                and responsible.service_id = service.id) <> 1
         or not exists (
              select 1
                from app.service_responsibles responsible
               where responsible.workspace_id = service.workspace_id
                 and responsible.service_id = service.id
                 and responsible.user_id = workspace.owner_user_id
         )`,
  );
  invariant(
    invalidServices === 0,
    `${invalidServices} serviços pessoais estão inconsistentes.`,
  );

  const invalidDeliveries = await scalar(
    client,
    `select count(*)::int total
       from app.delivery_templates delivery
       inner join app.workspaces workspace on workspace.id = delivery.workspace_id
      where delivery.archived_at is not null
         or workspace.kind <> 'personal'
         or delivery.service_id is null
         or (select count(*)
               from app.delivery_template_responsibles responsible
              where responsible.workspace_id = delivery.workspace_id
                and responsible.delivery_template_id = delivery.id) <> 1
         or not exists (
              select 1
                from app.delivery_template_responsibles responsible
               where responsible.workspace_id = delivery.workspace_id
                 and responsible.delivery_template_id = delivery.id
                 and responsible.user_id = workspace.owner_user_id
         )`,
  );
  invariant(
    invalidDeliveries === 0,
    `${invalidDeliveries} entregas pessoais estão inconsistentes.`,
  );

  const duplicateCatalogNames = await scalar(
    client,
    `select count(*)::int total
       from (
         select service.workspace_id, lower(btrim(service.name)) name
           from app.services service
          group by service.workspace_id, lower(btrim(service.name))
         having count(*) > 1
         union all
         select delivery.workspace_id, lower(btrim(delivery.name)) name
           from app.delivery_templates delivery
          group by delivery.workspace_id, lower(btrim(delivery.name))
         having count(*) > 1
         union all
         select personal_task.user_id, lower(btrim(personal_task.title)) name
           from app.personal_tasks personal_task
          group by personal_task.user_id, lower(btrim(personal_task.title))
         having count(*) > 1
       ) duplicate`,
  );
  invariant(
    duplicateCatalogNames === 0,
    "Serviços, entregas e itens do tarefário devem ter nomes distintos.",
  );
  return { services, deliveries, personalTasks };
}

async function verifySchedule(client: PoolClient): Promise<ScheduleCountRow[]> {
  const invalidSubtaskCounts = await scalar(
    client,
    `select count(*)::int total
       from (
         select task.id
           from app.tasks task
           left join app.task_subtasks subtask
             on subtask.workspace_id = task.workspace_id
            and subtask.task_id = task.id
          group by task.id
         having count(subtask.id) <> 2
            or count(subtask.id) filter (where subtask.archived_at is null) <> 2
       ) invalid`,
  );
  invariant(
    invalidSubtaskCounts === 0,
    `${invalidSubtaskCounts} tarefas não possuem exatamente 2 subtarefas ativas.`,
  );

  const scheduleCounts = await rows<ScheduleCountRow>(
    client,
    `select seed_user.username,
            count(subtask.id)::int subtasks,
            count(block.id)::int scheduled
       from app.users seed_user
       left join app.task_responsibles responsible
         on responsible.user_id = seed_user.id
       left join app.task_subtasks subtask
         on subtask.workspace_id = responsible.workspace_id
        and subtask.task_id = responsible.task_id
        and subtask.archived_at is null
       left join app.cronograma_blocks block
         on block.workspace_id = subtask.workspace_id
        and block.subtask_id = subtask.id
      where seed_user.username = any($1::text[])
      group by seed_user.id, seed_user.username
      order by seed_user.username`,
    [USERNAMES],
  );
  assertSeedUserRows(scheduleCounts, "Cronograma");
  for (const row of scheduleCounts) {
    invariant(
      row.subtasks > 0,
      `${row.username} não possui subtarefas atribuídas.`,
    );
    invariant(
      row.scheduled * 2 === row.subtasks,
      `${row.username}: esperado exatamente 50% das subtarefas no Cronograma; encontrado ${row.scheduled}/${row.subtasks}.`,
    );
  }

  const invalidScheduledSubtasks = await scalar(
    client,
    `select count(*)::int total
       from app.cronograma_blocks block
       inner join app.task_subtasks subtask
         on subtask.workspace_id = block.workspace_id
        and subtask.task_id = block.task_id
        and subtask.id = block.subtask_id
      where subtask.sort_order <> 0
         or block.duration_minutes <> subtask.duration_minutes`,
  );
  invariant(
    invalidScheduledSubtasks === 0,
    "O seed deve agendar somente a primeira subtarefa de cada tarefa e preservar sua duração.",
  );

  const overlaps = await scalar(
    client,
    `select count(*)::int total
       from app.cronograma_blocks first_block
       inner join app.task_responsibles first_responsible
         on first_responsible.workspace_id = first_block.workspace_id
        and first_responsible.task_id = first_block.task_id
       inner join app.cronograma_blocks second_block
         on second_block.id > first_block.id
        and second_block.scheduled_date = first_block.scheduled_date
       inner join app.task_responsibles second_responsible
         on second_responsible.workspace_id = second_block.workspace_id
        and second_responsible.task_id = second_block.task_id
        and second_responsible.user_id = first_responsible.user_id
      where first_block.start_minutes < second_block.start_minutes + second_block.duration_minutes
        and second_block.start_minutes < first_block.start_minutes + first_block.duration_minutes`,
  );
  invariant(
    overlaps === 0,
    `O Cronograma possui ${overlaps} sobreposições por responsável.`,
  );
  return scheduleCounts;
}

async function verifyContractsAndProjectFinance(
  client: PoolClient,
): Promise<void> {
  const invalidContracts = await scalar(
    client,
    `select count(*)::int total
       from app.projects project
      where project.archived_at is not null
         or project.contract_type <> 'one_off'
         or coalesce(project.amount_cents, 0) <= 0
         or project.first_due_date is null
         or nullif(btrim(project.payment_method), '') is null
         or nullif(btrim(project.payment_terms), '') is null`,
  );
  invariant(
    invalidContracts === 0,
    `${invalidContracts} contratos de projeto estão incompletos.`,
  );

  const contractVariety = await rows<{
    projects: number;
    amounts: number;
    methods: number;
    terms: number;
    installmentCounts: number;
  }>(
    client,
    `select count(*)::int projects,
            count(distinct project.amount_cents)::int amounts,
            count(distinct project.payment_method)::int methods,
            count(distinct project.payment_terms)::int terms,
            count(distinct installment.total)::int as "installmentCounts"
       from app.projects project
       inner join lateral (
         select count(*)::int total
           from app.project_installments project_installment
          where project_installment.workspace_id = project.workspace_id
            and project_installment.project_id = project.id
       ) installment on true`,
  );
  const variety = contractVariety[0]!;
  invariant(
    variety.projects > 0 && variety.amounts === variety.projects,
    "Cada projeto deve possuir um valor de contrato diferente.",
  );
  invariant(
    variety.methods >= 2 &&
      variety.terms >= 2 &&
      variety.installmentCounts >= 2,
    "Métodos, condições e quantidades de parcelas precisam variar entre contratos.",
  );

  const invalidInstallments = await scalar(
    client,
    `select count(*)::int total
       from (
         select project.id,
                project.amount_cents,
                project.first_due_date,
                count(installment.id)::int installment_count,
                min(installment.number) first_number,
                max(installment.number) last_number,
                sum(installment.amount_cents) installment_sum,
                min(installment.due_date) filter (where installment.number = 1) first_installment_due,
                bool_or(installment.amount_cents <= 0) non_positive_amount
           from app.projects project
           left join app.project_installments installment
             on installment.workspace_id = project.workspace_id
            and installment.project_id = project.id
          group by project.id
       ) contract
      where contract.installment_count not between 1 and 6
         or contract.first_number <> 1
         or contract.last_number <> contract.installment_count
         or contract.installment_sum <> contract.amount_cents
         or contract.first_installment_due is distinct from contract.first_due_date
         or coalesce(contract.non_positive_amount, true)`,
  );
  invariant(
    invalidInstallments === 0,
    `${invalidInstallments} projetos possuem parcelamento incoerente.`,
  );

  const invalidProjectEntries = await scalar(
    client,
    `select count(*)::int total
       from app.project_installments installment
       inner join app.projects project
         on project.workspace_id = installment.workspace_id
        and project.id = installment.project_id
       inner join app.workspaces workspace on workspace.id = project.workspace_id
      where (select count(*)
               from app.financial_entries entry
              where entry.workspace_id = installment.workspace_id
                and entry.project_installment_id = installment.id
                and entry.source = 'project') <> 1
         or not exists (
              select 1
                from app.financial_entries entry
               where entry.workspace_id = installment.workspace_id
                 and entry.project_installment_id = installment.id
                 and entry.source = 'project'
                 and entry.deleted_at is null
                 and entry.project_id = installment.project_id
                 and entry.type = 'revenue'
                 and entry.mode = 'one_off'
                 and round(entry.amount * 100)::bigint = installment.amount_cents
                 and entry.competence_date = installment.due_date
                 and entry.due_date = installment.due_date
                 and entry.title = project.name
                 and entry.category = 'Contratos'
                 and entry.notes = coalesce(project.finance_notes, '')
                 and entry.status = case
                   when coalesce(installment.status_key, '') in
                     ('settled', 'paid', 'received', 'pago', 'recebido')
                     then 'settled'
                   else 'open'
                 end
                 and entry.series_id = installment.project_id
                 and entry.series_kind = 'installment'
                 and entry.series_number = installment.number
                 and entry.series_count = (
                   select count(*)::int
                     from app.project_installments sibling
                    where sibling.workspace_id = installment.workspace_id
                      and sibling.project_id = installment.project_id
                 )
                 and entry.created_by_user_id = workspace.owner_user_id
                 and entry.updated_by_user_id = workspace.owner_user_id
         )`,
  );
  invariant(
    invalidProjectEntries === 0,
    `${invalidProjectEntries} parcelas não possuem uma receita financeira automática coerente.`,
  );

  const strayProjectEntries = await scalar(
    client,
    `select count(*)::int total
       from app.financial_entries entry
       left join app.project_installments installment
         on installment.workspace_id = entry.workspace_id
        and installment.id = entry.project_installment_id
       left join app.projects project
         on project.workspace_id = entry.workspace_id
        and project.id = entry.project_id
      where entry.source = 'project'
        and (entry.deleted_at is not null
          or installment.id is null
          or project.id is null
          or installment.project_id is distinct from entry.project_id)`,
  );
  invariant(
    strayProjectEntries === 0,
    `${strayProjectEntries} receitas de contrato estão órfãs ou removidas.`,
  );
}

async function verifyManualFinance(
  client: PoolClient,
): Promise<ManualEntryCountRow[]> {
  const manualEntries = await rows<ManualEntryCountRow>(
    client,
    `select seed_user.username,
            count(entry.id)::int total,
            count(entry.id) filter (where entry.type = 'revenue')::int revenues,
            count(entry.id) filter (where entry.type = 'expense')::int expenses
       from app.users seed_user
       inner join app.workspaces workspace
         on workspace.owner_user_id = seed_user.id
        and workspace.kind = 'personal'
       left join app.financial_entries entry
         on entry.workspace_id = workspace.id
        and entry.source = 'manual'
        and entry.deleted_at is null
      where seed_user.username = any($1::text[])
      group by seed_user.id, seed_user.username
      order by seed_user.username`,
    [USERNAMES],
  );
  assertSeedUserRows(manualEntries, "Lançamentos manuais");
  for (const row of manualEntries) {
    invariant(
      row.total === EXPECTED_MANUAL_ENTRIES[row.username],
      `${row.username} deve ter ${EXPECTED_MANUAL_ENTRIES[row.username]} lançamentos manuais, mas possui ${row.total}.`,
    );
    invariant(
      row.revenues > 0 &&
        row.expenses > 0 &&
        row.revenues + row.expenses === row.total,
      `${row.username} deve possuir receitas e despesas manuais.`,
    );
  }

  const invalidManualEntries = await scalar(
    client,
    `select count(*)::int total
       from app.financial_entries entry
       inner join app.workspaces workspace on workspace.id = entry.workspace_id
      where entry.source = 'manual'
        and (entry.deleted_at is not null
          or workspace.kind <> 'personal'
          or entry.created_by_user_id <> workspace.owner_user_id
          or entry.updated_by_user_id <> workspace.owner_user_id
          or entry.project_id is not null
          or entry.project_installment_id is not null
          or entry.mode <> 'one_off'
          or entry.series_id is not null
          or entry.series_kind is not null
          or entry.series_number is not null
          or entry.series_count is not null)`,
  );
  invariant(
    invalidManualEntries === 0,
    `${invalidManualEntries} lançamentos manuais não são pessoais ou independentes de projetos.`,
  );

  const duplicateManualTitles = await scalar(
    client,
    `select count(*)::int total
       from (
         select entry.workspace_id, lower(btrim(entry.title)) title
           from app.financial_entries entry
          where entry.source = 'manual'
          group by entry.workspace_id, lower(btrim(entry.title))
         having count(*) > 1
       ) duplicate`,
  );
  invariant(
    duplicateManualTitles === 0,
    "Os lançamentos manuais precisam ter títulos distintos por usuário.",
  );
  return manualEntries;
}

async function main(): Promise<void> {
  const environment = parseServerEnvironment(process.env);
  const pool = createDatabasePool(environment);
  const client = await pool.connect();

  try {
    await client.query("begin isolation level repeatable read read only");
    const credentials = await rows<{
      username: SeedUsername;
      passwordHash: string;
    }>(
      client,
      `select seed_user.username, credential.password_hash "passwordHash"
         from app.users seed_user
         inner join app.user_credentials credential on credential.user_id = seed_user.id
        where seed_user.username = any($1::text[])
        order by seed_user.username`,
      [USERNAMES],
    );
    assertSeedUserRows(credentials, "Credenciais");
    invariant(
      (
        await Promise.all(
          credentials.map(({ passwordHash }) =>
            verifyPassword(DEVELOPMENT_PASSWORD, passwordHash),
          ),
        )
      ).every(Boolean),
      "As senhas das contas seed não correspondem à senha de desenvolvimento.",
    );
    const workspaces = await verifyUsersAndWorkspaces(client);
    const privateRecords = await verifyPrivateRecords(client);
    const projectTasks = await verifyProjectAndTaskCounts(client);
    const catalogs = await verifyPersonalCatalogs(client);
    const schedules = await verifySchedule(client);
    await verifyContractsAndProjectFinance(client);
    const manualEntries = await verifyManualFinance(client);
    await client.query("rollback");

    console.log(
      [
        "Cenário do seed de carga válido (verificação somente leitura):",
        `- login: teste1/teste2/teste3 com ${DEVELOPMENT_PASSWORD}`,
        `- usuários/workspaces: ${USERNAMES.length}/${workspaces.length}`,
        `- contatos: ${formatCounts(privateRecords.contacts)}`,
        `- negócios: ${formatCounts(privateRecords.businesses)}`,
        `- projetos visíveis: ${projectTasks.visible.map((row) => `${row.username}=${row.projects}`).join(", ")}`,
        `- tarefas visíveis: ${projectTasks.visible.map((row) => `${row.username}=${row.tasks}`).join(", ")}`,
        `- projetos atribuídos: ${projectTasks.assigned.map((row) => `${row.username}=${row.projects}`).join(", ")}`,
        `- tarefas atribuídas: ${projectTasks.assigned.map((row) => `${row.username}=${row.tasks}`).join(", ")}`,
        `- serviços: ${formatCounts(catalogs.services)}`,
        `- entregas: ${formatCounts(catalogs.deliveries)}`,
        `- tarefário: ${formatCounts(catalogs.personalTasks)}`,
        `- cronograma: ${schedules.map((row) => `${row.username}=${row.scheduled}/${row.subtasks}`).join(", ")}`,
        `- lançamentos manuais: ${manualEntries.map((row) => `${row.username}=${row.total}`).join(", ")}`,
        "- contratos, parcelas e receitas automáticas: coerentes",
        "- sobreposições de cronograma: 0",
      ].join("\n"),
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error(
    `[database] Falha na verificação do cenário do seed: ${message}`,
  );
  process.exitCode = 1;
});
