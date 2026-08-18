import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const schemaName = `be05_schema_test_${randomUUID().replaceAll("-", "")}`;
const schemaIdentifier = `"${schemaName}"`;
const validTestSchema = /^be05_schema_test_[0-9a-f]{32}$/;

type ContactTable =
  | "users"
  | "workspaces"
  | "workspace_members"
  | "contacts"
  | "contact_phones"
  | "contact_emails"
  | "contact_notes";

let pool: Pool;

function table(name: ContactTable): string {
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
    [id, "Usuario BE-05", `user_${suffix}`, `user-${suffix}@example.test`],
  );
  return id;
}

async function insertPersonalWorkspace(ownerUserId: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into ${table("workspaces")} (id, name, kind, owner_user_id)
     values ($1, $2, 'personal', $3)`,
    [id, "Pessoal BE-05", ownerUserId],
  );
  return id;
}

async function insertContact(
  workspaceId: string,
  ownerUserId: string,
  overrides: {
    linkedUserId?: string | null;
    name?: string;
    contactType?: string;
    status?: string;
    profession?: string | null;
  } = {},
): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `insert into ${table("contacts")}
       (workspace_id, owner_user_id, linked_user_id, name, contact_type, status, profession)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      workspaceId,
      ownerUserId,
      overrides.linkedUserId ?? null,
      overrides.name ?? "Contato de teste",
      overrides.contactType ?? "person",
      overrides.status ?? "active",
      overrides.profession ?? null,
    ],
  );
  return inserted.rows[0].id;
}

