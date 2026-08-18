import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const schemaName = `be08_schema_test_${randomUUID().replaceAll("-", "")}`;
const schemaIdentifier = `"${schemaName}"`;
const validTestSchema = /^be08_schema_test_[0-9a-f]{32}$/;

type TaskTable =
  | "users"
  | "workspaces"
  | "workspace_members"
  | "businesses"
  | "projects"
  | "tags"
  | "tasks"
  | "task_subtasks"
  | "task_responsibles"
  | "task_tags";

type TaskValues = {
  name?: string;
  categoryKey?: string | null;
  priorityKey?: string;
  statusKey?: string;
  dueDate?: string | null;
  sortOrder?: number;
  boardOrder?: Record<string, unknown> | unknown[];
  version?: number;
  completedAt?: string | null;
  archivedAt?: string | null;
};

type SubtaskValues = {
  name?: string;
  durationMinutes?: number;
  statusKey?: string;
  sortOrder?: number;
  completedAt?: string | null;
  archivedAt?: string | null;
};

let pool: Pool;

function table(name: TaskTable): string {
  return `${schemaIdentifier}."${name}"`;
}

async function loadMigrations(): Promise<string[]> {
  const migrationsPath = join(process.cwd(), "drizzle");
  const filenames = (await readdir(migrationsPath))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();
  if (!filenames.length) throw new Error("Nenhuma migration SQL encontrada.");

  return Promise.all(
    filenames.map(async (filename) => {
      const migration = await readFile(join(migrationsPath, filename), "utf8");
      if (
        /create\s+extension/i.test(migration) ||
        migration.includes('"public"')
      ) {
        throw new Error(`${filename} contem operacao fora do schema isolado.`);
      }
      const isolated = migration.replaceAll('"app"', schemaIdentifier);
      if (isolated.includes('"app"')) {
        throw new Error(
          `${filename} manteve referencia ao schema da aplicacao.`,
        );
      }
      return isolated;
    }),
  );
}

async function dropTestSchema(): Promise<void> {
  if (!pool || !validTestSchema.test(schemaName)) return;
  await pool.query(`drop schema if exists ${schemaIdentifier} cascade`);
}

async function insertUser(label = "Usuario BE-08"): Promise<string> {
  const id = randomUUID();
  const suffix = randomUUID().replaceAll("-", "");
  await pool.query(
    `insert into ${table("users")} (id, name, username, email)
     values ($1, $2, $3, $4)`,
    [id, label, `user_${suffix}`, `user-${suffix}@example.test`],
  );
  return id;
}

