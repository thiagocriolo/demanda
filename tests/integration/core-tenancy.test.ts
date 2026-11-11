// @ts-nocheck
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const pool = createDatabasePool(parseServerEnvironment(process.env));

describe("BE-02: núcleo multi-tenant (MySQL)", () => {
  afterAll(() => pool.end());

  it("mantém proprietário e tipo obrigatórios no workspace", async () => {
    const [rows] = await pool.query<{
      columnName: string;
      nullableValue: string;
    }[]>(`
      select column_name as columnName, is_nullable as nullableValue
      from information_schema.columns
      where table_schema = database() and table_name = 'workspaces'
        and column_name in ('owner_user_id', 'kind')
    `);
    expect(rows).toEqual(expect.arrayContaining([
      { columnName: "owner_user_id", nullableValue: "NO" },
      { columnName: "kind", nullableValue: "NO" },
    ]));
  });

  it("mantém membership único por usuário e workspace", async () => {
    const [rows] = await pool.query<{
      indexName: string;
      columnName: string;
    }[]>(`
      select index_name as indexName, column_name as columnName
      from information_schema.statistics
      where table_schema = database() and table_name = 'workspace_members'
        and index_name = 'PRIMARY'
      order by seq_in_index
    `);
    expect(rows.map((row) => row.columnName)).toEqual(["workspace_id", "user_id"]);
  });

  it("mantém FKs do workspace e dos membros", async () => {
    const [rows] = await pool.query<{ constraintName: string }[]>(`
      select constraint_name as constraintName
      from information_schema.referential_constraints
      where constraint_schema = database()
        and (
          (table_name = 'workspaces' and constraint_name like '%owner_user_id%')
          or table_name = 'workspace_members'
        )
    `);
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });
});