describe("BE-05: schema de pessoas e contatos", () => {
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

  it("cria as tabelas com workspace interno e contatos indexados pelo proprietario", async () => {
    const tables = await pool.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = $1
         and table_name in (
           'contacts', 'contact_phones', 'contact_emails', 'contact_notes'
         )
       order by table_name`,
      [schemaName],
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "contact_emails",
      "contact_notes",
      "contact_phones",
      "contacts",
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
           'contacts', 'contact_phones', 'contact_emails', 'contact_notes'
         )
       order by table_name`,
      [schemaName],
    );
    expect(workspaceColumns.rows).toHaveLength(4);
    expect(workspaceColumns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ is_nullable: "NO", data_type: "uuid" }),
      ]),
    );
    expect(
      workspaceColumns.rows.every((column) => column.is_nullable === "NO"),
    ).toBe(true);

    const ownerColumn = await pool.query<{
      is_nullable: string;
      data_type: string;
    }>(
      `select is_nullable, data_type
       from information_schema.columns
       where table_schema = $1
         and table_name = 'contacts'
         and column_name = 'owner_user_id'`,
      [schemaName],
    );
    expect(ownerColumn.rows).toEqual([
      { is_nullable: "NO", data_type: "uuid" },
    ]);

    const indexes = await pool.query<{ indexname: string }>(
      `select indexname
       from pg_indexes
       where schemaname = $1
         and indexname in (
           'contacts_owner_status_archived_index',
           'contacts_owner_name_lower_index',
           'contacts_owner_updated_id_index',
           'contact_phones_workspace_number_index',
           'contact_emails_workspace_address_index',
           'contact_notes_workspace_contact_created_index'
         )`,
      [schemaName],
    );
    expect(indexes.rows.map((row) => row.indexname).sort()).toEqual(
      [
        "contact_emails_workspace_address_index",
        "contact_notes_workspace_contact_created_index",
        "contact_phones_workspace_number_index",
        "contacts_owner_name_lower_index",
        "contacts_owner_status_archived_index",
        "contacts_owner_updated_id_index",
      ].sort(),
    );
  });

  it("persiste contato, telefones, emails e observacoes normalizados", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertPersonalWorkspace(ownerId);
    const contactId = await insertContact(workspaceId, ownerId, {
      linkedUserId: ownerId,
      contactType: "person",
      status: "lead",
      profession: "Designer",
    });

    await pool.query(
      `insert into ${table("contact_phones")}
         (workspace_id, contact_id, type, number, label, is_primary)
       values ($1, $2, 'whatsapp', '+5585987654321', 'Comercial', true)`,
      [workspaceId, contactId],
    );
    await pool.query(
      `insert into ${table("contact_emails")}
         (workspace_id, contact_id, type, address, is_primary)
       values ($1, $2, 'work', 'contato@example.test', true)`,
      [workspaceId, contactId],
    );
    await pool.query(
      `insert into ${table("contact_notes")}
         (workspace_id, contact_id, body)
       values ($1, $2, 'Prefere contato no periodo da tarde.')`,
      [workspaceId, contactId],
    );

    const result = await pool.query<{
      contact_type: string;
      status: string;
      owner_user_id: string;
      linked_user_id: string;
      phones: number;
      emails: number;
      notes: number;
    }>(
      `select c.contact_type,
              c.status,
              c.owner_user_id,
              c.linked_user_id,
              count(distinct p.id)::int as phones,
              count(distinct e.id)::int as emails,
              count(distinct n.id)::int as notes
       from ${table("contacts")} c
       left join ${table("contact_phones")} p
         on p.workspace_id = c.workspace_id and p.contact_id = c.id
       left join ${table("contact_emails")} e
         on e.workspace_id = c.workspace_id and e.contact_id = c.id
       left join ${table("contact_notes")} n
         on n.workspace_id = c.workspace_id and n.contact_id = c.id
       where c.workspace_id = $1 and c.id = $2
       group by c.id`,
      [workspaceId, contactId],
    );
    expect(result.rows[0]).toEqual({
      contact_type: "person",
      status: "lead",
      owner_user_id: ownerId,
      linked_user_id: ownerId,
      phones: 1,
      emails: 1,
      notes: 1,
    });
  });

  it("isola contatos por proprietario e filhos pelo workspace pessoal interno", async () => {
    const ownerAId = await insertUser();
    const ownerBId = await insertUser();
    const workspaceAId = await insertPersonalWorkspace(ownerAId);
    const workspaceBId = await insertPersonalWorkspace(ownerBId);
    const contactAId = await insertContact(workspaceAId, ownerAId);

    const externalLinkedContactId = await insertContact(
      workspaceAId,
      ownerAId,
      { linkedUserId: ownerBId, name: "Contato externo" },
    );
    const externalLink = await pool.query<{
      owner_user_id: string;
      linked_user_id: string;
    }>(
      `select owner_user_id, linked_user_id
       from ${table("contacts")}
       where id = $1`,
      [externalLinkedContactId],
    );
    expect(externalLink.rows[0]).toEqual({
      owner_user_id: ownerAId,
      linked_user_id: ownerBId,
    });

    await expect(
      insertContact(workspaceAId, ownerAId, {
        linkedUserId: ownerBId,
        name: "Contato duplicado do mesmo proprietario",
      }),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "contacts_owner_linked_user_unique",
    });

    const sameLinkForAnotherOwner = await insertContact(
      workspaceBId,
      ownerBId,
      { linkedUserId: ownerBId, name: "Contato do segundo proprietario" },
    );
    expect(sameLinkForAnotherOwner).not.toBe(externalLinkedContactId);

    for (const childTable of [
      "contact_phones",
      "contact_emails",
      "contact_notes",
    ] as const) {
      const childValues =
        childTable === "contact_phones"
          ? "(workspace_id, contact_id, number) values ($1, $2, '+5585987654321')"
          : childTable === "contact_emails"
            ? "(workspace_id, contact_id, address) values ($1, $2, 'other@example.test')"
            : "(workspace_id, contact_id, body) values ($1, $2, 'Observacao')";
      await expect(
        pool.query(`insert into ${table(childTable)} ${childValues}`, [
          workspaceBId,
          contactAId,
        ]),
      ).rejects.toMatchObject({ code: "23503" });
    }
  });

  it("valida tipos, status, campos textuais e datas de arquivamento", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertPersonalWorkspace(ownerId);

    await expect(
      insertContact(workspaceId, ownerId, { contactType: "invalid" }),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "contacts_type_allowed",
    });
    await expect(
      insertContact(workspaceId, ownerId, { status: "archived" }),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "contacts_status_allowed",
    });
    await expect(
      insertContact(workspaceId, ownerId, { name: "   " }),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "contacts_name_not_blank",
    });
    await expect(
      insertContact(workspaceId, ownerId, { profession: "   " }),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "contacts_profession_not_blank",
    });

    await expect(
      pool.query(
        `insert into ${table("contacts")}
           (workspace_id, owner_user_id, name, created_at, archived_at)
         values ($1, $2, 'Contato antigo', now(), now() - interval '1 second')`,
        [workspaceId, ownerId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "contacts_archive_not_before_creation",
    });
  });

  it("permite novo vinculo ativo quando o contato anterior esta arquivado", async () => {
    const ownerId = await insertUser();
    const memberId = await insertUser();
    const workspaceId = await insertPersonalWorkspace(ownerId);

    const archivedContactId = await insertContact(workspaceId, ownerId, {
      linkedUserId: memberId,
      name: "Contato arquivado",
    });
    await pool.query(
      `update ${table("contacts")}
       set archived_at = now(), updated_at = now()
       where workspace_id = $1 and id = $2`,
      [workspaceId, archivedContactId],
    );

    const activeContactId = await insertContact(workspaceId, ownerId, {
      linkedUserId: memberId,
      name: "Contato ativo substituto",
    });
    expect(activeContactId).not.toBe(archivedContactId);

    await expect(
      insertContact(workspaceId, ownerId, {
        linkedUserId: memberId,
        name: "Segundo contato ativo",
      }),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "contacts_owner_linked_user_unique",
    });
  });

  it("valida endpoints, normalizacao e somente um principal por tipo", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertPersonalWorkspace(ownerId);
    const contactId = await insertContact(workspaceId, ownerId);

    await pool.query(
      `insert into ${table("contact_phones")}
         (workspace_id, contact_id, number, is_primary)
       values ($1, $2, '+5585987654321', true)`,
      [workspaceId, contactId],
    );
    await expect(
      pool.query(
        `insert into ${table("contact_phones")}
           (workspace_id, contact_id, number, is_primary)
         values ($1, $2, '+5585987654322', true)`,
        [workspaceId, contactId],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "contact_phones_one_primary_unique",
    });
    await expect(
      pool.query(
        `insert into ${table("contact_phones")}
           (workspace_id, contact_id, number)
         values ($1, $2, '85 98765-4321')`,
        [workspaceId, contactId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "contact_phones_number_e164",
    });

    await pool.query(
      `insert into ${table("contact_emails")}
         (workspace_id, contact_id, address, is_primary)
       values ($1, $2, 'principal@example.test', true)`,
      [workspaceId, contactId],
    );
    await expect(
      pool.query(
        `insert into ${table("contact_emails")}
           (workspace_id, contact_id, address)
         values ($1, $2, 'NAO-NORMALIZADO@example.test')`,
        [workspaceId, contactId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "contact_emails_address_normalized",
    });
    await expect(
      pool.query(
        `insert into ${table("contact_emails")}
           (workspace_id, contact_id, address)
         values ($1, $2, 'email-invalido')`,
        [workspaceId, contactId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "contact_emails_address_format",
    });
    await expect(
      pool.query(
        `insert into ${table("contact_notes")}
           (workspace_id, contact_id, body)
         values ($1, $2, '   ')`,
        [workspaceId, contactId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "contact_notes_body_not_blank",
    });
  });

  it("remove os endpoints em cascata ao remover o contato", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertPersonalWorkspace(ownerId);
    const contactId = await insertContact(workspaceId, ownerId);

    await pool.query(
      `insert into ${table("contact_phones")}
         (workspace_id, contact_id, number)
       values ($1, $2, '+5585987654321')`,
      [workspaceId, contactId],
    );
    await pool.query(
      `insert into ${table("contact_emails")}
         (workspace_id, contact_id, address)
       values ($1, $2, 'cascade@example.test')`,
      [workspaceId, contactId],
    );
    await pool.query(
      `insert into ${table("contact_notes")}
         (workspace_id, contact_id, body)
       values ($1, $2, 'Observacao para cascade')`,
      [workspaceId, contactId],
    );

    await pool.query(
      `delete from ${table("contacts")}
       where workspace_id = $1 and id = $2`,
      [workspaceId, contactId],
    );

    for (const childTable of [
      "contact_phones",
      "contact_emails",
      "contact_notes",
    ] as const) {
      const result = await pool.query<{ total: number }>(
        `select count(*)::int as total
         from ${table(childTable)}
         where workspace_id = $1 and contact_id = $2`,
        [workspaceId, contactId],
      );
      expect(result.rows[0].total).toBe(0);
    }
  });
});
