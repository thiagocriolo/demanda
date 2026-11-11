// @ts-nocheck
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const pool = createDatabasePool(parseServerEnvironment(process.env));

describe("BE-07: schema de projetos e serviços (MySQL)", () => {
  afterAll(() => pool.end());

  it("mantém agregados e tabelas de vínculo", async () => {
    const [rows] = await pool.query<{ tableName: string }[]>(`
      select table_name as tableName from information_schema.tables
      where table_schema = database() and table_name in (
        'projects', 'services', 'project_services', 'project_tags',
        'project_responsibles', 'project_installments', 'service_tags', 'service_responsibles'
      )
    `);
    expect(rows).toHaveLength(8);
  });

  it("mantém workspace obrigatório no projeto e vínculos", async () => {
    const [rows] = await pool.query<{ tableName: string; nullableValue: string }[]>(`
      select table_name as tableName, is_nullable as nullableValue
      from information_schema.columns where table_schema = database()
        and column_name = 'workspace_id' and table_name in (
          'projects', 'project_services', 'project_tags', 'project_responsibles', 'project_installments'
        )
    `);
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.nullableValue === 'NO')).toBe(true);
  });

  it("mantém índices do ciclo de vida e relacionamentos", async () => {
    const [rows] = await pool.query<{ indexName: string }[]>(`
      select distinct index_name as indexName from information_schema.statistics
      where table_schema = database() and index_name in (
        'projects_workspace_status_archived_index', 'projects_workspace_business_archived_index',
        'projects_workspace_end_status_archive_index',
        'project_services_workspace_project_order_index',
        'project_responsibles_workspace_project_order_index'
      )
    `);
    expect(rows.map((row) => row.indexName)).toEqual(expect.arrayContaining([
      'projects_workspace_status_archived_index', 'projects_workspace_business_archived_index',
      'projects_workspace_end_status_archive_index', 'project_services_workspace_project_order_index',
      'project_responsibles_workspace_project_order_index',
    ]));
  });
});
