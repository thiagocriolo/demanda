import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

type Session = { cookie: string };
type JsonRecord = Record<string, unknown>;

const baseUrl = process.env.LIVE_BASE_URL ?? "http://127.0.0.1:5190";
const target = new URL(baseUrl);
if (
  !["http:", "https:"].includes(target.protocol) ||
  !["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname)
) {
  throw new Error("A verificação HTTP só pode ser executada contra localhost.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const ownerEmail = `be08-owner-${suffix}@example.test`;
const memberEmail = `be08-member-${suffix}@example.test`;
const ownerUsername = `be08_owner_${suffix}`.slice(0, 40);
const memberUsername = `be08_member_${suffix}`.slice(0, 40);
const password = "Be08Live2026!";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function sessionCookie(response: Response): string {
  const value = response.headers.get("set-cookie") ?? "";
  const match = /(?:^|,\s*)demanda_session=([^;]+)/u.exec(value);
  assert.ok(match?.[1], "O cadastro não retornou o cookie de sessão.");
  return `demanda_session=${match[1]}`;
}

function asRecord(value: unknown, label: string): JsonRecord {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} não é um objeto.`,
  );
  return value as JsonRecord;
}

function asRecords(value: unknown, label: string): JsonRecord[] {
  assert.ok(
    Array.isArray(value) &&
      value.every(
        (item) =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      ),
    `${label} não é uma lista de objetos.`,
  );
  return value as JsonRecord[];
}

function ids(value: unknown, label: string): string[] {
  return asRecords(value, label).map((item) => String(item.id));
}

function numeric(value: unknown, label: string): number {
  assert.equal(typeof value, "number", `${label} não é numérico.`);
  return value as number;
}

async function waitForServer(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Servidor indisponível: ${String(lastError)}`);
}

async function register(username: string, email: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/cadastro`, {
    method: "POST",
    redirect: "manual",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      origin: baseUrl,
      "x-sveltekit-action": "true",
    },
    body: new URLSearchParams({
      username,
      email,
      password,
      passwordConfirmation: password,
    }),
  });
  assert.ok(
    response.status === 200 || response.status === 303,
    `Cadastro de ${email}: HTTP ${response.status} ${await response.text()}`,
  );
  return { cookie: sessionCookie(response) };
}

async function api(
  session: Session,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      cookie: session.cookie,
      origin: baseUrl,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

async function json(
  response: Response,
  expectedStatus: number,
): Promise<JsonRecord> {
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    assert.fail(
      `HTTP ${response.status} não retornou JSON: ${text.slice(0, 500)}`,
    );
  }
  assert.equal(
    response.status,
    expectedStatus,
    `HTTP ${response.status}, esperado ${expectedStatus}: ${JSON.stringify(body)}`,
  );
  return asRecord(body, "Resposta HTTP");
}

async function expectStatus(
  response: Response,
  expectedStatus: number,
  label: string,
): Promise<void> {
  const body = await response.text();
  assert.equal(
    response.status,
    expectedStatus,
    `${label}: HTTP ${response.status}, esperado ${expectedStatus}: ${body.slice(0, 500)}`,
  );
}

async function switchWorkspace(
  session: Session,
  workspaceId: string,
): Promise<void> {
  await json(
    await api(session, "/api/workspaces/active", {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    }),
    200,
  );
}

function taskInput(
  projectId: string,
  responsibleUserIds: string[],
  overrides: JsonRecord = {},
): JsonRecord {
  return {
    name: `Campanha HTTP ${suffix}`,
    projectId,
    category: "criacao",
    priority: "alta",
    status: "producao",
    briefing: "Tarefa temporária do verificador BE-08.",
    dueDate: "2028-08-31",
    tagLabels: ["Campanha", "HTTP"],
    responsibleUserIds,
    subtasks: [
      {
        name: "Criar roteiro",
        durationMinutes: 90,
        status: "pendente",
      },
      {
        name: "Produzir peças",
        durationMinutes: 180,
        status: "pendente",
      },
    ],
    sortOrder: 3,
    boardOrder: {},
    ...overrides,
  };
}

function updateInput(task: JsonRecord, overrides: JsonRecord = {}): JsonRecord {
  const project = asRecord(task.project, "Projeto da tarefa");
  return {
    version: numeric(task.version, "Versão da tarefa"),
    status: String(task.status),
    name: String(task.name),
    projectId: String(project.id),
    category: String(task.category),
    priority: String(task.priority),
    briefing: String(task.briefing),
    dueDate: task.dueDate,
    tagLabels: asRecords(task.tags, "Tags da tarefa").map(({ name }) => name),
    responsibleUserIds: asRecords(
      task.responsibles,
      "Responsáveis da tarefa",
    ).map(({ userId }) => userId),
    subtasks: asRecords(task.subtasks, "Subtarefas").map((subtask) => ({
      id: subtask.id,
      name: subtask.name,
      durationMinutes: subtask.durationMinutes,
      status: subtask.status,
    })),
    sortOrder: task.sortOrder,
    boardOrder: task.boardOrder,
    ...overrides,
  };
}

async function temporaryUsers(): Promise<
  { id: string; email: string; personalWorkspaceId: string }[]
> {
  const result = await pool.query<{
    id: string;
    email: string;
    personal_workspace_id: string;
  }>(
    `select u.id, u.email, w.id as personal_workspace_id
       from app.users u
       join app.workspaces w
         on w.owner_user_id = u.id and w.kind = 'personal'
      where u.email = any($1::text[])
      order by u.email`,
    [[ownerEmail, memberEmail]],
  );
  return result.rows.map((row) => ({
    id: row.id,
    email: row.email,
    personalWorkspaceId: row.personal_workspace_id,
  }));
}

async function insertParents(
  workspaceId: string,
  label: string,
): Promise<{ businessId: string; projectId: string }> {
  const business = await pool.query<{ id: string }>(
    `insert into app.businesses
       (workspace_id, name, category_key, stage_key)
     values ($1, $2, 'cliente', 'ativo')
     returning id`,
    [workspaceId, `Negócio ${label} ${suffix}`],
  );
  const businessId = business.rows[0]?.id ?? "";
  assert.ok(businessId, `Negócio ${label} não criado.`);
  const project = await pool.query<{ id: string }>(
    `insert into app.projects
       (workspace_id, business_id, name, status_key, briefing,
        start_date, end_date)
     values ($1, $2, $3, 'execucao', 'Projeto do verificador HTTP',
       '2028-08-01', '2028-09-30')
     returning id`,
    [workspaceId, businessId, `Projeto ${label} ${suffix}`],
  );
  const projectId = project.rows[0]?.id ?? "";
  assert.ok(projectId, `Projeto ${label} não criado.`);
  return { businessId, projectId };
}

async function cleanup(): Promise<void> {
  const users = await pool.query<{ id: string }>(
    `select id from app.users where email = any($1::text[])`,
    [[ownerEmail, memberEmail]],
  );
  const userIds = users.rows.map(({ id }) => id);
  if (!userIds.length) return;
  assert.ok(
    userIds.length <= 2,
    "A limpeza encontrou usuários além do esperado.",
  );

  await pool.query("begin");
  try {
    await pool.query(
      `delete from app.workspaces where owner_user_id = any($1::uuid[])`,
      [userIds],
    );
    await pool.query(`delete from app.users where id = any($1::uuid[])`, [
      userIds,
    ]);
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

async function main(): Promise<void> {
  await waitForServer();
  await expectStatus(
    await fetch(`${baseUrl}/api/tasks`, {
      headers: { accept: "application/json" },
    }),
    401,
    "Tarefas sem autenticação",
  );
  await expectStatus(
    await fetch(`${baseUrl}/api/tasks/board`, {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: baseUrl,
      },
      body: JSON.stringify({ view: "priority", updates: [] }),
    }),
    401,
    "Pauta sem autenticação",
  );

  const owner = await register(ownerUsername, ownerEmail);
  const member = await register(memberUsername, memberEmail);
  const users = await temporaryUsers();
  assert.equal(users.length, 2);
  const ownerUser = users.find(({ email }) => email === ownerEmail);
  const memberUser = users.find(({ email }) => email === memberEmail);
  assert.ok(ownerUser && memberUser);

  const foreignParents = await insertParents(
    memberUser.personalWorkspaceId,
    "estrangeiro",
  );
  const workspace = await pool.query<{ id: string }>(
    `insert into app.workspaces (name, description, kind, owner_user_id)
     values ($1, $2, 'shared', $3)
     returning id`,
    [`BE-08 HTTP ${suffix}`, "Workspace temporário", ownerUser.id],
  );
  const sharedWorkspaceId = workspace.rows[0]?.id ?? "";
  assert.ok(sharedWorkspaceId);
  await pool.query(
    `insert into app.workspace_members (workspace_id, user_id, role)
     values ($1, $2, 'member')`,
    [sharedWorkspaceId, memberUser.id],
  );
  const localParents = await insertParents(sharedWorkspaceId, "local");
  const alternateParents = await insertParents(
    sharedWorkspaceId,
    "alternativo",
  );
  const boardSourceA = await insertParents(sharedWorkspaceId, "pauta-a");
  const boardSourceB = await insertParents(sharedWorkspaceId, "pauta-b");
  await switchWorkspace(owner, sharedWorkspaceId);
  await switchWorkspace(member, sharedWorkspaceId);

  await expectStatus(
    await api(owner, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        ...taskInput(localParents.projectId, [ownerUser.id]),
        name: `Workspace injetado ${suffix}`,
        workspaceId: randomUUID(),
      }),
    }),
    400,
    "workspaceId injetado na tarefa",
  );
  await expectStatus(
    await api(owner, "/api/tasks", {
      method: "POST",
      body: JSON.stringify(
        taskInput(localParents.projectId, [ownerUser.id], {
          name: `Ordem injetada ${suffix}`,
          boardOrder: { status: 0 },
        }),
      ),
    }),
    400,
    "boardOrder injetado na criação",
  );
  await expectStatus(
    await api(owner, "/api/tasks", {
      method: "POST",
      body: JSON.stringify(
        taskInput(foreignParents.projectId, [ownerUser.id], {
          name: `Projeto estrangeiro ${suffix}`,
        }),
      ),
    }),
    400,
    "Projeto de outro workspace",
  );
  await expectStatus(
    await api(owner, "/api/tasks", {
      method: "POST",
      body: JSON.stringify(
        taskInput(localParents.projectId, [randomUUID()], {
          name: `Responsável estrangeiro ${suffix}`,
        }),
      ),
    }),
    400,
    "Responsável fora do workspace",
  );

  const created = await json(
    await api(owner, "/api/tasks", {
      method: "POST",
      body: JSON.stringify(taskInput(localParents.projectId, [ownerUser.id])),
    }),
    201,
  );
  const taskId = String(created.id);
  assert.equal(created.workspaceId, sharedWorkspaceId);
  assert.equal(created.version, 1);
  assert.equal(created.status, "producao");
  assert.equal(created.durationMinutes, 270);
  assert.equal(
    asRecord(created.project, "Projeto criado").id,
    localParents.projectId,
  );
  assert.equal(
    asRecord(created.business, "Negócio criado").id,
    localParents.businessId,
  );
  assert.deepEqual(
    asRecords(created.responsibles, "Responsáveis criados").map(
      ({ userId }) => userId,
    ),
    [ownerUser.id],
  );
  const createdSubtasks = asRecords(created.subtasks, "Subtarefas criadas");
  assert.equal(createdSubtasks.length, 2);

  const atomicProbe = await json(
    await api(owner, "/api/tasks", {
      method: "POST",
      body: JSON.stringify(
        taskInput(localParents.projectId, [ownerUser.id], {
          name: `Atomic aggregate probe ${suffix}`,
        }),
      ),
    }),
    201,
  );
  await expectStatus(
    await api(owner, `/api/tasks/${String(atomicProbe.id)}`, {
      method: "PUT",
      body: JSON.stringify(
        updateInput(atomicProbe, { boardOrder: { status: 99 } }),
      ),
    }),
    400,
    "boardOrder injetado no agregado",
  );
  assert.deepEqual(
    await json(await api(owner, `/api/tasks/${String(atomicProbe.id)}`), 200),
    atomicProbe,
  );
  await expectStatus(
    await api(owner, `/api/tasks/${String(atomicProbe.id)}`, {
      method: "PUT",
      body: JSON.stringify(
        updateInput(atomicProbe, {
          name: `Não persistir conclusão ${suffix}`,
          status: "conclusao",
          tagLabels: ["Não persistir"],
        }),
      ),
    }),
    409,
    "Conclusão agregada com subtarefa pendente",
  );
  assert.deepEqual(
    await json(await api(owner, `/api/tasks/${String(atomicProbe.id)}`), 200),
    atomicProbe,
    "Falha de estado não pode persistir conteúdo parcial.",
  );

  const atomicSubtasks = asRecords(
    atomicProbe.subtasks,
    "Subtarefas do agregado atômico",
  );
  await expectStatus(
    await api(owner, `/api/tasks/${String(atomicProbe.id)}`, {
      method: "PUT",
      body: JSON.stringify(
        updateInput(atomicProbe, {
          name: `Não persistir relação ${suffix}`,
          status: "conclusao",
          tagLabels: ["Rollback tardio"],
          subtasks: [
            {
              id: atomicSubtasks[0]?.id,
              name: atomicSubtasks[0]?.name,
              durationMinutes: atomicSubtasks[0]?.durationMinutes,
              status: "concluida",
            },
            {
              id: randomUUID(),
              name: "Subtarefa inexistente",
              durationMinutes: 60,
              status: "concluida",
            },
          ],
        }),
      ),
    }),
    400,
    "Rollback tardio do agregado",
  );
  assert.deepEqual(
    await json(await api(owner, `/api/tasks/${String(atomicProbe.id)}`), 200),
    atomicProbe,
    "Falha tardia não pode persistir estado, conteúdo ou relações.",
  );

  const atomicCompleted = await json(
    await api(owner, `/api/tasks/${String(atomicProbe.id)}`, {
      method: "PUT",
      body: JSON.stringify(
        updateInput(atomicProbe, {
          name: `Atomicamente concluída ${suffix}`,
          status: "conclusao",
          tagLabels: ["Atômica"],
          subtasks: atomicSubtasks.map((subtask) => ({
            id: subtask.id,
            name: subtask.name,
            durationMinutes: subtask.durationMinutes,
            status: "concluida",
          })),
        }),
      ),
    }),
    200,
  );
  assert.equal(atomicCompleted.version, 2);
  assert.equal(atomicCompleted.status, "conclusao");
  assert.equal(typeof atomicCompleted.completedAt, "string");
  assert.ok(
    asRecords(atomicCompleted.subtasks, "Subtarefas concluídas").every(
      ({ status }) => status === "concluida",
    ),
  );

  const completedAtomicSubtasks = asRecords(
    atomicCompleted.subtasks,
    "Subtarefas para reabertura atômica",
  );
  const atomicReopened = await json(
    await api(owner, `/api/tasks/${String(atomicProbe.id)}`, {
      method: "PUT",
      body: JSON.stringify(
        updateInput(atomicCompleted, {
          name: `Atomicamente reaberta ${suffix}`,
          status: "producao",
          subtasks: completedAtomicSubtasks.map((subtask, index) => ({
            id: subtask.id,
            name: subtask.name,
            durationMinutes: subtask.durationMinutes,
            status: index === 0 ? "pendente" : subtask.status,
          })),
        }),
      ),
    }),
    200,
  );
  assert.equal(atomicReopened.version, 3);
  assert.equal(atomicReopened.status, "producao");
  assert.equal(atomicReopened.completedAt, null);
  assert.equal(
    asRecords(atomicReopened.subtasks, "Subtarefas reabertas")[0]?.completedAt,
    null,
  );
  const archivedAtomicProbe = await json(
    await api(
      owner,
      `/api/tasks/${String(atomicProbe.id)}?version=${String(atomicReopened.version)}`,
      { method: "DELETE" },
    ),
    200,
  );

  const boardProbeA = await json(
    await api(owner, "/api/tasks", {
      method: "POST",
      body: JSON.stringify(
        taskInput(boardSourceA.projectId, [ownerUser.id], {
          name: `Board probe A ${suffix}`,
          priority: "board_a",
          status: "board_status_a",
        }),
      ),
    }),
    201,
  );
  const boardProbeB = await json(
    await api(owner, "/api/tasks", {
      method: "POST",
      body: JSON.stringify(
        taskInput(boardSourceB.projectId, [ownerUser.id], {
          name: `Board probe B ${suffix}`,
          priority: "board_b",
          status: "board_status_b",
        }),
      ),
    }),
    201,
  );
  await expectStatus(
    await api(owner, "/api/tasks/board", {
      method: "PUT",
      body: JSON.stringify({
        view: "priority",
        updates: [
          {
            id: boardProbeA.id,
            version: 1,
            position: 0,
            columnKey: "Colisão",
          },
          {
            id: boardProbeB.id,
            version: 1,
            position: 0,
            columnKey: " colisao ",
          },
        ],
      }),
    }),
    400,
    "Posição duplicada na mesma coluna da pauta",
  );

  const boardPriority = await json(
    await api(owner, "/api/tasks/board", {
      method: "PUT",
      body: JSON.stringify({
        view: "priority",
        updates: [
          {
            id: boardProbeB.id,
            version: 1,
            position: 0,
            columnKey: "board_b_target",
          },
          {
            id: boardProbeA.id,
            version: 1,
            position: 0,
            columnKey: "board_a_target",
          },
        ],
      }),
    }),
    200,
  );
  assert.equal(boardPriority.workspaceId, sharedWorkspaceId);
  assert.equal(boardPriority.view, "priority");
  const priorityItems = asRecords(boardPriority.items, "Resultado da pauta");
  assert.deepEqual(
    priorityItems.map(({ id }) => id),
    [boardProbeB.id, boardProbeA.id],
    "O batch deve preservar a ordem do payload na resposta.",
  );
  assert.deepEqual(
    priorityItems.map(({ version }) => version),
    [2, 2],
  );
  assert.deepEqual(
    priorityItems.map(
      (item) => asRecord(item.boardOrder, "Ordem da pauta").priority,
    ),
    [0, 0],
  );
  const priorityA = priorityItems[1]!;
  const priorityB = priorityItems[0]!;

  await expectStatus(
    await api(owner, "/api/tasks/board", {
      method: "PUT",
      body: JSON.stringify({
        view: "priority",
        updates: [
          {
            id: priorityA.id,
            version: 2,
            position: 3,
            columnKey: "board_a_next",
          },
          {
            id: priorityB.id,
            version: 1,
            position: 4,
            columnKey: "board_b_target",
          },
        ],
      }),
    }),
    409,
    "Rollback integral do batch com versão antiga",
  );
  assert.deepEqual(
    await json(await api(owner, `/api/tasks/${String(priorityA.id)}`), 200),
    priorityA,
    "O primeiro item do lote não pode mudar quando o segundo conflita.",
  );
  assert.deepEqual(
    await json(await api(owner, `/api/tasks/${String(priorityB.id)}`), 200),
    priorityB,
  );

  const businessBoard = await json(
    await api(owner, "/api/tasks/board", {
      method: "PUT",
      body: JSON.stringify({
        view: "business",
        updates: [
          {
            id: priorityA.id,
            version: 2,
            position: 5,
            columnKey: boardSourceA.businessId,
          },
        ],
      }),
    }),
    200,
  );
  const businessPositionedA = asRecords(
    businessBoard.items,
    "Ordem por negócio",
  )[0]!;
  assert.equal(businessPositionedA.version, 3);
  assert.equal(
    asRecord(businessPositionedA.boardOrder, "Ordem por negócio").business,
    5,
  );

  const projectBoard = await json(
    await api(owner, "/api/tasks/board", {
      method: "PUT",
      body: JSON.stringify({
        view: "project",
        updates: [
          {
            id: businessPositionedA.id,
            version: 3,
            position: 7,
            columnKey: alternateParents.projectId,
          },
        ],
      }),
    }),
    200,
  );
  const movedBoardTask = asRecords(
    projectBoard.items,
    "Movimento entre projetos",
  )[0]!;
  assert.equal(
    asRecord(movedBoardTask.project, "Projeto movido").id,
    alternateParents.projectId,
  );
  assert.equal(
    asRecord(movedBoardTask.business, "Negócio derivado").id,
    alternateParents.businessId,
  );
  assert.equal(movedBoardTask.version, 4);
  assert.equal(
    asRecord(movedBoardTask.boardOrder, "Ordem por projeto").project,
    7,
  );
  assert.equal(
    Object.hasOwn(
      asRecord(movedBoardTask.boardOrder, "Ordem após trocar negócio"),
      "business",
    ),
    false,
  );

  const dimensionChangedBoardTask = await json(
    await api(owner, `/api/tasks/${String(movedBoardTask.id)}`, {
      method: "PUT",
      body: JSON.stringify(
        updateInput(movedBoardTask, {
          status: "board_status_a_changed",
          priority: "board_a_changed",
          projectId: localParents.projectId,
        }),
      ),
    }),
    200,
  );
  assert.equal(dimensionChangedBoardTask.version, 5);
  assert.deepEqual(dimensionChangedBoardTask.boardOrder, {});
  assert.equal(
    asRecord(dimensionChangedBoardTask.project, "Projeto alterado").id,
    localParents.projectId,
  );
  assert.equal(
    asRecord(dimensionChangedBoardTask.business, "Negócio alterado").id,
    localParents.businessId,
  );

  await expectStatus(
    await api(owner, "/api/tasks/board", {
      method: "PUT",
      body: JSON.stringify({
        view: "business",
        updates: [
          {
            id: dimensionChangedBoardTask.id,
            version: 5,
            position: 1,
            columnKey: alternateParents.businessId,
          },
        ],
      }),
    }),
    400,
    "Troca de negócio sem projeto",
  );
  assert.deepEqual(
    await json(
      await api(owner, `/api/tasks/${String(dimensionChangedBoardTask.id)}`),
      200,
    ),
    dimensionChangedBoardTask,
  );

  const statusBoard = await json(
    await api(owner, "/api/tasks/board", {
      method: "PUT",
      body: JSON.stringify({
        view: "status",
        updates: [
          {
            id: priorityB.id,
            version: 2,
            position: 6,
            columnKey: "board_status_b",
          },
        ],
      }),
    }),
    200,
  );
  const statusPositionedB = asRecords(
    statusBoard.items,
    "Ordem por status",
  )[0]!;
  assert.equal(statusPositionedB.version, 3);
  const stateChangedB = await json(
    await api(owner, `/api/tasks/${String(statusPositionedB.id)}/state`, {
      method: "PUT",
      body: JSON.stringify({
        version: 3,
        status: "board_status_b_changed",
      }),
    }),
    200,
  );
  assert.equal(stateChangedB.version, 4);
  assert.equal(
    Object.hasOwn(
      asRecord(stateChangedB.boardOrder, "Ordem após mudar status"),
      "status",
    ),
    false,
  );
  await expectStatus(
    await api(owner, "/api/tasks/board", {
      method: "PUT",
      body: JSON.stringify({
        view: "status",
        updates: [
          {
            id: stateChangedB.id,
            version: 4,
            position: 0,
            columnKey: "conclusao",
          },
        ],
      }),
    }),
    409,
    "Conclusão inválida pelo batch",
  );
  assert.deepEqual(
    await json(await api(owner, `/api/tasks/${String(stateChangedB.id)}`), 200),
    stateChangedB,
  );
  const archivedBoardA = await json(
    await api(
      owner,
      `/api/tasks/${String(dimensionChangedBoardTask.id)}?version=5`,
      { method: "DELETE" },
    ),
    200,
  );
  const archivedBoardB = await json(
    await api(owner, `/api/tasks/${String(stateChangedB.id)}?version=4`, {
      method: "DELETE",
    }),
    200,
  );

  const concurrencyProbe = await json(
    await api(owner, "/api/tasks", {
      method: "POST",
      body: JSON.stringify(
        taskInput(localParents.projectId, [ownerUser.id], {
          name: `Concurrency probe ${suffix}`,
        }),
      ),
    }),
    201,
  );
  const concurrentNames = [
    `Concurrent winner A ${suffix}`,
    `Concurrent winner B ${suffix}`,
  ];
  const concurrentResponses = await Promise.all(
    concurrentNames.map((name) =>
      api(owner, `/api/tasks/${String(concurrencyProbe.id)}`, {
        method: "PUT",
        body: JSON.stringify(updateInput(concurrencyProbe, { name })),
      }),
    ),
  );
  assert.deepEqual(
    concurrentResponses.map(({ status }) => status).sort(),
    [200, 409],
    "Exactly one concurrent update must win.",
  );
  const winningResponse = concurrentResponses.find(
    ({ status }) => status === 200,
  );
  const losingResponse = concurrentResponses.find(
    ({ status }) => status === 409,
  );
  assert.ok(winningResponse && losingResponse);
  const concurrencyWinner = await json(winningResponse, 200);
  await expectStatus(losingResponse, 409, "Concurrent stale update");
  const concurrencyCurrent = await json(
    await api(owner, `/api/tasks/${String(concurrencyProbe.id)}`),
    200,
  );
  assert.equal(concurrencyCurrent.name, concurrencyWinner.name);
  await json(
    await api(
      owner,
      `/api/tasks/${String(concurrencyProbe.id)}?version=${String(concurrencyWinner.version)}`,
      { method: "DELETE" },
    ),
    200,
  );

  const sharedRead = await json(await api(member, `/api/tasks/${taskId}`), 200);
  assert.equal(sharedRead.id, taskId);
  assert.equal(sharedRead.version, 1);

  const firstTagId = String(asRecords(created.tags, "Tags criadas")[0]?.id);
  const filters = new URLSearchParams({
    query: "roteiro",
    status: "producao",
    category: "criacao",
    priority: "alta",
    projectId: localParents.projectId,
    businessId: localParents.businessId,
    responsibleUserId: memberUser.id,
    tagId: firstTagId,
    dueFrom: "2028-08-01",
    dueTo: "2028-08-31",
    page: "1",
    pageSize: "10",
  });
  const filtered = await json(await api(member, `/api/tasks?${filters}`), 200);
  assert.equal(filtered.workspaceId, sharedWorkspaceId);
  assert.equal(filtered.total, 1);
  assert.deepEqual(ids(filtered.items, "Tarefas filtradas"), [taskId]);

  const firstSubtask = createdSubtasks[0]!;
  const updated = await json(
    await api(owner, `/api/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(
        updateInput(created, {
          name: `Campanha atualizada ${suffix}`,
          priority: "urgente",
          tagLabels: ["Campanha atualizada"],
          responsibleUserIds: [memberUser.id],
          subtasks: [
            {
              id: firstSubtask.id,
              name: "Roteiro aprovado",
              durationMinutes: 120,
              status: "concluida",
            },
            {
              name: "Programar mídia",
              durationMinutes: 60,
              status: "pendente",
            },
          ],
        }),
      ),
    }),
    200,
  );
  assert.equal(updated.version, 2);
  assert.equal(updated.name, `Campanha atualizada ${suffix}`);
  assert.equal(updated.priority, "urgente");
  assert.equal(updated.durationMinutes, 180);
  assert.deepEqual(
    asRecords(updated.responsibles, "Responsáveis atualizados").map(
      ({ userId }) => userId,
    ),
    [memberUser.id],
  );
  const updatedSubtasks = asRecords(updated.subtasks, "Subtarefas atualizadas");
  assert.equal(updatedSubtasks.length, 2);
  const pendingSubtask = updatedSubtasks.find(
    ({ status }) => status === "pendente",
  );
  assert.ok(pendingSubtask);

  await expectStatus(
    await api(owner, `/api/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(
        updateInput(created, { name: `Versão antiga ${suffix}` }),
      ),
    }),
    409,
    "Atualização concorrente do agregado",
  );
  await expectStatus(
    await api(owner, `/api/tasks/${taskId}/state`, {
      method: "PUT",
      body: JSON.stringify({ version: 2, status: "conclusao" }),
    }),
    409,
    "Conclusão com subtarefa pendente",
  );

  const completedSubtasks = await json(
    await api(
      owner,
      `/api/tasks/${taskId}/subtasks/${String(pendingSubtask.id)}/state`,
      {
        method: "PUT",
        body: JSON.stringify({ version: 2, status: "concluida" }),
      },
    ),
    200,
  );
  assert.equal(completedSubtasks.version, 3);
  const repeatedSubtask = await json(
    await api(
      owner,
      `/api/tasks/${taskId}/subtasks/${String(pendingSubtask.id)}/state`,
      {
        method: "PUT",
        body: JSON.stringify({ version: 2, status: "concluida" }),
      },
    ),
    200,
  );
  assert.equal(repeatedSubtask.version, 3);
  await expectStatus(
    await api(
      owner,
      `/api/tasks/${taskId}/subtasks/${String(pendingSubtask.id)}/state`,
      {
        method: "PUT",
        body: JSON.stringify({ version: 2, status: "pendente" }),
      },
    ),
    409,
    "Alvo diferente com versão antiga",
  );

  const completed = await json(
    await api(owner, `/api/tasks/${taskId}/state`, {
      method: "PUT",
      body: JSON.stringify({ version: 3, status: "conclusao" }),
    }),
    200,
  );
  assert.equal(completed.status, "conclusao");
  assert.equal(completed.version, 4);
  assert.equal(typeof completed.completedAt, "string");
  const repeatedCompletion = await json(
    await api(owner, `/api/tasks/${taskId}/state`, {
      method: "PUT",
      body: JSON.stringify({ version: 3, status: "conclusao" }),
    }),
    200,
  );
  assert.equal(repeatedCompletion.version, 4);
  await expectStatus(
    await api(
      owner,
      `/api/tasks/${taskId}/subtasks/${String(pendingSubtask.id)}/state`,
      {
        method: "PUT",
        body: JSON.stringify({ version: 4, status: "pendente" }),
      },
    ),
    409,
    "Reabertura de subtarefa antes da tarefa",
  );

  const reopened = await json(
    await api(owner, `/api/tasks/${taskId}/state`, {
      method: "PUT",
      body: JSON.stringify({ version: 4, status: "producao" }),
    }),
    200,
  );
  assert.equal(reopened.version, 5);
  assert.equal(reopened.completedAt, null);
  const reopenedSubtask = await json(
    await api(
      owner,
      `/api/tasks/${taskId}/subtasks/${String(pendingSubtask.id)}/state`,
      {
        method: "PUT",
        body: JSON.stringify({ version: 5, status: "pendente" }),
      },
    ),
    200,
  );
  assert.equal(reopenedSubtask.version, 6);
  await expectStatus(
    await api(owner, `/api/tasks/${taskId}/state`, {
      method: "PUT",
      body: JSON.stringify({ version: 5, status: "fila" }),
    }),
    409,
    "Estado diferente com versão antiga",
  );

  await switchWorkspace(member, memberUser.personalWorkspaceId);
  await expectStatus(
    await api(member, `/api/tasks/${taskId}`),
    404,
    "Tarefa de outro workspace",
  );
  await expectStatus(
    await api(member, `/api/tasks/${randomUUID()}`),
    404,
    "Tarefa inexistente",
  );
  await expectStatus(
    await api(member, `/api/tasks/${taskId}?version=6`, { method: "DELETE" }),
    404,
    "Arquivamento de tarefa de outro workspace",
  );
  await expectStatus(
    await api(member, "/api/tasks/board", {
      method: "PUT",
      body: JSON.stringify({
        view: "priority",
        updates: [
          {
            id: taskId,
            version: 6,
            position: 0,
            columnKey: "alta",
          },
        ],
      }),
    }),
    404,
    "Batch da pauta contra tarefa de outro workspace",
  );
  await switchWorkspace(member, sharedWorkspaceId);

  await expectStatus(
    await api(owner, `/api/tasks/${taskId}?version=5`, { method: "DELETE" }),
    409,
    "Arquivamento com versão antiga",
  );
  const archived = await json(
    await api(owner, `/api/tasks/${taskId}?version=6`, { method: "DELETE" }),
    200,
  );
  assert.equal(archived.version, 7);
  assert.equal(typeof archived.archivedAt, "string");
  const repeatedArchive = await json(
    await api(owner, `/api/tasks/${taskId}?version=6`, { method: "DELETE" }),
    200,
  );
  assert.equal(repeatedArchive.version, 7);
  assert.equal(repeatedArchive.archivedAt, archived.archivedAt);
  await expectStatus(
    await api(owner, `/api/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(updateInput(archived)),
    }),
    409,
    "Edição de tarefa arquivada",
  );

  const active = await json(
    await api(owner, "/api/tasks?archived=exclude"),
    200,
  );
  const archivedList = await json(
    await api(owner, "/api/tasks?archived=only"),
    200,
  );
  assert.equal(active.total, 0);
  assert.equal(archivedList.total, 5);
  assert.deepEqual(
    new Set(ids(archivedList.items, "Tarefas arquivadas")),
    new Set([
      taskId,
      String(concurrencyProbe.id),
      String(archivedAtomicProbe.id),
      String(archivedBoardA.id),
      String(archivedBoardB.id),
    ]),
  );

  console.log(
    JSON.stringify({
      ok: true,
      authentication: true,
      crudAndFilters: true,
      aggregateVersioning: true,
      atomicAggregateStatus: true,
      batchBoard: true,
      batchRollback: true,
      boardOrderOwnership: true,
      idempotentState: true,
      completionAndReopening: true,
      versionConflict: true,
      antiIdorAndCrossTenant: true,
      idempotentArchive: true,
    }),
  );
}

try {
  await main();
} finally {
  try {
    await cleanup();
  } finally {
    await pool.end();
  }
}
