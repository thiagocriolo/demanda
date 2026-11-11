import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPool } from "mysql2/promise";

type Session = { cookie: string };
type JsonRecord = Record<string, unknown>;

const baseUrl = process.env.LIVE_BASE_URL ?? "http://127.0.0.1:5190";
const target = new URL(baseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
  throw new Error("A verificação HTTP só pode ser executada contra localhost.");
}
if (!process.env.MYSQL_URL && !process.env.DATABASE_URL) {
  throw new Error("MYSQL_URL não configurada.");
}

const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const ownerEmail = `be06-owner-${suffix}@example.test`;
const memberEmail = `be06-member-${suffix}@example.test`;
const ownerUsername = `be06_owner_${suffix}`.slice(0, 40);
const memberUsername = `be06_member_${suffix}`.slice(0, 40);
const password = "Be06Live2026!";
const mysqlPool = createPool({ uri: process.env.MYSQL_URL ?? process.env.DATABASE_URL });
const pool = {
  async query<T>(statement: string, values: unknown[] = []): Promise<{ rows: T[] }> {
    const [rows] = await mysqlPool.query(statement, values);
    return { rows: rows as T[] };
  },
  end: () => mysqlPool.end(),
};
let sharedWorkspaceId = "";

function sessionCookie(response: Response): string {
  const value = response.headers.get("set-cookie") ?? "";
  const match = /(?:^|,\s*)demanda_session=([^;]+)/u.exec(value);
  assert.ok(match?.[1], "O cadastro não retornou o cookie de sessão.");
  return `demanda_session=${match[1]}`;
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
  const body = (await response.json()) as JsonRecord;
  assert.equal(
    response.status,
    expectedStatus,
    `HTTP ${response.status}, esperado ${expectedStatus}: ${JSON.stringify(body)}`,
  );
  return body;
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
  profession: "Responsável comercial",
  linkedUserId: null,
  phones: [],
  emails: [],
  notes: [],
});

const businessInput = (responsibleContactIds: string[]) => ({
  name: "Expansão HTTP BE-06",
  category: "cliente_estrategico",
  stage: "proposta",
  responsibleContactIds,
  notes: [{ body: "Nota inicial" }],
});

async function idsForTemporaryUsers(): Promise<
  { id: string; email: string; personalWorkspaceId: string }[]
> {
  const result = await pool.query<{
    id: string;
    email: string;
    personal_workspace_id: string;
  }>(
    `select u.id, u.email, w.id as personal_workspace_id
       from users u
       join workspaces w
         on w.owner_user_id = u.id and w.kind = 'personal'
      where u.email in (?, ?)
      order by u.email`,
    [ownerEmail, memberEmail],
  );
  return result.rows.map((row) => ({
    id: row.id,
    email: row.email,
    personalWorkspaceId: row.personal_workspace_id,
  }));
}

