import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const schemaName = `be03_test_${randomUUID().replaceAll("-", "")}`;
const schemaIdentifier = `"${schemaName}"`;
const validTestSchema = /^be03_test_[0-9a-f]{32}$/;

type AuthTable =
  "users" | "user_credentials" | "auth_sessions" | "password_reset_tokens";

let pool: Pool;
let backfilledUsername: string;

function table(name: AuthTable): string {
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
  username = `user_${randomUUID().replaceAll("-", "").slice(0, 32)}`,
  email = `user-${randomUUID()}@example.test`,
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into ${table("users")} (id, name, username, email)
     values ($1, $2, $3, $4)`,
    [id, "Usuário de teste", username, email],
  );
  return id;
}

describe("BE-03: persistência de autenticação", () => {
  beforeAll(async () => {
    pool = createDatabasePool(parseServerEnvironment(process.env));
    try {
      for (const migration of await loadMigrations()) {
        if (migration.includes('ADD COLUMN "username"')) {
          await pool.query(
            `insert into ${table("users")} (id, name, email)
             values ($1, $2, $3)`,
            [randomUUID(), "Usuário legado", "legado@example.test"],
          );
        }
        await pool.query(migration);
        if (migration.includes('ADD COLUMN "username"')) {
          const backfilled = await pool.query<{ username: string }>(
            `select username from ${table("users")}
             where email = 'legado@example.test'`,
          );
          backfilledUsername = backfilled.rows[0].username;
        }
      }
    } catch (error) {
      await dropTestSchema();
      await pool.end();
      throw error;
    }
  });

  beforeEach(async () => {
    await pool.query(`delete from ${table("users")}`);
  });

  afterAll(async () => {
    if (!pool) return;
    await dropTestSchema();
    await pool.end();
  });

  it("aplica as migrations e mantém apenas hashes dos tokens", async () => {
    expect(backfilledUsername).toMatch(/^user_[0-9a-f]{32}$/);

    const columns = await pool.query<{
      table_name: string;
      column_name: string;
    }>(
      `select table_name, column_name
       from information_schema.columns
       where table_schema = $1
         and table_name in ('auth_sessions', 'password_reset_tokens')
       order by table_name, ordinal_position`,
      [schemaName],
    );

    const sessionColumns = columns.rows
      .filter((column) => column.table_name === "auth_sessions")
      .map((column) => column.column_name);
    const resetColumns = columns.rows
      .filter((column) => column.table_name === "password_reset_tokens")
      .map((column) => column.column_name);

    expect(sessionColumns).toContain("token_hash");
    expect(resetColumns).toContain("token_hash");
    expect(resetColumns).toContain("revoked_at");
    expect(sessionColumns).not.toContain("token");
    expect(resetColumns).not.toContain("token");

    const userId = await insertUser();
    const rawToken = `segredo-${randomUUID()}`;
    await pool.query(
      `insert into ${table("auth_sessions")}
         (user_id, token_hash, remembered, user_agent, expires_at)
       values ($1, $2, true, $3, now() + interval '1 hour')`,
      [userId, tokenHash(rawToken), "Vitest/BE-03"],
    );

    const stored = await pool.query(
      `select token_hash, remembered, user_agent
       from ${table("auth_sessions")} where user_id = $1`,
      [userId],
    );
    expect(stored.rows[0]).toEqual({
      token_hash: tokenHash(rawToken),
      remembered: true,
      user_agent: "Vitest/BE-03",
    });
    expect(JSON.stringify(stored.rows[0])).not.toContain(rawToken);
  });

  it("normaliza, valida e mantém username único sem diferenciar maiúsculas", async () => {
    await insertUser("thiago", "thiago@example.test");

    await expect(
      insertUser("Thiago", "outro@example.test"),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      insertUser("thiago", "duplicado@example.test"),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "users_username_lower_unique",
    });

    await expect(insertUser("ab", "curto@example.test")).rejects.toMatchObject({
      code: "23514",
      constraint: "users_username_format",
    });

    const index = await pool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
       where schemaname = $1 and indexname = 'users_username_lower_unique'`,
      [schemaName],
    );
    expect(index.rows[0]?.indexdef.toLowerCase()).toContain("lower");
  });

  it("mantém uma única credencial não vazia por usuário", async () => {
    const userId = await insertUser();

    await expect(
      pool.query(
        `insert into ${table("user_credentials")} (user_id, password_hash)
         values ($1, '   ')`,
        [userId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "user_credentials_password_hash_not_blank",
    });

    await pool.query(
      `insert into ${table("user_credentials")} (user_id, password_hash)
       values ($1, $2)`,
      [userId, "$scrypt$parametros$salt$hash"],
    );

    await expect(
      pool.query(
        `insert into ${table("user_credentials")} (user_id, password_hash)
         values ($1, $2)`,
        [userId, "$scrypt$outro"],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "user_credentials_pkey",
    });
  });

  it("rejeita sessões inválidas, expiradas na criação e hashes repetidos", async () => {
    const userId = await insertUser();
    const hash = tokenHash(`sessao-${randomUUID()}`);

    await expect(
      pool.query(
        `insert into ${table("auth_sessions")}
           (user_id, token_hash, expires_at)
         values ($1, 'token-em-texto-puro', now() + interval '1 hour')`,
        [userId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "auth_sessions_token_hash_hex",
    });

    await expect(
      pool.query(
        `insert into ${table("auth_sessions")}
           (user_id, token_hash, expires_at)
         values ($1, $2, now() - interval '1 second')`,
        [userId, hash],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "auth_sessions_expiration_after_creation",
    });

    await pool.query(
      `insert into ${table("auth_sessions")}
         (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '1 hour')`,
      [userId, hash],
    );

    await expect(
      pool.query(
        `insert into ${table("auth_sessions")}
           (user_id, token_hash, expires_at)
         values ($1, $2, now() + interval '2 hours')`,
        [userId, hash],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "auth_sessions_token_hash_unique",
    });
  });

  it("consome token de recuperação uma vez e valida seu ciclo de vida", async () => {
    const userId = await insertUser();
    const hash = tokenHash(`recuperacao-${randomUUID()}`);

    await expect(
      pool.query(
        `insert into ${table("password_reset_tokens")}
           (user_id, token_hash, expires_at)
         values ($1, 'segredo-sem-hash', now() + interval '15 minutes')`,
        [userId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "password_reset_tokens_token_hash_hex",
    });

    const inserted = await pool.query<{ id: string }>(
      `insert into ${table("password_reset_tokens")}
         (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '15 minutes') returning id`,
      [userId, hash],
    );
    const tokenId = inserted.rows[0].id;

    await expect(
      pool.query(
        `update ${table("password_reset_tokens")}
         set revoked_at = created_at - interval '1 second'
         where id = $1`,
        [tokenId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "password_reset_tokens_revocation_not_before_creation",
    });

    const firstUse = await pool.query(
      `update ${table("password_reset_tokens")}
       set used_at = now()
       where id = $1 and used_at is null and revoked_at is null
         and expires_at > now()
       returning id`,
      [tokenId],
    );
    const secondUse = await pool.query(
      `update ${table("password_reset_tokens")}
       set used_at = now()
       where id = $1 and used_at is null and revoked_at is null
         and expires_at > now()
       returning id`,
      [tokenId],
    );

    expect(firstUse.rowCount).toBe(1);
    expect(secondUse.rowCount).toBe(0);

    const revoked = await pool.query<{ id: string }>(
      `insert into ${table("password_reset_tokens")}
         (user_id, token_hash, expires_at, revoked_at)
       values ($1, $2, now() + interval '15 minutes', now()) returning id`,
      [userId, tokenHash(`revogado-${randomUUID()}`)],
    );
    const revokedUse = await pool.query(
      `update ${table("password_reset_tokens")}
       set used_at = now()
       where id = $1 and used_at is null and revoked_at is null
         and expires_at > now()
       returning id`,
      [revoked.rows[0].id],
    );
    expect(revokedUse.rowCount).toBe(0);
  });

  it("remove credencial, sessões e recuperações quando o usuário é excluído", async () => {
    const userId = await insertUser();
    await pool.query(
      `insert into ${table("user_credentials")} (user_id, password_hash)
       values ($1, '$scrypt$hash')`,
      [userId],
    );
    await pool.query(
      `insert into ${table("auth_sessions")}
         (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '1 hour')`,
      [userId, tokenHash(`sessao-${randomUUID()}`)],
    );
    await pool.query(
      `insert into ${table("password_reset_tokens")}
         (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '15 minutes')`,
      [userId, tokenHash(`recuperacao-${randomUUID()}`)],
    );

    await pool.query(`delete from ${table("users")} where id = $1`, [userId]);

    const result = await pool.query<{ total: number }>(
      `select (
         (select count(*) from ${table("user_credentials")}) +
         (select count(*) from ${table("auth_sessions")}) +
         (select count(*) from ${table("password_reset_tokens")})
       )::int as total`,
    );
    expect(result.rows[0]).toEqual({ total: 0 });
  });
});
