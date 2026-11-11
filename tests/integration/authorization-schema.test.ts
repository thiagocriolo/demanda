// @ts-nocheck
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const pool = createDatabasePool(parseServerEnvironment(process.env));

type ColumnRow = { nullableValue: "YES" | "NO"; dataType: string };
type IndexRow = { indexName: string; columnName: string };
type ForeignKeyRow = { constraintName: string; deleteRule: string };

describe("BE-04: persistência de contexto e auditoria (MySQL)", () => {
  afterAll(() => pool.end());

  it("mantém o workspace ativo opcional em auth_sessions", async () => {
    const [rows] = await pool.query<ColumnRow[]>(`
      select is_nullable as nullableValue, data_type as dataType
      from information_schema.columns
      where table_schema = database()
        and table_name = 'auth_sessions'
        and column_name = 'active_workspace_id'
    `);
    expect(rows).toEqual([{ nullableValue: "YES", dataType: "char" }]);
  });

  it("mantém a FK SET NULL do workspace ativo", async () => {
    const [rows] = await pool.query<ForeignKeyRow[]>(`
      select rc.constraint_name as constraintName, rc.delete_rule as deleteRule
      from information_schema.referential_constraints rc
      where rc.constraint_schema = database()
        and rc.table_name = 'auth_sessions'
        and rc.constraint_name = 'auth_sessions_active_workspace_id_workspaces_id_fk'
    `);
    expect(rows).toEqual([
      {
        constraintName: "auth_sessions_active_workspace_id_workspaces_id_fk",
        deleteRule: "SET NULL",
      },
    ]);
  });

  it("mantém os índices de contexto e auditoria", async () => {
    const [rows] = await pool.query<IndexRow[]>(`
      select index_name as indexName, column_name as columnName, seq_in_index
      from information_schema.statistics
      where table_schema = database()
        and index_name in (
          'auth_sessions_active_workspace_id_index',
          'audit_logs_workspace_created_at_index',
          'audit_logs_actor_user_id_index'
        )
      order by index_name, seq_in_index
    `);
    expect(rows.map(({ indexName, columnName }) => ({ indexName, columnName }))).toEqual(expect.arrayContaining([
      { indexName: "auth_sessions_active_workspace_id_index", columnName: "active_workspace_id" },
      { indexName: "audit_logs_workspace_created_at_index", columnName: "workspace_id" },
      { indexName: "audit_logs_actor_user_id_index", columnName: "actor_user_id" },
    ]));
  });
});