async function insertWorkspace(
  ownerUserId: string,
  name = "Workspace BE-08",
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into ${table("workspaces")} (id, name, owner_user_id)
     values ($1, $2, $3)`,
    [id, name, ownerUserId],
  );
  return id;
}

async function insertMember(
  workspaceId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `insert into ${table("workspace_members")}
       (workspace_id, user_id, role)
     values ($1, $2, 'member')`,
    [workspaceId, userId],
  );
}

async function insertBusiness(
  workspaceId: string,
  ownerUserId: string,
  name = "Negocio BE-08",
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `insert into ${table("businesses")}
       (workspace_id, owner_user_id, name, category_key, stage_key)
     values ($1, $2, $3, 'outro', 'ativo')
     returning id`,
    [workspaceId, ownerUserId, name],
  );
  return result.rows[0].id;
}

async function insertProject(
  workspaceId: string,
  businessId: string,
  name = "Projeto BE-08",
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `insert into ${table("projects")}
       (workspace_id, business_id, name, status_key, start_date, end_date)
     values ($1, $2, $3, 'planejamento', '2026-07-01', '2026-07-31')
     returning id`,
    [workspaceId, businessId, name],
  );
  return result.rows[0].id;
}

async function insertTag(
  workspaceId: string,
  key = `tag_${randomUUID().replaceAll("-", "")}`,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `insert into ${table("tags")} (workspace_id, key, label)
     values ($1, $2, $3)
     returning id`,
    [workspaceId, key, `Tag ${key}`],
  );
  return result.rows[0].id;
}

async function insertTask(
  workspaceId: string,
  projectId: string,
  businessId: string,
  values: TaskValues = {},
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `insert into ${table("tasks")}
       (workspace_id, project_id, business_id, name, description,
        category_key, priority_key, status_key, due_date, sort_order,
        board_order, version, completed_at, archived_at)
     values ($1, $2, $3, $4, 'Briefing da tarefa', $5, $6, $7, $8, $9,
       $10::jsonb, $11, $12::timestamptz, $13::timestamptz)
     returning id`,
    [
      workspaceId,
      projectId,
      businessId,
      values.name ?? `Tarefa ${randomUUID()}`,
      values.categoryKey === undefined ? "criacao" : values.categoryKey,
      values.priorityKey ?? "normal",
      values.statusKey ?? "planejamento",
      values.dueDate === undefined ? "2026-07-20" : values.dueDate,
      values.sortOrder ?? 0,
      JSON.stringify(values.boardOrder ?? {}),
      values.version ?? 1,
      values.completedAt ?? null,
      values.archivedAt ?? null,
    ],
  );
  return result.rows[0].id;
}

async function insertSubtask(
  workspaceId: string,
  taskId: string,
  values: SubtaskValues = {},
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `insert into ${table("task_subtasks")}
       (workspace_id, task_id, name, duration_minutes, status_key,
        sort_order, completed_at, archived_at)
     values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz)
     returning id`,
    [
      workspaceId,
      taskId,
      values.name ?? `Subtarefa ${randomUUID()}`,
      values.durationMinutes ?? 60,
      values.statusKey ?? "pendente",
      values.sortOrder ?? 0,
      values.completedAt ?? null,
      values.archivedAt ?? null,
    ],
  );
  return result.rows[0].id;
}

describe("BE-08: schema de tarefas e subtarefas", () => {
  beforeAll(async () => {
    pool = createDatabasePool(parseServerEnvironment(process.env));
    try {
      for (const migration of await loadMigrations()) {
        await pool.query(migration);
      }
    } catch (error) {
      await dropTestSchema();
      throw error;
    }
  });

  afterAll(async () => {
    if (!pool) return;
    await dropTestSchema();
    await pool.end();
  });

  it("cria quatro tabelas tipadas e indices multi-tenant", async () => {
    const expectedTables = [
      "task_responsibles",
      "task_subtasks",
      "task_tags",
      "tasks",
    ];
    const tables = await pool.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = $1 and table_name = any($2::text[])
       order by table_name`,
      [schemaName, expectedTables],
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual(
      expectedTables,
    );

    const typedColumns = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `select table_name, column_name, data_type
       from information_schema.columns
       where table_schema = $1 and (
         (table_name = 'tasks' and column_name in (
           'due_date', 'sort_order', 'board_order', 'version',
           'completed_at', 'archived_at'
         )) or
         (table_name = 'task_subtasks' and column_name in (
           'duration_minutes', 'sort_order', 'completed_at', 'archived_at'
         ))
       )`,
      [schemaName],
    );
    expect(typedColumns.rows).toEqual(
      expect.arrayContaining([
        { table_name: "tasks", column_name: "due_date", data_type: "date" },
        {
          table_name: "tasks",
          column_name: "board_order",
          data_type: "jsonb",
        },
        {
          table_name: "tasks",
          column_name: "version",
          data_type: "integer",
        },
        {
          table_name: "task_subtasks",
          column_name: "duration_minutes",
          data_type: "integer",
        },
      ]),
    );

    const expectedIndexes = [
      "tasks_workspace_updated_id_index",
      "tasks_workspace_project_archived_order_index",
      "tasks_workspace_business_archived_order_index",
      "tasks_workspace_status_archived_order_index",
      "tasks_workspace_priority_archived_order_index",
      "tasks_workspace_due_completion_archive_index",
      "tasks_workspace_name_lower_index",
      "task_subtasks_workspace_task_archived_order_index",
      "task_subtasks_workspace_status_completion_index",
      "task_responsibles_workspace_user_task_index",
      "task_tags_workspace_tag_task_index",
    ];
    const indexes = await pool.query<{ indexname: string }>(
      `select indexname from pg_indexes
       where schemaname = $1 and indexname = any($2::text[])`,
      [schemaName, expectedIndexes],
    );
    expect(indexes.rows.map(({ indexname }) => indexname).sort()).toEqual(
      expectedIndexes.sort(),
    );

    const projectKey = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
       from pg_constraint
       where connamespace = $1::regnamespace
         and conname = 'projects_workspace_id_business_id_unique'`,
      [schemaName],
    );
    expect(projectKey.rows[0]?.definition).toContain(
      "UNIQUE (workspace_id, id, business_id)",
    );
  });

  it("persiste o agregado com ordem, duracao, responsaveis e tags", async () => {
    const ownerId = await insertUser();
    const memberId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    await insertMember(workspaceId, memberId);
    const businessId = await insertBusiness(workspaceId, ownerId);
    const projectId = await insertProject(workspaceId, businessId);
    const tagId = await insertTag(workspaceId, "entrega");
    const taskId = await insertTask(workspaceId, projectId, businessId, {
      name: "Apresentar identidade",
      priorityKey: "urgente",
      statusKey: "producao",
      sortOrder: 7,
      boardOrder: { status: 2, priority: 0, business: 3, project: 1 },
    });
    await insertSubtask(workspaceId, taskId, {
      name: "Montar apresentação",
      durationMinutes: 90,
      sortOrder: 0,
    });
    await insertSubtask(workspaceId, taskId, {
      name: "Revisar arquivo",
      durationMinutes: 60,
      statusKey: "concluida",
      completedAt: "2030-01-01T00:00:00.000Z",
      sortOrder: 1,
    });
    await pool.query(
      `insert into ${table("task_responsibles")}
         (workspace_id, task_id, user_id, sort_order)
       values ($1, $2, $3, 0)`,
      [workspaceId, taskId, ownerId],
    );
    await expect(
      pool.query(
        `insert into ${table("task_responsibles")}
           (workspace_id, task_id, user_id, sort_order)
         values ($1, $2, $3, 1)`,
        [workspaceId, taskId, memberId],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "task_responsibles_workspace_task_unique",
    });
    await pool.query(
      `insert into ${table("task_tags")}
         (workspace_id, task_id, tag_id, sort_order)
       values ($1, $2, $3, 0)`,
      [workspaceId, taskId, tagId],
    );

    const result = await pool.query<{
      workspace_id: string;
      project_id: string;
      business_id: string;
      priority_key: string;
      status_key: string;
      sort_order: number;
      board_order: Record<string, number>;
      version: number;
      subtasks: { name: string; durationMinutes: number; sortOrder: number }[];
      responsible_ids: string[];
      tag_ids: string[];
    }>(
      `select t.workspace_id, t.project_id, t.business_id, t.priority_key,
              t.status_key, t.sort_order, t.board_order, t.version,
              (select jsonb_agg(jsonb_build_object(
                 'name', s.name,
                 'durationMinutes', s.duration_minutes,
                 'sortOrder', s.sort_order
               ) order by s.sort_order, s.id)
                 from ${table("task_subtasks")} s
                where s.workspace_id = t.workspace_id and s.task_id = t.id)
                as subtasks,
              (select array_agg(r.user_id order by r.sort_order, r.user_id)
                 from ${table("task_responsibles")} r
                where r.workspace_id = t.workspace_id and r.task_id = t.id)
                as responsible_ids,
              (select array_agg(tt.tag_id order by tt.sort_order, tt.tag_id)
                 from ${table("task_tags")} tt
                where tt.workspace_id = t.workspace_id and tt.task_id = t.id)
                as tag_ids
         from ${table("tasks")} t
        where t.workspace_id = $1 and t.id = $2`,
      [workspaceId, taskId],
    );
    expect(result.rows[0]).toMatchObject({
      workspace_id: workspaceId,
      project_id: projectId,
      business_id: businessId,
      priority_key: "urgente",
      status_key: "producao",
      sort_order: 7,
      board_order: { status: 2, priority: 0, business: 3, project: 1 },
      version: 1,
      subtasks: [
        { name: "Montar apresentação", durationMinutes: 90, sortOrder: 0 },
        { name: "Revisar arquivo", durationMinutes: 60, sortOrder: 1 },
      ],
      responsible_ids: [ownerId],
      tag_ids: [tagId],
    });
  });

  it("impede projeto, negocio, membro, tag e filhos de outro workspace", async () => {
    const ownerAId = await insertUser("Owner A");
    const ownerBId = await insertUser("Owner B");
    const workspaceAId = await insertWorkspace(ownerAId, "Workspace A");
    const workspaceBId = await insertWorkspace(ownerBId, "Workspace B");
    const privateWorkspaceAId = await insertWorkspace(
      ownerAId,
      "Registros privados A",
    );
    const businessAId = await insertBusiness(
      privateWorkspaceAId,
      ownerAId,
      "Negocio A",
    );
    const otherBusinessAId = await insertBusiness(
      privateWorkspaceAId,
      ownerAId,
      "Outro negocio A",
    );
    const businessBId = await insertBusiness(
      workspaceBId,
      ownerBId,
      "Negocio B",
    );
    const projectAId = await insertProject(
      workspaceAId,
      businessAId,
      "Projeto A",
    );
    const projectBId = await insertProject(
      workspaceBId,
      businessBId,
      "Projeto B",
    );
    const taskAId = await insertTask(workspaceAId, projectAId, businessAId);
    const tagBId = await insertTag(workspaceBId, "tag_b");

    await expect(
      insertTask(workspaceAId, projectAId, otherBusinessAId),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "tasks_workspace_project_business_foreign_key",
    });
    await expect(
      insertTask(workspaceAId, projectBId, businessBId),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "tasks_workspace_project_business_foreign_key",
    });
    await expect(insertSubtask(workspaceBId, taskAId)).rejects.toMatchObject({
      code: "23503",
      constraint: "task_subtasks_workspace_task_foreign_key",
    });
    await expect(
      pool.query(
        `insert into ${table("task_responsibles")}
           (workspace_id, task_id, user_id)
         values ($1, $2, $3)`,
        [workspaceAId, taskAId, ownerBId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "task_responsibles_workspace_member_foreign_key",
    });
    await expect(
      pool.query(
        `insert into ${table("task_tags")}
           (workspace_id, task_id, tag_id)
         values ($1, $2, $3)`,
        [workspaceAId, taskAId, tagBId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "task_tags_workspace_tag_foreign_key",
    });
  });

  it("valida ciclo de vida, versao, ordem, board e duracao", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const businessId = await insertBusiness(workspaceId, ownerId);
    const projectId = await insertProject(workspaceId, businessId);
    const taskId = await insertTask(workspaceId, projectId, businessId);

    const invalidTasks = [
      () => insertTask(workspaceId, projectId, businessId, { name: "   " }),
      () =>
        insertTask(workspaceId, projectId, businessId, {
          priorityKey: "Alta Prioridade",
        }),
      () =>
        insertTask(workspaceId, projectId, businessId, {
          statusKey: "arquivado",
        }),
      () => insertTask(workspaceId, projectId, businessId, { sortOrder: -1 }),
      () => insertTask(workspaceId, projectId, businessId, { version: 0 }),
      () =>
        insertTask(workspaceId, projectId, businessId, {
          boardOrder: { client: 1 },
        }),
      () =>
        insertTask(workspaceId, projectId, businessId, {
          boardOrder: { status: -1 },
        }),
      () =>
        insertTask(workspaceId, projectId, businessId, {
          boardOrder: { status: "primeiro" },
        }),
      () =>
        insertTask(workspaceId, projectId, businessId, {
          statusKey: "conclusao",
        }),
      () =>
        insertTask(workspaceId, projectId, businessId, {
          completedAt: "2030-01-01T00:00:00.000Z",
        }),
    ];
    for (const invalid of invalidTasks) {
      await expect(invalid()).rejects.toMatchObject({ code: "23514" });
    }

    const invalidSubtasks = [
      () => insertSubtask(workspaceId, taskId, { name: "   " }),
      () => insertSubtask(workspaceId, taskId, { durationMinutes: 15 }),
      () => insertSubtask(workspaceId, taskId, { durationMinutes: 10_110 }),
      () => insertSubtask(workspaceId, taskId, { statusKey: "arquivado" }),
      () => insertSubtask(workspaceId, taskId, { sortOrder: -1 }),
      () => insertSubtask(workspaceId, taskId, { statusKey: "concluida" }),
      () =>
        insertSubtask(workspaceId, taskId, {
          completedAt: "2030-01-01T00:00:00.000Z",
        }),
    ];
    for (const invalid of invalidSubtasks) {
      await expect(invalid()).rejects.toMatchObject({ code: "23514" });
    }

    await expect(
      pool.query(
        `update ${table("tasks")}
         set archived_at = created_at - interval '1 second'
         where workspace_id = $1 and id = $2`,
        [workspaceId, taskId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "tasks_archive_not_before_creation",
    });
  });

  it("suporta compare-and-swap pela versao do agregado", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const businessId = await insertBusiness(workspaceId, ownerId);
    const projectId = await insertProject(workspaceId, businessId);
    const taskId = await insertTask(workspaceId, projectId, businessId);

    const winner = await pool.query<{ version: number }>(
      `update ${table("tasks")}
       set name = 'Primeira gravacao', version = version + 1, updated_at = now()
       where workspace_id = $1 and id = $2 and version = $3
       returning version`,
      [workspaceId, taskId, 1],
    );
    const stale = await pool.query<{ version: number }>(
      `update ${table("tasks")}
       set name = 'Gravacao obsoleta', version = version + 1, updated_at = now()
       where workspace_id = $1 and id = $2 and version = $3
       returning version`,
      [workspaceId, taskId, 1],
    );
    expect(winner.rows).toEqual([{ version: 2 }]);
    expect(stale.rows).toEqual([]);

    const retained = await pool.query<{ name: string; version: number }>(
      `select name, version from ${table("tasks")}
       where workspace_id = $1 and id = $2`,
      [workspaceId, taskId],
    );
    expect(retained.rows[0]).toEqual({
      name: "Primeira gravacao",
      version: 2,
    });
  });

  it("propaga negocio do projeto e aplica cascades sem apagar catalogos", async () => {
    const ownerId = await insertUser();
    const memberId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    await insertMember(workspaceId, memberId);
    const businessId = await insertBusiness(
      workspaceId,
      ownerId,
      "Negocio inicial",
    );
    const nextBusinessId = await insertBusiness(
      workspaceId,
      ownerId,
      "Negocio novo",
    );
    const projectId = await insertProject(workspaceId, businessId);
    const tagId = await insertTag(workspaceId, "historico");
    const taskId = await insertTask(workspaceId, projectId, businessId);
    await insertSubtask(workspaceId, taskId);
    await pool.query(
      `insert into ${table("task_responsibles")}
         (workspace_id, task_id, user_id)
       values ($1, $2, $3)`,
      [workspaceId, taskId, memberId],
    );
    await pool.query(
      `insert into ${table("task_tags")}
         (workspace_id, task_id, tag_id)
       values ($1, $2, $3)`,
      [workspaceId, taskId, tagId],
    );

    await pool.query(
      `update ${table("projects")}
       set business_id = $3, updated_at = now()
       where workspace_id = $1 and id = $2`,
      [workspaceId, projectId, nextBusinessId],
    );
    const moved = await pool.query<{ business_id: string }>(
      `select business_id from ${table("tasks")}
       where workspace_id = $1 and id = $2`,
      [workspaceId, taskId],
    );
    expect(moved.rows[0]?.business_id).toBe(nextBusinessId);

    await pool.query(
      `delete from ${table("workspace_members")}
       where workspace_id = $1 and user_id = $2`,
      [workspaceId, memberId],
    );
    const responsibles = await pool.query<{ total: number }>(
      `select count(*)::int as total from ${table("task_responsibles")}
       where workspace_id = $1 and task_id = $2`,
      [workspaceId, taskId],
    );
    expect(responsibles.rows[0]?.total).toBe(0);

    await expect(
      pool.query(
        `delete from ${table("tags")}
         where workspace_id = $1 and id = $2`,
        [workspaceId, tagId],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    await pool.query(
      `delete from ${table("projects")}
       where workspace_id = $1 and id = $2`,
      [workspaceId, projectId],
    );
    for (const childTable of [
      "tasks",
      "task_subtasks",
      "task_responsibles",
      "task_tags",
    ] as const) {
      const idColumn = childTable === "tasks" ? "id" : "task_id";
      const result = await pool.query<{ total: number }>(
        `select count(*)::int as total from ${table(childTable)}
         where workspace_id = $1 and ${idColumn} = $2`,
        [workspaceId, taskId],
      );
      expect(result.rows[0]?.total).toBe(0);
    }
    const catalogs = await pool.query<{ businesses: number; tags: number }>(
      `select
         (select count(*)::int from ${table("businesses")}
           where workspace_id = $1) as businesses,
         (select count(*)::int from ${table("tags")}
           where workspace_id = $1) as tags`,
      [workspaceId],
    );
    expect(catalogs.rows[0]).toEqual({ businesses: 2, tags: 1 });
  });
});
