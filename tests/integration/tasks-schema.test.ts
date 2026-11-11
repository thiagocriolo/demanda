// @ts-nocheck
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const pool = createDatabasePool(parseServerEnvironment(process.env));

describe("BE-08: schema de tarefas e subtarefas (MySQL)", () => {
  afterAll(() => pool.end());

  it("mantém as tabelas do agregado de tarefas", async () => {
    const [rows] = await pool.query<{ tableName: string }[]>(`
      select table_name as tableName from information_schema.tables
      where table_schema = database() and table_name in (
        'tasks', 'task_subtasks', 'task_responsibles', 'task_tags'
      )
    `);
    expect(rows.map((row) => row.tableName).sort()).toEqual([
      'task_responsibles', 'task_subtasks', 'task_tags', 'tasks',
    ]);
  });

  it("mantém workspace obrigatório no agregado", async () => {
    const [rows] = await pool.query<{ tableName: string; nullableValue: string }[]>(`
      select table_name as tableName, is_nullable as nullableValue
      from information_schema.columns where table_schema = database()
        and column_name = 'workspace_id' and table_name in (
          'tasks', 'task_subtasks', 'task_responsibles', 'task_tags'
        )
    `);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.nullableValue === 'NO')).toBe(true);
  });

  it("mantém índices de filtros, subtarefas e responsáveis", async () => {
    const [rows] = await pool.query<{ indexName: string }[]>(`
      select distinct index_name as indexName from information_schema.statistics
      where table_schema = database() and index_name in (
        'tasks_workspace_status_archived_order_index',
        'tasks_workspace_due_completion_archive_index',
        'task_subtasks_workspace_task_archived_order_index',
        'task_responsibles_workspace_task_order_index',
        'task_tags_workspace_task_order_index'
      )
    `);
    expect(rows.map((row) => row.indexName)).toEqual(expect.arrayContaining([
      'tasks_workspace_status_archived_order_index',
      'tasks_workspace_due_completion_archive_index',
      'task_subtasks_workspace_task_archived_order_index',
      'task_responsibles_workspace_task_order_index',
      'task_tags_workspace_task_order_index',
    ]));
  });
});
