// @ts-nocheck
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const pool = createDatabasePool(parseServerEnvironment(process.env));

describe("BE-06: schema de negócios (MySQL)", () => {
  afterAll(() => pool.end());

  it("mantém as tabelas e ownership de negócios", async () => {
    const [tables] = await pool.query<{ tableName: string }[]>(`
      select table_name as tableName from information_schema.tables
      where table_schema = database()
        and table_name in ('businesses', 'business_responsibles', 'business_notes')
    `);
    expect(tables.map((row) => row.tableName).sort()).toEqual([
      "business_notes", "business_responsibles", "businesses",
    ]);
    const [columns] = await pool.query<{ tableName: string; nullableValue: string }[]>(`
      select table_name as tableName, is_nullable as nullableValue
      from information_schema.columns where table_schema = database()
        and ((table_name = 'businesses' and column_name in ('workspace_id', 'owner_user_id'))
          or (table_name in ('business_responsibles', 'business_notes') and column_name = 'workspace_id'))
    `);
    expect(columns).toHaveLength(4);
    expect(columns.every((row) => row.nullableValue === "NO")).toBe(true);
  });

  it("mantém índices para filtros e relações", async () => {
    const [rows] = await pool.query<{ indexName: string }[]>(`
      select distinct index_name as indexName from information_schema.statistics
      where table_schema = database()
        and index_name in (
          'businesses_name_search_index', 'businesses_owner_stage_archived_index',
          'business_responsibles_workspace_business_order_index',
          'business_notes_workspace_business_created_index'
        )
    `);
    expect(rows.map((row) => row.indexName)).toEqual(expect.arrayContaining([
      "businesses_name_search_index", "businesses_owner_stage_archived_index",
      "business_responsibles_workspace_business_order_index",
      "business_notes_workspace_business_created_index",
    ]));
  });

  it("mantém relações estrangeiras dos responsáveis", async () => {
    const [rows] = await pool.query<{ constraintName: string }[]>(`
      select constraint_name as constraintName
      from information_schema.referential_constraints
      where constraint_schema = database() and table_name = 'business_responsibles'
    `);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
