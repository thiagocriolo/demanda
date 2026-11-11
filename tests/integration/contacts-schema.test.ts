// @ts-nocheck
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const pool = createDatabasePool(parseServerEnvironment(process.env));

describe("BE-05: schema de pessoas e contatos (MySQL)", () => {
  afterAll(() => pool.end());

  it("mantém as tabelas de contatos no banco MySQL", async () => {
    const [rows] = await pool.query<{ tableName: string }[]>(`
      select table_name as tableName from information_schema.tables
      where table_schema = database()
        and table_name in ('contacts', 'contact_phones', 'contact_emails', 'contact_notes')
    `);
    expect(rows.map((row) => row.tableName).sort()).toEqual([
      "contact_emails", "contact_notes", "contact_phones", "contacts",
    ]);
  });

  it("mantém workspace e proprietário obrigatórios", async () => {
    const [rows] = await pool.query<{
      tableName: string; columnName: string; nullableValue: string;
    }[]>(`
      select table_name as tableName, column_name as columnName, is_nullable as nullableValue
      from information_schema.columns
      where table_schema = database()
        and ((table_name = 'contacts' and column_name in ('workspace_id', 'owner_user_id'))
          or (table_name in ('contact_phones', 'contact_emails', 'contact_notes') and column_name = 'workspace_id'))
    `);
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.nullableValue === "NO")).toBe(true);
  });

  it("mantém índices de busca e relação dos contatos", async () => {
    const [rows] = await pool.query<{ indexName: string }[]>(`
      select distinct index_name as indexName from information_schema.statistics
      where table_schema = database()
        and index_name in (
          'contacts_name_search_index', 'contacts_owner_status_archived_index',
          'contact_phones_workspace_number_index', 'contact_emails_workspace_address_index',
          'contact_notes_workspace_contact_created_index'
        )
    `);
    expect(rows.map((row) => row.indexName)).toEqual(expect.arrayContaining([
      "contacts_name_search_index", "contacts_owner_status_archived_index",
      "contact_phones_workspace_number_index", "contact_emails_workspace_address_index",
      "contact_notes_workspace_contact_created_index",
    ]));
  });
});
