import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

type Session = { cookie: string };
type JsonRecord = Record<string, unknown>;

const baseUrl = process.env.LIVE_BASE_URL ?? "http://127.0.0.1:5190";
const target = new URL(baseUrl);
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname)) {
  throw new Error("A verificação HTTP só pode ser executada contra localhost.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const ownerEmail = `be07-owner-${suffix}@example.test`;
const memberEmail = `be07-member-${suffix}@example.test`;
const ownerUsername = `be07_owner_${suffix}`.slice(0, 40);
const memberUsername = `be07_member_${suffix}`.slice(0, 40);
const password = "Be07Live2026!";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function sessionCookie(response: Response): string {
  const value = response.headers.get("set-cookie") ?? "";
  const match = /(?:^|,\s*)demanda_session=([^;]+)/u.exec(value);
  assert.ok(match?.[1], "O cadastro não retornou o cookie de sessão.");
  return `demanda_session=${match[1]}`;
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
  assert.ok(
    body !== null && typeof body === "object" && !Array.isArray(body),
    "A resposta HTTP não é um objeto JSON.",
  );
  return body as JsonRecord;
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

const contactInput = (name: string) => ({
  name,
  contactType: "person",
  status: "active",
  profession: "Responsável pelo projeto",
  linkedUserId: null,
  phones: [],
  emails: [],
  notes: [],
});

const businessInput = (name: string, responsibleContactId: string) => ({
  name,
  category: "cliente_estrategico",
  stage: "proposta",
  responsibleContactIds: [responsibleContactId],
  notes: [{ body: "Negócio temporário do verificador BE-07" }],
});

function serviceInput(
  name: string,
  responsibleUserIds: string[],
  overrides: JsonRecord = {},
): JsonRecord {
  return {
    name,
    description: `Descrição de ${name}`,
    icon: "briefcase-business",
    color: "violet",
    defaultStatus: "planejamento",
    defaultDurationDays: 30,
    defaultBriefing: `Briefing de ${name}`,
    tagLabels: ["Branding", "Estratégia"],
    responsibleUserIds,
    defaultContractType: "one_off",
    defaultAmountCents: 10_001,
    defaultInstallmentCount: 3,
    defaultPaymentMethod: "Pix",
    defaultPaymentTerms: "Três parcelas mensais",
    defaultFinanceNotes: "Snapshot financeiro do modelo",
    ...overrides,
  };
}

function projectInput(
  name: string,
  businessId: string,
  serviceIds: string[],
  responsibleUserIds: string[],
): JsonRecord {
  return {
    name,
    businessId,
    serviceIds,
    status: "revisao",
    startDate: "2028-04-15",
    endDate: "2028-06-15",
    briefing: "Briefing editado pelo verificador HTTP",
    tagLabels: ["Projeto atualizado"],
    responsibleUserIds,
    contractType: "one_off",
    amountCents: 12_000,
    firstDueDate: "2028-04-15",
    paymentMethod: "Boleto",
    paymentTerms: "Duas parcelas",
    financeNotes: "Condições atualizadas",
    installments: [
      {
        number: 1,
        dueDate: "2028-04-15",
        amountCents: 6_000,
        status: "pending",
      },
      {
        number: 2,
        dueDate: "2028-05-15",
        amountCents: 6_000,
        status: "pending",
      },
    ],
  };
}

async function idsForTemporaryUsers(): Promise<
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

async function createBusiness(
  session: Session,
  contactName: string,
  businessName: string,
): Promise<JsonRecord> {
  const contact = await json(
    await api(session, "/api/contacts", {
      method: "POST",
      body: JSON.stringify(contactInput(contactName)),
    }),
    201,
  );
  return json(
    await api(session, "/api/businesses", {
      method: "POST",
      body: JSON.stringify(businessInput(businessName, String(contact.id))),
    }),
    201,
  );
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
    await fetch(`${baseUrl}/api/projects`, {
      headers: { accept: "application/json" },
    }),
    401,
    "Projetos sem autenticação",
  );

  const owner = await register(ownerUsername, ownerEmail);
  const member = await register(memberUsername, memberEmail);
  const users = await idsForTemporaryUsers();
  assert.equal(users.length, 2);
  const ownerUser = users.find(({ email }) => email === ownerEmail);
  const memberUser = users.find(({ email }) => email === memberEmail);
  assert.ok(ownerUser && memberUser);

  const foreignBusiness = await createBusiness(
    member,
    "Contato estrangeiro BE-07",
    `Negócio estrangeiro ${suffix}`,
  );
  const foreignService = await json(
    await api(member, "/api/services", {
      method: "POST",
      body: JSON.stringify(
        serviceInput(`Serviço estrangeiro ${suffix}`, [memberUser.id]),
      ),
    }),
    201,
  );
  assert.equal(foreignService.workspaceId, memberUser.personalWorkspaceId);

  const workspace = await pool.query<{ id: string }>(
    `insert into app.workspaces (name, description, kind, owner_user_id)
     values ($1, $2, 'shared', $3)
     returning id`,
    [`BE-07 HTTP ${suffix}`, "Workspace temporário", ownerUser.id],
  );
  const sharedWorkspaceId = workspace.rows[0]?.id ?? "";
  assert.ok(sharedWorkspaceId);
  await pool.query(
    `insert into app.workspace_members (workspace_id, user_id, role)
     values ($1, $2, 'member')`,
    [sharedWorkspaceId, memberUser.id],
  );
  await switchWorkspace(owner, sharedWorkspaceId);
  await switchWorkspace(member, sharedWorkspaceId);

  const localBusiness = await createBusiness(
    owner,
    "Contato local BE-07",
    `Cliente modelo ${suffix}`,
  );
  assert.equal(localBusiness.workspaceId, sharedWorkspaceId);

  const sourceServiceName = `Modelo principal ${suffix}`;
  const sourceServiceInput = serviceInput(sourceServiceName, [ownerUser.id], {
    defaultStatus: "execucao",
    defaultBriefing: "Snapshot original do modelo",
    tagLabels: ["Original", "Branding"],
  });

  await expectStatus(
    await api(owner, "/api/services", {
      method: "POST",
      body: JSON.stringify({
        ...sourceServiceInput,
        name: `Workspace injetado ${suffix}`,
        workspaceId: randomUUID(),
      }),
    }),
    400,
    "workspaceId injetado no serviço",
  );

  const sourceService = await json(
    await api(owner, "/api/services", {
      method: "POST",
      body: JSON.stringify(sourceServiceInput),
    }),
    201,
  );
  const sourceServiceId = String(sourceService.id);
  assert.equal(sourceService.workspaceId, sharedWorkspaceId);
  assert.equal(sourceService.defaultStatus, "execucao");
  assert.equal(sourceService.defaultBriefing, "Snapshot original do modelo");
  assert.equal(sourceService.defaultAmountCents, 10_001);
  assert.equal(sourceService.defaultInstallmentCount, 3);
  assert.deepEqual(
    asRecords(sourceService.tags, "Tags do serviço").map(({ name }) => name),
    ["Original", "Branding"],
  );
  assert.deepEqual(
    asRecords(sourceService.responsibles, "Responsáveis do serviço").map(
      ({ userId }) => userId,
    ),
    [ownerUser.id],
  );

  const additionalService = await json(
    await api(owner, "/api/services", {
      method: "POST",
      body: JSON.stringify(
        serviceInput(`Serviço complementar ${suffix}`, [memberUser.id], {
          tagLabels: ["Complementar"],
        }),
      ),
    }),
    201,
  );
  const additionalServiceId = String(additionalService.id);

  const rollbackTag = `Rollback ${suffix}`;
  await expectStatus(
    await api(owner, "/api/services", {
      method: "POST",
      body: JSON.stringify(
        serviceInput(sourceServiceName, [ownerUser.id], {
          tagLabels: [rollbackTag],
        }),
      ),
    }),
    409,
    "Serviço duplicado para prova de rollback",
  );
  const rollbackProof = await pool.query<{
    services: number;
    tags: number;
  }>(
    `select
       (select count(*)::int from app.services
         where workspace_id = $1 and lower(name) = lower($2)) as services,
       (select count(*)::int from app.tags
         where workspace_id = $1 and label = $3) as tags`,
    [sharedWorkspaceId, sourceServiceName, rollbackTag],
  );
  assert.deepEqual(rollbackProof.rows[0], { services: 1, tags: 0 });

  const modelProjectInput = {
    serviceId: sourceServiceId,
    additionalServiceIds: [additionalServiceId],
    name: `Projeto materializado ${suffix}`,
    businessId: String(localBusiness.id),
    startDate: "2028-01-31",
  };

  await expectStatus(
    await api(owner, "/api/projects/from-service", {
      method: "POST",
      body: JSON.stringify({
        ...modelProjectInput,
        name: `Projeto com workspace injetado ${suffix}`,
        workspaceId: randomUUID(),
      }),
    }),
    400,
    "workspaceId injetado no projeto",
  );
  await expectStatus(
    await api(owner, "/api/projects/from-service", {
      method: "POST",
      body: JSON.stringify({
        ...modelProjectInput,
        name: `Projeto com negócio externo ${suffix}`,
        businessId: String(foreignBusiness.id),
      }),
    }),
    400,
    "businessId de outro workspace",
  );
  await expectStatus(
    await api(owner, "/api/projects/from-service", {
      method: "POST",
      body: JSON.stringify({
        ...modelProjectInput,
        name: `Projeto com serviço externo ${suffix}`,
        serviceId: String(foreignService.id),
        additionalServiceIds: [],
      }),
    }),
    400,
    "serviceId de outro workspace",
  );
  await expectStatus(
    await api(owner, "/api/projects/from-service", {
      method: "POST",
      body: JSON.stringify({
        ...modelProjectInput,
        name: `Projeto com serviço adicional externo ${suffix}`,
        additionalServiceIds: [String(foreignService.id)],
      }),
    }),
    400,
    "additionalServiceId de outro workspace",
  );
  const emptyProjectList = await json(
    await api(owner, "/api/projects?archived=include"),
    200,
  );
  assert.equal(emptyProjectList.total, 0);

  const created = await json(
    await api(owner, "/api/projects/from-service", {
      method: "POST",
      body: JSON.stringify(modelProjectInput),
    }),
    201,
  );
  const projectId = String(created.id);
  assert.equal(created.workspaceId, sharedWorkspaceId);
  assert.equal(created.sourceServiceId, sourceServiceId);
  assert.equal(created.status, "execucao");
  assert.equal(created.briefing, "Snapshot original do modelo");
  assert.equal(created.startDate, "2028-01-31");
  assert.equal(created.endDate, "2028-03-01");
  assert.equal(created.contractType, "one_off");
  assert.equal(created.amountCents, 10_001);
  assert.equal(created.firstDueDate, "2028-01-31");
  assert.equal(created.paymentMethod, "Pix");
  assert.equal((created.business as JsonRecord).id, String(localBusiness.id));
  assert.deepEqual(ids(created.services, "Serviços do projeto"), [
    sourceServiceId,
    additionalServiceId,
  ]);
  assert.deepEqual(
    asRecords(created.tags, "Tags do projeto").map(({ name }) => name),
    ["Original", "Branding"],
  );
  assert.deepEqual(
    asRecords(created.responsibles, "Responsáveis do projeto").map(
      ({ userId }) => userId,
    ),
    [ownerUser.id],
  );
  assert.deepEqual(
    asRecords(created.installments, "Parcelas do projeto").map(
      ({ number, dueDate, amountCents, status }) => ({
        number,
        dueDate,
        amountCents,
        status,
      }),
    ),
    [
      {
        number: 1,
        dueDate: "2028-01-31",
        amountCents: 3_333,
        status: "pending",
      },
      {
        number: 2,
        dueDate: "2028-02-29",
        amountCents: 3_333,
        status: "pending",
      },
      {
        number: 3,
        dueDate: "2028-03-31",
        amountCents: 3_335,
        status: "pending",
      },
    ],
  );

  const serviceSearch = await json(
    await api(
      member,
      `/api/services?${new URLSearchParams({
        query: "Modelo principal",
        page: "1",
        pageSize: "10",
      })}`,
    ),
    200,
  );
  assert.equal(serviceSearch.workspaceId, sharedWorkspaceId);
  assert.equal(serviceSearch.total, 1);
  assert.equal(
    ids(serviceSearch.items, "Resultado de serviços")[0],
    sourceServiceId,
  );

  const projectFilters = new URLSearchParams({
    query: "Projeto materializado",
    status: "execucao",
    businessId: String(localBusiness.id),
    serviceId: sourceServiceId,
    responsibleUserId: ownerUser.id,
    startFrom: "2028-01-01",
    startTo: "2028-02-01",
    endFrom: "2028-03-01",
    endTo: "2028-03-31",
    page: "1",
    pageSize: "10",
  });
  const filtered = await json(
    await api(member, `/api/projects?${projectFilters}`),
    200,
  );
  assert.equal(filtered.workspaceId, sharedWorkspaceId);
  assert.equal(filtered.total, 1);
  assert.deepEqual(ids(filtered.items, "Projetos filtrados"), [projectId]);
  assert.deepEqual(filtered.facets, {
    all: 1,
    archived: 0,
    statuses: { execucao: 1 },
    services: {
      [sourceServiceId]: 1,
      [additionalServiceId]: 1,
    },
  });

  const options = await json(await api(member, "/api/projects/options"), 200);
  assert.equal(options.workspaceId, sharedWorkspaceId);
  assert.deepEqual(
    asRecords(options.members, "Membros das opções")
      .map(({ userId }) => String(userId))
      .sort(),
    [ownerUser.id, memberUser.id].sort(),
  );
  assert.ok(
    ids(options.services, "Serviços das opções").includes(sourceServiceId),
  );

  const changedSourceInput = serviceInput(
    `Modelo alterado ${suffix}`,
    [memberUser.id],
    {
      defaultStatus: "concluido",
      defaultDurationDays: 5,
      defaultBriefing: "Novo briefing do modelo",
      tagLabels: ["Nova tag do modelo"],
      defaultAmountCents: 999,
      defaultInstallmentCount: 1,
      defaultPaymentMethod: "Cartão",
    },
  );
  await json(
    await api(owner, `/api/services/${sourceServiceId}`, {
      method: "PUT",
      body: JSON.stringify(changedSourceInput),
    }),
    200,
  );
  const snapshot = await json(
    await api(owner, `/api/projects/${projectId}`),
    200,
  );
  assert.equal(snapshot.status, "execucao");
  assert.equal(snapshot.briefing, "Snapshot original do modelo");
  assert.equal(snapshot.endDate, "2028-03-01");
  assert.equal(snapshot.amountCents, 10_001);
  assert.deepEqual(
    asRecords(snapshot.tags, "Tags preservadas").map(({ name }) => name),
    ["Original", "Branding"],
  );
  assert.deepEqual(
    asRecords(snapshot.responsibles, "Responsáveis preservados").map(
      ({ userId }) => userId,
    ),
    [ownerUser.id],
  );
  assert.equal(
    asRecords(snapshot.installments, "Parcelas preservadas").length,
    3,
  );

  const edited = await json(
    await api(owner, `/api/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify(
        projectInput(
          `Projeto atualizado ${suffix}`,
          String(localBusiness.id),
          [sourceServiceId, additionalServiceId],
          [ownerUser.id, memberUser.id],
        ),
      ),
    }),
    200,
  );
  assert.equal(edited.name, `Projeto atualizado ${suffix}`);
  assert.equal(edited.status, "revisao");
  assert.equal(edited.amountCents, 12_000);
  assert.deepEqual(
    asRecords(edited.tags, "Tags editadas").map(({ name }) => name),
    ["Projeto atualizado"],
  );
  assert.deepEqual(
    asRecords(edited.responsibles, "Responsáveis editados").map(
      ({ userId }) => userId,
    ),
    [ownerUser.id, memberUser.id],
  );
  assert.deepEqual(
    asRecords(edited.installments, "Parcelas editadas").map(
      ({ amountCents }) => amountCents,
    ),
    [6_000, 6_000],
  );

  await switchWorkspace(member, memberUser.personalWorkspaceId);
  await expectStatus(
    await api(member, `/api/projects/${projectId}`),
    404,
    "Projeto de outro workspace",
  );
  await expectStatus(
    await api(member, `/api/projects/${randomUUID()}`),
    404,
    "Projeto inexistente",
  );
  await expectStatus(
    await api(member, `/api/services/${sourceServiceId}`),
    404,
    "Serviço de outro workspace",
  );
  await switchWorkspace(member, sharedWorkspaceId);

  await json(
    await api(owner, `/api/projects/${projectId}`, { method: "DELETE" }),
    200,
  );
  await json(
    await api(owner, `/api/projects/${projectId}`, { method: "DELETE" }),
    200,
  );
  const activeProjects = await json(
    await api(owner, "/api/projects?archived=exclude"),
    200,
  );
  const archivedProjects = await json(
    await api(owner, "/api/projects?archived=only"),
    200,
  );
  assert.equal(activeProjects.total, 0);
  assert.equal(archivedProjects.total, 1);
  assert.deepEqual(ids(archivedProjects.items, "Projetos arquivados"), [
    projectId,
  ]);

  await json(
    await api(owner, `/api/services/${sourceServiceId}`, { method: "DELETE" }),
    200,
  );
  await json(
    await api(owner, `/api/services/${sourceServiceId}`, { method: "DELETE" }),
    200,
  );
  const archivedServices = await json(
    await api(owner, "/api/services?archived=only"),
    200,
  );
  assert.equal(archivedServices.total, 1);
  assert.deepEqual(ids(archivedServices.items, "Serviços arquivados"), [
    sourceServiceId,
  ]);

  console.log(
    JSON.stringify({
      ok: true,
      authentication: true,
      defaultsAndSnapshot: true,
      installmentsAndRelations: true,
      filteringAndCrud: true,
      workspaceInjectionRejected: true,
      antiIdorAndCrossTenant: true,
      atomicRollback: true,
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
