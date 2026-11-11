// @ts-nocheck
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const pool = createDatabasePool(parseServerEnvironment(process.env));

describe("BE-03: persistência de autenticação (MySQL)", () => {
  afterAll(() => pool.end());

  it("armazena hashes, não tokens em texto puro", async () => {
    const [rows] = await pool.query<{ tableName: string; columnName: string }[]>(`
      select table_name as tableName, column_name as columnName
      from information_schema.columns
      where table_schema = database()
        and table_name in ('auth_sessions', 'password_reset_tokens')
        and column_name in ('token', 'token_hash', 'revoked_at')
    `);
    expect(rows).toEqual(expect.arrayContaining([
      { tableName: "auth_sessions", columnName: "token_hash" },
      { tableName: "password_reset_tokens", columnName: "token_hash" },
      { tableName: "password_reset_tokens", columnName: "revoked_at" },
    ]));
    expect(rows.some((row) => row.columnName === "token")).toBe(false);
  });

  it("mantém chaves únicas das credenciais e tokens", async () => {
    const [rows] = await pool.query<{ indexName: string }[]>(`
      select distinct index_name as indexName
      from information_schema.statistics
      where table_schema = database()
        and table_name in ('user_credentials', 'auth_sessions', 'password_reset_tokens')
        and non_unique = 0
    `);
    const names = rows.map((row) => row.indexName);
    expect(names).toContain("PRIMARY");
    expect(names).toContain("auth_sessions_token_hash_unique");
    expect(names).toContain("password_reset_tokens_token_hash_unique");
  });

  it("mantém username, e-mail e hash de senha como campos obrigatórios", async () => {
    const [rows] = await pool.query<{
      tableName: string;
      columnName: string;
      nullableValue: string;
    }[]>(`
      select table_name as tableName, column_name as columnName, is_nullable as nullableValue
      from information_schema.columns
      where table_schema = database()
        and (table_name, column_name) in (
          ('users', 'username'), ('users', 'email'), ('user_credentials', 'password_hash')
        )
    `);
    expect(rows).toEqual(expect.arrayContaining([
      { tableName: "users", columnName: "username", nullableValue: "NO" },
      { tableName: "users", columnName: "email", nullableValue: "NO" },
      { tableName: "user_credentials", columnName: "password_hash", nullableValue: "NO" },
    ]));
  });
});
