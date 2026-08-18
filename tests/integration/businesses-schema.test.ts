import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const schemaName = `be06_schema_test_${randomUUID().replaceAll("-", "")}`;
const schemaIdentifier = `"${schemaName}"`;
const validTestSchema = /^be06_schema_test_[0-9a-f]{32}$/;

type BusinessTable =
  | "users"
  | "workspaces"
  | "contacts"
  | "businesses"
  | "business_responsibles"
  | "business_notes"
  | "user_connections";

let pool: Pool;

function table(name: BusinessTable): string {
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
        throw new Error(`${filename} contem operacao fora do schema isolado.`);
      }

      const isolated = migration.replaceAll('"app"', schemaIdentifier);
      if (isolated.includes('"app"')) {
        throw new Error(
          `${filename} manteve referencia ao schema da aplicacao.`,
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

async function insertUser(): Promise<string> {
  const id = randomUUID();
  const suffix = randomUUID().replaceAll("-", "");
  await pool.query(
    `insert into ${table("users")} (id, name, username, email)
     values ($1, $2, $3, $4)`,
    [id, "Usuario BE-06", `user_${suffix}`, `user-${suffix}@example.test`],
  );
  return id;
}

async function insertWorkspace(ownerUserId: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into ${table("workspaces")} (id, name, kind, owner_user_id)
     values ($1, $2, 'personal', $3)`,
    [id, "Workspace BE-06", ownerUserId],
  );
  return id;
}

async function insertContact(
  workspaceId: string,
  ownerUserId: string,
  name = "Responsavel",
) {
  const inserted = await pool.query<{ id: string }>(
    `insert into ${table("contacts")} (workspace_id, owner_user_id, name)
     values ($1, $2, $3)
     returning id`,
    [workspaceId, ownerUserId, name],
  );
  return inserted.rows[0].id;
}

async function insertBusiness(
  workspaceId: string,
  ownerUserId: string,
  values: { name?: string; categoryKey?: string; stageKey?: string } = {},
): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `insert into ${table("businesses")}
       (workspace_id, owner_user_id, name, category_key, stage_key)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      workspaceId,
      ownerUserId,
      values.name ?? "Negocio de teste",
      values.categoryKey ?? "marca_pessoal",
      values.stageKey ?? "negociacao",
    ],
  );
  return inserted.rows[0].id;
}

