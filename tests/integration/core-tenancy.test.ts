import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const schemaName = `be02_test_${randomUUID().replaceAll("-", "")}`;
const schemaIdentifier = `"${schemaName}"`;
const validTestSchema = /^be02_test_[0-9a-f]{32}$/;

let pool: Pool;

function table(name: "users" | "workspaces" | "workspace_members"): string {
  return `${schemaIdentifier}."${name}"`;
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
        throw new Error(`${filename} contém operação fora do schema isolado.`);
      }

      const isolated = migration.replaceAll('"app"', schemaIdentifier);
      if (isolated.includes('"app"')) {
        throw new Error(
          `${filename} manteve referência ao schema da aplicação.`,
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

async function insertUser(
  id = randomUUID(),
  email = `user-${randomUUID()}@example.test`,
): Promise<string> {
  const username = `user_${randomUUID().replaceAll("-", "").slice(0, 32)}`;
  await pool.query(
    `insert into ${table("users")} (id, name, username, email)
     values ($1, $2, $3, $4)`,
    [id, "Usuário de teste", username, email],
  );
  return id;
}

async function insertWorkspace(
  ownerUserId: string,
  kind: "personal" | "shared" = "shared",
  id = randomUUID(),
): Promise<string> {
  await pool.query(
    `insert into ${table("workspaces")} (id, name, kind, owner_user_id)
     values ($1, $2, $3, $4)`,
    [id, "Workspace de teste", kind, ownerUserId],
  );
  return id;
}

describe("BE-02: núcleo multi-tenant", () => {
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

  beforeEach(async () => {
    // Excluir o pai testa também se o cascade não é bloqueado pelo guard.
    await pool.query(`delete from ${table("workspaces")}`);
    await pool.query(`delete from ${table("users")}`);
  });

  afterAll(async () => {
    if (!pool) return;
    await dropTestSchema();
    await pool.end();
  });

  it("aplica as migrations em schema vazio e cria exatamente um owner", async () => {
    const ownerUserId = await insertUser();
    const workspaceId = await insertWorkspace(ownerUserId);

    const result = await pool.query(
      `select user_id, role from ${table("workspace_members")}
       where workspace_id = $1`,
      [workspaceId],
    );

    expect(result.rows).toEqual([{ user_id: ownerUserId, role: "owner" }]);
  });

  it("impede segundo owner, remoção, rebaixamento e truncate", async () => {
    const ownerUserId = await insertUser();
    const secondUserId = await insertUser();
    const workspaceId = await insertWorkspace(ownerUserId);

    await expect(
      pool.query(
        `insert into ${table("workspace_members")} (workspace_id, user_id, role)
         values ($1, $2, 'owner')`,
        [workspaceId, secondUserId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "workspace_owner_role_matches_workspace",
    });

    await expect(
      pool.query(
        `update ${table("workspace_members")} set role = 'admin'
         where workspace_id = $1 and user_id = $2`,
        [workspaceId, ownerUserId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "workspace_owner_membership_required",
    });

    await expect(
      pool.query(
        `delete from ${table("workspace_members")}
         where workspace_id = $1 and user_id = $2`,
        [workspaceId, ownerUserId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "workspace_owner_membership_required",
    });

    let truncateError: unknown;
    try {
      await pool.query(`truncate table ${table("workspace_members")}`);
    } catch (error) {
      truncateError = error;
    }
    expect(truncateError).toBeDefined();
    const databaseError = truncateError as {
      code?: string;
      constraint?: string;
    };
    // FKs compostas podem rejeitar o TRUNCATE antes que o trigger de
    // invariantes rode; as duas respostas preservam a tabela e o owner.
    expect(["23514", "0A000"]).toContain(databaseError.code);
    if (databaseError.code === "23514") {
      expect(databaseError.constraint).toBe(
        "workspace_owner_membership_required",
      );
    }
  });

  it("transfere workspace compartilhado e mantém um único owner", async () => {
    const firstOwnerId = await insertUser();
    const nextOwnerId = await insertUser();
    const workspaceId = await insertWorkspace(firstOwnerId);

    await pool.query(
      `insert into ${table("workspace_members")} (workspace_id, user_id, role)
       values ($1, $2, 'member')`,
      [workspaceId, nextOwnerId],
    );
    await pool.query(
      `update ${table("workspaces")} set owner_user_id = $1 where id = $2`,
      [nextOwnerId, workspaceId],
    );

    const result = await pool.query(
      `select user_id, role from ${table("workspace_members")}
       where workspace_id = $1 order by role, user_id`,
      [workspaceId],
    );
    expect(result.rows).toEqual([
      { user_id: firstOwnerId, role: "admin" },
      { user_id: nextOwnerId, role: "owner" },
    ]);
  });

  it("adiciona automaticamente um novo proprietário ainda não membro", async () => {
    const firstOwnerId = await insertUser();
    const nextOwnerId = await insertUser();
    const workspaceId = await insertWorkspace(firstOwnerId);

    await pool.query(
      `update ${table("workspaces")} set owner_user_id = $1 where id = $2`,
      [nextOwnerId, workspaceId],
    );

    const result = await pool.query(
      `select count(*)::int as total,
              count(*) filter (where role = 'owner')::int as owners
       from ${table("workspace_members")} where workspace_id = $1`,
      [workspaceId],
    );
    expect(result.rows[0]).toEqual({ total: 2, owners: 1 });
  });

  it("mantém workspace pessoal permanente e com apenas o proprietário", async () => {
    const firstOwnerId = await insertUser();
    const nextOwnerId = await insertUser();
    const workspaceId = await insertWorkspace(firstOwnerId, "personal");

    const canonicalName = await pool.query(
      `select name from ${table("workspaces")} where id = $1`,
      [workspaceId],
    );
    expect(canonicalName.rows[0]?.name).toBe("Pessoal");

    await pool.query(
      `update ${table("workspaces")} set name = 'Pessoal - usuário' where id = $1`,
      [workspaceId],
    );
    const nameAfterRename = await pool.query(
      `select name from ${table("workspaces")} where id = $1`,
      [workspaceId],
    );
    expect(nameAfterRename.rows[0]?.name).toBe("Pessoal");

    await expect(
      pool.query(
        `insert into ${table("workspace_members")} (workspace_id, user_id, role)
         values ($1, $2, 'member')`,
        [workspaceId, nextOwnerId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "personal_workspace_single_member",
    });

    await expect(
      pool.query(
        `update ${table("workspaces")} set archived_at = now() where id = $1`,
        [workspaceId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "workspaces_personal_not_archived",
    });

    await expect(
      insertWorkspace(firstOwnerId, "personal"),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "workspaces_personal_owner_unique",
    });

    await pool.query(
      `update ${table("workspaces")} set owner_user_id = $1 where id = $2`,
      [nextOwnerId, workspaceId],
    );
    const result = await pool.query(
      `select user_id, role from ${table("workspace_members")}
       where workspace_id = $1`,
      [workspaceId],
    );
    expect(result.rows).toEqual([{ user_id: nextOwnerId, role: "owner" }]);
  });

  it("aplica checks, unicidade e chaves estrangeiras", async () => {
    const ownerUserId = await insertUser();
    const invalidRoleUserId = await insertUser();
    const workspaceId = await insertWorkspace(ownerUserId);

    await expect(
      insertUser(randomUUID(), "EMAIL-INVALIDO@example.test"),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "users_email_normalized",
    });

    await expect(
      insertUser(randomUUID(), "user-duplicado@example.test").then(() =>
        insertUser(randomUUID(), "user-duplicado@example.test"),
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "users_email_lower_unique",
    });

    await expect(
      pool.query(
        `insert into ${table("workspace_members")} (workspace_id, user_id, role)
         values ($1, $2, 'invalid')`,
        [workspaceId, invalidRoleUserId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "workspace_members_role_allowed",
    });

    await expect(
      pool.query(`delete from ${table("users")} where id = $1`, [ownerUserId]),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "workspace_owner_membership_required",
    });
  });

  it("remove memberships em cascata ao excluir o workspace", async () => {
    const ownerUserId = await insertUser();
    const workspaceId = await insertWorkspace(ownerUserId);

    await pool.query(`delete from ${table("workspaces")} where id = $1`, [
      workspaceId,
    ]);
    const result = await pool.query(
      `select count(*)::int as total from ${table("workspace_members")}
       where workspace_id = $1`,
      [workspaceId],
    );
    expect(result.rows[0]).toEqual({ total: 0 });
  });
});
