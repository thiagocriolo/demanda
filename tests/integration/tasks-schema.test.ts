// @ts-nocheck
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const pool = createDatabasePool(parseServerEnvironment(process.env));

describe("BE-08: schema de tarefas e tarefas (MySQL)", () => {
  afterAll(() => pool.end());

  it("mantém as tabelas do agregado de tarefas", async () => {
    const [rows] = await pool.query<{ tableName: string }[]>(`
      select table_name as tableName from information_schema.tables
      where table_schema = database() and table_name in (
        'deliveries', 'delivery_tasks', 'delivery_responsibles', 'delivery_tags'
      )
    `);
    expect(rows.map((row) => row.tableName).sort()).toEqual([
      'deliveries', 'delivery_responsibles', 'delivery_tags', 'delivery_tasks',
    ]);
  });

  it("mantém workspace obrigatório no agregado", async () => {
    const [rows] = await pool.query<{ tableName: string; nullableValue: string }[]>(`
      select table_name as tableName, is_nullable as nullableValue
      from information_schema.columns where table_schema = database()
        and column_name = 'workspace_id' and table_name in (
          'deliveries', 'delivery_tasks', 'delivery_responsibles', 'delivery_tags'
        )
    `);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.nullableValue === 'NO')).toBe(true);
  });

  it("mantém índices de filtros, tarefas e responsáveis", async () => {
    const [rows] = await pool.query<{ indexName: string }[]>(`
      select distinct index_name as indexName from information_schema.statistics
      where table_schema = database() and index_name in (
        'deliveries_workspace_status_archived_order_index',
        'deliveries_workspace_due_completion_archive_index',
        'delivery_tasks_workspace_delivery_archived_order_index',
        'delivery_responsibles_workspace_delivery_order_index',
        'delivery_tags_workspace_delivery_order_index'
      )
    `);
    expect(rows.map((row) => row.indexName)).toEqual(expect.arrayContaining([
      'deliveries_workspace_status_archived_order_index',
      'deliveries_workspace_due_completion_archive_index',
      'delivery_tasks_workspace_delivery_archived_order_index',
      'delivery_responsibles_workspace_delivery_order_index',
      'delivery_tags_workspace_delivery_order_index',
    ]));
  });
});
