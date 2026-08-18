import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const schemaName = `be04_test_${randomUUID().replaceAll("-", "")}`;
const schemaIdentifier = `"${schemaName}"`;
const validTestSchema = /^be04_test_[0-9a-f]{32}$/;

type AuthorizationTable =
  "users" | "workspaces" | "auth_sessions" | "audit_logs";

let pool: Pool;

function table(name: AuthorizationTable): string {
  return `${schemaIdentifier}."${name}"`;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function loadMigrations(): Promise<string[]> {
  const migrationsPath = join(process.cwd(), "drizzle");
  const filenames = (await readdir(migrationsPath))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();

  if (filenames.length === 0) {
    throw new Error("Nenhuma migration SQL encontrada.");
  }

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

async function insertUser(): Promise<string> {
  const id = randomUUID();
  const suffix = randomUUID().replaceAll("-", "");
  await pool.query(
    `insert into ${table("users")} (id, name, username, email)
     values ($1, $2, $3, $4)`,
    [id, "Usuario BE-04", `user_${suffix}`, `user-${suffix}@example.test`],
  );
  return id;
}

async function insertWorkspace(ownerUserId: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into ${table("workspaces")} (id, name, owner_user_id)
     values ($1, $2, $3)`,
    [id, "Workspace BE-04", ownerUserId],
  );
  return id;
}

async function insertSession(
  userId: string,
  activeWorkspaceId: string | null,
): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `insert into ${table("auth_sessions")}
       (user_id, active_workspace_id, token_hash, expires_at)
     values ($1, $2, $3, now() + interval '1 hour')
     returning id`,
    [userId, activeWorkspaceId, tokenHash(randomUUID())],
  );
  return inserted.rows[0].id;
}

describe("BE-04: persistencia de contexto e auditoria", () => {
  beforeAll(async () => {
    pool = createDatabasePool(parseServerEnvironment(process.env));
    try {
      for (const migration of await loadMigrations()) {
        await pool.query(migration);
      }
    } catch (error) {
      await dropTestSchema();
      await pool.end();
      throw error;
    }
  });

  afterAll(async () => {
    if (!pool) return;
    await dropTestSchema();
    await pool.end();
  });

  it("cria o contexto ativo opcional com FK SET NULL e indice", async () => {
    const column = await pool.query<{
      is_nullable: string;
      data_type: string;
    }>(
      `select is_nullable, data_type
       from information_schema.columns
       where table_schema = $1
         and table_name = 'auth_sessions'
         and column_name = 'active_workspace_id'`,
      [schemaName],
    );
    expect(column.rows[0]).toEqual({
      is_nullable: "YES",
      data_type: "uuid",
    });

    const indexes = await pool.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes
       where schemaname = $1
         and indexname in (
           'auth_sessions_active_workspace_id_index',
           'audit_logs_workspace_created_at_index',
           'audit_logs_actor_user_id_index'
         )
       order by indexname`,
      [schemaName],
    );
    expect(indexes.rows.map((index) => index.indexname)).toEqual([
      "audit_logs_actor_user_id_index",
      "audit_logs_workspace_created_at_index",
      "auth_sessions_active_workspace_id_index",
    ]);
    expect(
      indexes.rows.find(
        (index) =>
          index.indexname === "auth_sessions_active_workspace_id_index",
      )?.indexdef,
    ).toContain("active_workspace_id");

    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const sessionId = await insertSession(ownerId, workspaceId);

    await pool.query(`delete from ${table("workspaces")} where id = $1`, [
      workspaceId,
    ]);
    const session = await pool.query<{ active_workspace_id: string | null }>(
      `select active_workspace_id from ${table("auth_sessions")} where id = $1`,
      [sessionId],
    );
    expect(session.rows[0].active_workspace_id).toBeNull();
  });

  it("rejeita workspace ativo inexistente", async () => {
    const userId = await insertUser();
    await expect(insertSession(userId, randomUUID())).rejects.toMatchObject({
      code: "23503",
      constraint: "auth_sessions_active_workspace_id_workspaces_id_fk",
    });
  });

  it("insere auditoria com metadata padrao e valida strings", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const inserted = await pool.query<{
      metadata: Record<string, unknown>;
      target_id: string;
    }>(
      `insert into ${table("audit_logs")}
         (workspace_id, actor_user_id, action, target_type, target_id)
       values ($1, $2, 'workspace.viewed', 'workspace', $3)
       returning metadata, target_id`,
      [workspaceId, ownerId, workspaceId],
    );
    expect(inserted.rows[0]).toEqual({ metadata: {}, target_id: workspaceId });

    await expect(
      pool.query(
        `insert into ${table("audit_logs")}
           (workspace_id, action, target_type)
         values ($1, '   ', 'workspace')`,
        [workspaceId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "audit_logs_action_not_blank",
    });

    await expect(
      pool.query(
        `insert into ${table("audit_logs")}
           (workspace_id, action, target_type, target_id)
         values ($1, 'workspace.viewed', '   ', '   ')`,
        [workspaceId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      pool.query(
        `insert into ${table("audit_logs")}
           (workspace_id, action, target_type, metadata)
         values ($1, 'workspace.viewed', 'workspace', '[]'::jsonb)`,
        [workspaceId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "audit_logs_metadata_is_object",
    });
  });

  it("proibe UPDATE, DELETE e TRUNCATE na trilha de auditoria", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const inserted = await pool.query<{ id: string }>(
      `insert into ${table("audit_logs")}
         (workspace_id, actor_user_id, action, target_type)
       values ($1, $2, 'workspace.created', 'workspace') returning id`,
      [workspaceId, ownerId],
    );
    const auditLogId = inserted.rows[0].id;

    await expect(
      pool.query(
        `update ${table("audit_logs")} set action = 'workspace.updated'
         where id = $1`,
        [auditLogId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "audit_logs_append_only",
    });

    await expect(
      pool.query(`delete from ${table("audit_logs")} where id = $1`, [
        auditLogId,
      ]),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "audit_logs_append_only",
    });

    await expect(
      pool.query(`truncate table ${table("audit_logs")}`),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "audit_logs_append_only",
    });
  });

  it("preserva auditoria ao remover ator e impede remover seu workspace", async () => {
    const ownerId = await insertUser();
    const actorId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const inserted = await pool.query<{ id: string }>(
      `insert into ${table("audit_logs")}
         (workspace_id, actor_user_id, action, target_type)
       values ($1, $2, 'member.removed', 'member') returning id`,
      [workspaceId, actorId],
    );

    await pool.query(`delete from ${table("users")} where id = $1`, [actorId]);
    const auditLog = await pool.query<{ actor_user_id: string | null }>(
      `select actor_user_id from ${table("audit_logs")} where id = $1`,
      [inserted.rows[0].id],
    );
    expect(auditLog.rows[0].actor_user_id).toBeNull();

    await expect(
      pool.query(`delete from ${table("workspaces")} where id = $1`, [
        workspaceId,
      ]),
    ).rejects.toMatchObject({
      code: "23001",
      constraint: "audit_logs_workspace_id_workspaces_id_fk",
    });
  });
});