async function cleanup(): Promise<void> {
  const users = await pool.query<{ id: string }>(
    `select id from users where email in (?, ?)`,
    [ownerEmail, memberEmail],
  );
  const ids = users.rows.map(({ id }) => id);
  if (!ids.length) return;
  await pool.query("begin");
  try {
    await pool.query(
      `delete from workspaces where owner_user_id in (${ids.map(() => "?").join(", ")})`,
      ids,
    );
    await pool.query(`delete from users where id in (${ids.map(() => "?").join(", ")})`, ids);
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

async function main(): Promise<void> {
  await waitForServer();
  const owner = await register(ownerUsername, ownerEmail);
  const member = await register(memberUsername, memberEmail);
  const users = await idsForTemporaryUsers();
  assert.equal(users.length, 2);
  const ownerUser = users.find(({ email }) => email === ownerEmail);
  const memberUser = users.find(({ email }) => email === memberEmail);
  assert.ok(ownerUser && memberUser);

  const foreignContact = await json(
    await api(owner, "/api/contacts", {
      method: "POST",
      body: JSON.stringify(contactInput("Contato do workspace pessoal")),
    }),
    201,
  );

  sharedWorkspaceId = randomUUID();
  await pool.query(
    `insert into workspaces (id, name, description, kind, owner_user_id)
     values (?, ?, ?, 'shared', ?)`,
    [sharedWorkspaceId, `BE-06 HTTP ${suffix}`, "Workspace temporário", ownerUser.id],
  );
  await pool.query(
    `insert into workspace_members (workspace_id, user_id, role)
     values (?, ?, 'owner'), (?, ?, 'member')`,
    [sharedWorkspaceId, ownerUser.id, sharedWorkspaceId, memberUser.id],
  );
  await switchWorkspace(owner, sharedWorkspaceId);
  await switchWorkspace(member, sharedWorkspaceId);

  const firstContact = await json(
    await api(owner, "/api/contacts", {
      method: "POST",
      body: JSON.stringify(contactInput("Ana Responsável")),
    }),
    201,
  );
  const secondContact = await json(
    await api(owner, "/api/contacts", {
      method: "POST",
      body: JSON.stringify(contactInput("Bruno Responsável")),
    }),
    201,
  );
  const firstContactId = String(firstContact.id);
  const secondContactId = String(secondContact.id);

  const injected = {
    ...businessInput([firstContactId]),
    workspaceId: randomUUID(),
  };
  assert.equal(
    (
      await api(owner, "/api/businesses", {
        method: "POST",
        body: JSON.stringify(injected),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(owner, "/api/businesses", {
        method: "POST",
        body: JSON.stringify(businessInput([String(foreignContact.id)])),
      })
    ).status,
    400,
  );

  const created = await json(
    await api(owner, "/api/businesses", {
      method: "POST",
      body: JSON.stringify(businessInput([firstContactId])),
    }),
    201,
  );
  const businessId = String(created.id);
  assert.equal(created.workspaceId, sharedWorkspaceId);

  const memberList = await json(
    await api(member, "/api/businesses?query=http&page=1&pageSize=10"),
    200,
  );
  assert.equal(memberList.workspaceId, sharedWorkspaceId);
  assert.equal(memberList.total, 1);

  const updatedInput = {
    ...businessInput([firstContactId, secondContactId]),
    name: "Expansão HTTP atualizada",
    stage: "negociacao",
    notes: [
      { body: "Primeira nota" },
      { body: "Segunda nota" },
      { body: "Terceira nota" },
    ],
  };
  const updated = await json(
    await api(owner, `/api/businesses/${businessId}`, {
      method: "PUT",
      body: JSON.stringify(updatedInput),
    }),
    200,
  );
  assert.deepEqual(
    (updated.notes as JsonRecord[]).map(({ body }) => body),
    ["Primeira nota", "Segunda nota", "Terceira nota"],
  );

  await json(
    await api(owner, `/api/contacts/${secondContactId}`, { method: "DELETE" }),
    200,
  );
  const retained = await json(
    await api(owner, `/api/businesses/${businessId}`, {
      method: "PUT",
      body: JSON.stringify(updatedInput),
    }),
    200,
  );
  const retainedResponsible = (retained.responsibles as JsonRecord[]).find(
    ({ contactId }) => contactId === secondContactId,
  );
  assert.ok(retainedResponsible?.archivedAt);
  assert.equal(
    (
      await api(owner, "/api/businesses", {
        method: "POST",
        body: JSON.stringify(businessInput([secondContactId])),
      })
    ).status,
    400,
  );

  await switchWorkspace(member, memberUser.personalWorkspaceId);
  assert.equal(
    (await api(member, `/api/businesses/${businessId}`)).status,
    404,
  );
  assert.equal(
    (await api(member, `/api/businesses/${randomUUID()}`)).status,
    404,
  );

  await json(
    await api(owner, `/api/businesses/${businessId}`, { method: "DELETE" }),
    200,
  );
  await json(
    await api(owner, `/api/businesses/${businessId}`, { method: "DELETE" }),
    200,
  );
  const activeList = await json(
    await api(owner, "/api/businesses?archived=exclude"),
    200,
  );
  const archivedList = await json(
    await api(owner, "/api/businesses?archived=only"),
    200,
  );
  assert.equal(activeList.total, 0);
  assert.equal(archivedList.total, 1);

  console.log(
    JSON.stringify({
      ok: true,
      checks: 18,
      workspaceIsolation: true,
      notesInOrder: 3,
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