describe("BE-06: schema de negocios", () => {
  beforeAll(async () => {
    pool = createDatabasePool(parseServerEnvironment(process.env));
    try {
      for (const migration of await loadMigrations()) {
        await pool.query(migration);
      }
    } catch (error) {
      await dropTestSchema();
      throw error;
    }
  });

  afterAll(async () => {
    if (!pool) return;
    await dropTestSchema();
    await pool.end();
  });

  it("cria as tabelas com ownership privado e indices orientados pelo owner", async () => {
    const tables = await pool.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = $1
         and table_name in (
           'businesses', 'business_responsibles', 'business_notes'
         )
       order by table_name`,
      [schemaName],
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "business_notes",
      "business_responsibles",
      "businesses",
    ]);

    const workspaceColumns = await pool.query<{
      table_name: string;
      is_nullable: string;
      data_type: string;
    }>(
      `select table_name, is_nullable, data_type
       from information_schema.columns
       where table_schema = $1
         and column_name = 'workspace_id'
         and table_name in (
           'businesses', 'business_responsibles', 'business_notes'
         )
       order by table_name`,
      [schemaName],
    );
    expect(workspaceColumns.rows).toHaveLength(3);
    expect(
      workspaceColumns.rows.every(
        (column) => column.is_nullable === "NO" && column.data_type === "uuid",
      ),
    ).toBe(true);

    const ownerColumns = await pool.query<{
      table_name: string;
      is_nullable: string;
      data_type: string;
    }>(
      `select table_name, is_nullable, data_type
       from information_schema.columns
       where table_schema = $1
         and column_name = 'owner_user_id'
         and table_name in ('contacts', 'businesses')
       order by table_name`,
      [schemaName],
    );
    expect(ownerColumns.rows).toEqual([
      { table_name: "businesses", is_nullable: "NO", data_type: "uuid" },
      { table_name: "contacts", is_nullable: "NO", data_type: "uuid" },
    ]);

    const indexes = await pool.query<{ indexname: string }>(
      `select indexname
       from pg_indexes
       where schemaname = $1
         and indexname in (
           'businesses_owner_updated_id_index',
           'businesses_owner_stage_archived_index',
           'businesses_owner_category_archived_index',
           'businesses_owner_name_lower_index',
           'business_responsibles_workspace_contact_index',
           'business_responsibles_workspace_business_order_index',
           'business_notes_workspace_business_created_index',
           'business_notes_workspace_business_order_index'
         )`,
      [schemaName],
    );
    expect(indexes.rows.map((row) => row.indexname).sort()).toEqual(
      [
        "business_notes_workspace_business_created_index",
        "business_notes_workspace_business_order_index",
        "business_responsibles_workspace_business_order_index",
        "business_responsibles_workspace_contact_index",
        "businesses_owner_category_archived_index",
        "businesses_owner_name_lower_index",
        "businesses_owner_stage_archived_index",
        "businesses_owner_updated_id_index",
      ].sort(),
    );
  });

  it("mantem responsavel ligado quando o contato e arquivado", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const contactId = await insertContact(workspaceId, ownerId);
    const businessId = await insertBusiness(workspaceId, ownerId);

    await pool.query(
      `insert into ${table("business_responsibles")}
         (workspace_id, business_id, contact_id, sort_order)
       values ($1, $2, $3, 0)`,
      [workspaceId, businessId, contactId],
    );
    await pool.query(
      `update ${table("contacts")}
       set archived_at = now(), updated_at = now()
       where workspace_id = $1 and id = $2`,
      [workspaceId, contactId],
    );

    const result = await pool.query<{ total: number }>(
      `select count(*)::int as total
       from ${table("business_responsibles")}
       where workspace_id = $1 and business_id = $2 and contact_id = $3`,
      [workspaceId, businessId, contactId],
    );
    expect(result.rows[0].total).toBe(1);
  });

  it("isola responsaveis por owner mesmo dentro do mesmo workspace", async () => {
    const ownerAId = await insertUser();
    const ownerBId = await insertUser();
    const workspaceAId = await insertWorkspace(ownerAId);
    const workspaceBId = await insertWorkspace(ownerBId);
    const contactAId = await insertContact(workspaceAId, ownerAId, "Contato A");
    const contactBId = await insertContact(workspaceAId, ownerBId, "Contato B");
    const businessAId = await insertBusiness(workspaceAId, ownerAId);

    await pool.query(
      `insert into ${table("business_responsibles")}
         (workspace_id, business_id, contact_id)
       values ($1, $2, $3)`,
      [workspaceAId, businessAId, contactAId],
    );

    await expect(
      pool.query(
        `insert into ${table("business_responsibles")}
           (workspace_id, business_id, contact_id)
         values ($1, $2, $3)`,
        [workspaceAId, businessAId, contactBId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "business_responsibles_same_owner",
    });

    await expect(
      pool.query(
        `insert into ${table("business_notes")}
           (workspace_id, business_id, body)
         values ($1, $2, 'Observacao estrangeira')`,
        [workspaceBId, businessAId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "business_notes_workspace_business_foreign_key",
    });
  });

  it("rejeita responsavel duplicado e ordem negativa", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const contactId = await insertContact(workspaceId, ownerId);
    const businessId = await insertBusiness(workspaceId, ownerId);

    await pool.query(
      `insert into ${table("business_responsibles")}
         (workspace_id, business_id, contact_id)
       values ($1, $2, $3)`,
      [workspaceId, businessId, contactId],
    );
    await expect(
      pool.query(
        `insert into ${table("business_responsibles")}
           (workspace_id, business_id, contact_id)
         values ($1, $2, $3)`,
        [workspaceId, businessId, contactId],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "business_responsibles_business_contact_unique",
    });

    const anotherContactId = await insertContact(
      workspaceId,
      ownerId,
      "Contato 2",
    );
    await expect(
      pool.query(
        `insert into ${table("business_responsibles")}
           (workspace_id, business_id, contact_id, sort_order)
         values ($1, $2, $3, -1)`,
        [workspaceId, businessId, anotherContactId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "business_responsibles_sort_order_non_negative",
    });
  });

  it("aceita o proprio usuario e usuarios do ciclo como responsaveis", async () => {
    const ownerId = await insertUser();
    const connectedId = await insertUser();
    const outsiderId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const businessId = await insertBusiness(workspaceId, ownerId);

    await pool.query(
      `insert into ${table("user_connections")}
         (user_a_id, user_b_id, manual_connected_at)
       values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), now())`,
      [ownerId, connectedId],
    );
    await pool.query(
      `insert into ${table("business_responsibles")}
         (workspace_id, business_id, user_id, sort_order)
       values ($1, $2, $3, 0), ($1, $2, $4, 1)`,
      [workspaceId, businessId, ownerId, connectedId],
    );

    await expect(
      pool.query(
        `insert into ${table("business_responsibles")}
           (workspace_id, business_id, user_id)
         values ($1, $2, $3)`,
        [workspaceId, businessId, outsiderId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "business_responsibles_same_owner",
    });

    const contactId = await insertContact(workspaceId, ownerId);
    await expect(
      pool.query(
        `insert into ${table("business_responsibles")}
           (workspace_id, business_id, contact_id, user_id)
         values ($1, $2, $3, $4)`,
        [workspaceId, businessId, contactId, outsiderId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "business_responsibles_exactly_one_subject",
    });

    const selected = await pool.query<{
      contact_id: string | null;
      user_id: string | null;
    }>(
      `select contact_id, user_id
       from ${table("business_responsibles")}
       where workspace_id = $1 and business_id = $2
       order by sort_order, id`,
      [workspaceId, businessId],
    );
    expect(selected.rows).toEqual([
      { contact_id: null, user_id: ownerId },
      { contact_id: null, user_id: connectedId },
    ]);
  });

  it("ordena observacoes e aplica zero como ordem padrao", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const businessId = await insertBusiness(workspaceId, ownerId);

    const defaultNote = await pool.query<{ sort_order: number }>(
      `insert into ${table("business_notes")}
         (workspace_id, business_id, body)
       values ($1, $2, 'Primeira observacao')
       returning sort_order`,
      [workspaceId, businessId],
    );
    expect(defaultNote.rows[0].sort_order).toBe(0);

    await pool.query(
      `insert into ${table("business_notes")}
         (workspace_id, business_id, body, sort_order)
       values
         ($1, $2, 'Terceira observacao', 2),
         ($1, $2, 'Segunda observacao', 1)`,
      [workspaceId, businessId],
    );
    const ordered = await pool.query<{ body: string; sort_order: number }>(
      `select body, sort_order
       from ${table("business_notes")}
       where workspace_id = $1
         and business_id = $2
         and archived_at is null
       order by sort_order, id`,
      [workspaceId, businessId],
    );
    expect(ordered.rows).toEqual([
      { body: "Primeira observacao", sort_order: 0 },
      { body: "Segunda observacao", sort_order: 1 },
      { body: "Terceira observacao", sort_order: 2 },
    ]);

    await expect(
      pool.query(
        `insert into ${table("business_notes")}
           (workspace_id, business_id, body, sort_order)
         values ($1, $2, 'Ordem invalida', -1)`,
        [workspaceId, businessId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "business_notes_sort_order_non_negative",
    });
  });

  it("valida nomes, chaves, observacoes e datas", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);

    await expect(
      insertBusiness(workspaceId, ownerId, { name: "   " }),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "businesses_name_not_blank",
    });
    await expect(
      insertBusiness(workspaceId, ownerId, { categoryKey: "Marca_Pessoal" }),
    ).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      insertBusiness(workspaceId, ownerId, { categoryKey: "marca pessoal" }),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "businesses_category_key_format",
    });
    await expect(
      insertBusiness(workspaceId, ownerId, { stageKey: "   " }),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "businesses_stage_key_format",
    });

    const businessId = await insertBusiness(workspaceId, ownerId);
    await expect(
      pool.query(
        `insert into ${table("business_notes")}
           (workspace_id, business_id, body)
         values ($1, $2, '   ')`,
        [workspaceId, businessId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "business_notes_body_not_blank",
    });
    await expect(
      pool.query(
        `insert into ${table("business_notes")}
           (workspace_id, business_id, body, created_at, archived_at)
         values ($1, $2, 'Historico', now(), now() - interval '1 second')`,
        [workspaceId, businessId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "business_notes_archive_not_before_creation",
    });
    await expect(
      pool.query(
        `insert into ${table("businesses")}
           (workspace_id, owner_user_id, name, category_key, stage_key, created_at, archived_at)
         values ($1, $2, 'Negocio antigo', 'outro', 'encerrado',
           now(), now() - interval '1 second')`,
        [workspaceId, ownerId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "businesses_archive_not_before_creation",
    });
  });

  it("aplica cascades do negocio e do workspace sem excluir contato isolado", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const contactId = await insertContact(workspaceId, ownerId);
    const businessId = await insertBusiness(workspaceId, ownerId);
    await pool.query(
      `insert into ${table("business_responsibles")}
         (workspace_id, business_id, contact_id)
       values ($1, $2, $3)`,
      [workspaceId, businessId, contactId],
    );
    await pool.query(
      `insert into ${table("business_notes")}
         (workspace_id, business_id, body)
       values ($1, $2, 'Observacao para cascade')`,
      [workspaceId, businessId],
    );

    await expect(
      pool.query(
        `delete from ${table("contacts")}
         where workspace_id = $1 and id = $2`,
        [workspaceId, contactId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "business_responsibles_workspace_contact_foreign_key",
    });

    await pool.query(
      `delete from ${table("businesses")}
       where workspace_id = $1 and id = $2`,
      [workspaceId, businessId],
    );
    for (const childTable of [
      "business_responsibles",
      "business_notes",
    ] as const) {
      const result = await pool.query<{ total: number }>(
        `select count(*)::int as total
         from ${table(childTable)}
         where workspace_id = $1 and business_id = $2`,
        [workspaceId, businessId],
      );
      expect(result.rows[0].total).toBe(0);
    }
    const contact = await pool.query<{ total: number }>(
      `select count(*)::int as total from ${table("contacts")}
       where workspace_id = $1 and id = $2`,
      [workspaceId, contactId],
    );
    expect(contact.rows[0].total).toBe(1);

    const nextBusinessId = await insertBusiness(workspaceId, ownerId, {
      name: "Negocio removido com workspace",
    });
    await pool.query(
      `insert into ${table("business_responsibles")}
         (workspace_id, business_id, contact_id)
       values ($1, $2, $3)`,
      [workspaceId, nextBusinessId, contactId],
    );
    await pool.query(`delete from ${table("workspaces")} where id = $1`, [
      workspaceId,
    ]);
    for (const scopedTable of [
      "businesses",
      "business_responsibles",
      "business_notes",
      "contacts",
    ] as const) {
      const result = await pool.query<{ total: number }>(
        `select count(*)::int as total from ${table(scopedTable)}
         where workspace_id = $1`,
        [workspaceId],
      );
      expect(result.rows[0].total).toBe(0);
    }
  });
});
