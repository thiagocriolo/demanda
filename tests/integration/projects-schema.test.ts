import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { createDatabasePool } from "../../src/lib/server/db/pool";

const schemaName = `be07_schema_test_${randomUUID().replaceAll("-", "")}`;
const schemaIdentifier = `"${schemaName}"`;
const validTestSchema = /^be07_schema_test_[0-9a-f]{32}$/;

type ProjectTable =
  | "users"
  | "workspaces"
  | "workspace_members"
  | "businesses"
  | "services"
  | "tags"
  | "service_tags"
  | "service_responsibles"
  | "projects"
  | "project_services"
  | "project_tags"
  | "project_responsibles"
  | "project_installments";

let pool: Pool;

function table(name: ProjectTable): string {
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

async function insertUser(label = "Usuario BE-07"): Promise<string> {
  const id = randomUUID();
  const suffix = randomUUID().replaceAll("-", "");
  await pool.query(
    `insert into ${table("users")} (id, name, username, email)
     values ($1, $2, $3, $4)`,
    [id, label, `user_${suffix}`, `user-${suffix}@example.test`],
  );
  return id;
}

async function insertWorkspace(ownerUserId: string, name = "Workspace BE-07") {
  const id = randomUUID();
  await pool.query(
    `insert into ${table("workspaces")} (id, name, owner_user_id)
     values ($1, $2, $3)`,
    [id, name, ownerUserId],
  );
  return id;
}

async function insertMember(
  workspaceId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `insert into ${table("workspace_members")}
       (workspace_id, user_id, role)
     values ($1, $2, 'member')`,
    [workspaceId, userId],
  );
}

async function insertBusiness(
  workspaceId: string,
  ownerUserId: string,
  name = "Negocio BE-07",
) {
  const inserted = await pool.query<{ id: string }>(
    `insert into ${table("businesses")}
       (workspace_id, owner_user_id, name, category_key, stage_key)
     values ($1, $2, $3, 'outro', 'ativo')
     returning id`,
    [workspaceId, ownerUserId, name],
  );
  return inserted.rows[0].id;
}

async function insertService(
  workspaceId: string,
  values: { name?: string; installmentCount?: number } = {},
): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `insert into ${table("services")}
       (workspace_id, name, description, default_briefing,
        default_status_key, default_duration_days, default_contract_type,
        default_amount_cents, default_installment_count,
        default_payment_method, default_payment_terms, default_finance_notes)
     values ($1, $2, 'Descricao', 'Briefing padrao', 'planejamento', 30,
       'one_off', 1250000, $3, 'Pix', 'Entrada e entrega', 'Sem observacoes')
     returning id`,
    [
      workspaceId,
      values.name ?? `Servico ${randomUUID()}`,
      values.installmentCount ?? 2,
    ],
  );
  return inserted.rows[0].id;
}

async function insertTag(
  workspaceId: string,
  key = `tag_${randomUUID().replaceAll("-", "")}`,
): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `insert into ${table("tags")} (workspace_id, key, label)
     values ($1, $2, $3)
     returning id`,
    [workspaceId, key, `Tag ${key}`],
  );
  return inserted.rows[0].id;
}

async function insertProject(
  workspaceId: string,
  businessId: string,
  values: { name?: string; sourceServiceId?: string | null } = {},
): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `insert into ${table("projects")}
       (workspace_id, business_id, source_service_id, name, status_key,
        briefing, start_date, end_date, contract_type, amount_cents,
        first_due_date, payment_method, payment_terms, finance_notes)
     values ($1, $2, $3, $4, 'planejamento', 'Briefing materializado',
       '2026-07-01', '2026-07-31', 'one_off', 1250000,
       '2026-07-05', 'Pix', 'Entrada e entrega', 'Sem observacoes')
     returning id`,
    [
      workspaceId,
      businessId,
      values.sourceServiceId ?? null,
      values.name ?? `Projeto ${randomUUID()}`,
    ],
  );
  return inserted.rows[0].id;
}

describe("BE-07: schema de projetos, servicos e vinculos", () => {
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

  it("cria as nove tabelas com tipos e indices orientados pelo workspace", async () => {
    const expectedTables = [
      "project_installments",
      "project_responsibles",
      "project_services",
      "project_tags",
      "projects",
      "service_responsibles",
      "service_tags",
      "services",
      "tags",
    ];
    const tables = await pool.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = $1 and table_name = any($2::text[])
       order by table_name`,
      [schemaName, expectedTables],
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual(
      expectedTables,
    );

    const workspaceColumns = await pool.query<{
      table_name: string;
      is_nullable: string;
      data_type: string;
    }>(
      `select table_name, is_nullable, data_type
       from information_schema.columns
       where table_schema = $1
         and column_name = 'workspace_id'
         and table_name = any($2::text[])
       order by table_name`,
      [schemaName, expectedTables],
    );
    expect(workspaceColumns.rows).toHaveLength(9);
    expect(
      workspaceColumns.rows.every(
        ({ is_nullable, data_type }) =>
          is_nullable === "NO" && data_type === "uuid",
      ),
    ).toBe(true);

    const businessOwnerColumn = await pool.query<{
      is_nullable: string;
      data_type: string;
    }>(
      `select is_nullable, data_type
       from information_schema.columns
       where table_schema = $1
         and table_name = 'businesses'
         and column_name = 'owner_user_id'`,
      [schemaName],
    );
    expect(businessOwnerColumn.rows).toEqual([
      { is_nullable: "NO", data_type: "uuid" },
    ]);

    const businessForeignKey = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
       from pg_constraint
       where connamespace = $1::regnamespace
         and conname = 'projects_business_id_businesses_id_fk'`,
      [schemaName],
    );
    expect(businessForeignKey.rows[0]?.definition).toContain(
      "FOREIGN KEY (business_id)",
    );
    expect(businessForeignKey.rows[0]?.definition).not.toContain(
      "workspace_id",
    );

    const typedColumns = await pool.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `select table_name, column_name, data_type
       from information_schema.columns
       where table_schema = $1 and (
         (table_name = 'projects' and column_name in (
           'start_date', 'end_date', 'first_due_date', 'amount_cents'
         )) or
         (table_name = 'services' and column_name in (
           'default_amount_cents', 'default_installment_count'
         )) or
         (table_name = 'project_installments' and column_name in (
           'due_date', 'amount_cents'
         ))
       )`,
      [schemaName],
    );
    expect(typedColumns.rows).toEqual(
      expect.arrayContaining([
        {
          table_name: "projects",
          column_name: "start_date",
          data_type: "date",
        },
        { table_name: "projects", column_name: "end_date", data_type: "date" },
        {
          table_name: "projects",
          column_name: "first_due_date",
          data_type: "date",
        },
        {
          table_name: "projects",
          column_name: "amount_cents",
          data_type: "bigint",
        },
        {
          table_name: "services",
          column_name: "default_amount_cents",
          data_type: "bigint",
        },
        {
          table_name: "services",
          column_name: "default_installment_count",
          data_type: "integer",
        },
        {
          table_name: "project_installments",
          column_name: "due_date",
          data_type: "date",
        },
        {
          table_name: "project_installments",
          column_name: "amount_cents",
          data_type: "bigint",
        },
      ]),
    );

    const expectedIndexes = [
      "projects_workspace_updated_id_index",
      "projects_workspace_status_archived_index",
      "projects_workspace_business_archived_index",
      "projects_workspace_source_service_index",
      "projects_workspace_name_lower_index",
      "services_workspace_active_name_unique",
      "service_tags_workspace_tag_service_index",
      "service_responsibles_workspace_user_service_index",
      "project_services_workspace_service_project_index",
      "project_tags_workspace_tag_project_index",
      "project_responsibles_workspace_user_project_index",
      "project_installments_workspace_due_status_index",
    ];
    const indexes = await pool.query<{ indexname: string }>(
      `select indexname from pg_indexes
       where schemaname = $1 and indexname = any($2::text[])`,
      [schemaName, expectedIndexes],
    );
    expect(indexes.rows.map(({ indexname }) => indexname).sort()).toEqual(
      expectedIndexes.sort(),
    );
  });

  it("persiste modelo e snapshot de projeto com todos os vinculos tipados", async () => {
    const ownerId = await insertUser();
    const memberId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    await insertMember(workspaceId, memberId);
    const businessId = await insertBusiness(workspaceId, ownerId);
    const serviceId = await insertService(workspaceId);
    const tagId = await insertTag(workspaceId);

    await pool.query(
      `insert into ${table("service_tags")}
         (workspace_id, service_id, tag_id, sort_order)
       values ($1, $2, $3, 0)`,
      [workspaceId, serviceId, tagId],
    );
    await pool.query(
      `insert into ${table("service_responsibles")}
         (workspace_id, service_id, user_id, sort_order)
       values ($1, $2, $3, 0)`,
      [workspaceId, serviceId, memberId],
    );

    const projectId = await insertProject(workspaceId, businessId, {
      sourceServiceId: serviceId,
    });
    await pool.query(
      `insert into ${table("project_services")}
         (workspace_id, project_id, service_id, sort_order)
       values ($1, $2, $3, 0)`,
      [workspaceId, projectId, serviceId],
    );
    await pool.query(
      `insert into ${table("project_tags")}
         (workspace_id, project_id, tag_id, sort_order)
       values ($1, $2, $3, 0)`,
      [workspaceId, projectId, tagId],
    );
    await pool.query(
      `insert into ${table("project_responsibles")}
         (workspace_id, project_id, user_id, sort_order)
       values ($1, $2, $3, 0)`,
      [workspaceId, projectId, memberId],
    );
    await pool.query(
      `insert into ${table("project_installments")}
         (workspace_id, project_id, number, due_date, amount_cents, status_key)
       values
         ($1, $2, 1, '2026-07-05', 625000, 'pendente'),
         ($1, $2, 2, '2026-08-05', 625000, 'pendente')`,
      [workspaceId, projectId],
    );

    const result = await pool.query<{
      source_service_id: string;
      start_date: string;
      end_date: string;
      first_due_date: string;
      amount_cents: string;
      services: number;
      tags: number;
      responsibles: number;
      installments: number;
    }>(
      `select p.source_service_id,
              p.start_date::text,
              p.end_date::text,
              p.first_due_date::text,
              p.amount_cents::text,
              (select count(*)::int from ${table("project_services")} ps
                where ps.workspace_id = p.workspace_id and ps.project_id = p.id)
                as services,
              (select count(*)::int from ${table("project_tags")} pt
                where pt.workspace_id = p.workspace_id and pt.project_id = p.id)
                as tags,
              (select count(*)::int from ${table("project_responsibles")} pr
                where pr.workspace_id = p.workspace_id and pr.project_id = p.id)
                as responsibles,
              (select count(*)::int from ${table("project_installments")} pi
                where pi.workspace_id = p.workspace_id and pi.project_id = p.id)
                as installments
       from ${table("projects")} p
       where p.workspace_id = $1 and p.id = $2`,
      [workspaceId, projectId],
    );
    expect(result.rows[0]).toEqual({
      source_service_id: serviceId,
      start_date: "2026-07-01",
      end_date: "2026-07-31",
      first_due_date: "2026-07-05",
      amount_cents: "1250000",
      services: 1,
      tags: 1,
      responsibles: 1,
      installments: 2,
    });
  });

  it("permite negocio privado por id e rejeita modelo, tag e membro de outro workspace", async () => {
    const ownerAId = await insertUser("Owner A");
    const ownerBId = await insertUser("Owner B");
    const workspaceAId = await insertWorkspace(ownerAId, "Workspace A");
    const workspaceBId = await insertWorkspace(ownerBId, "Workspace B");
    const privateWorkspaceAId = await insertWorkspace(
      ownerAId,
      "Registros privados A",
    );
    const businessAId = await insertBusiness(
      privateWorkspaceAId,
      ownerAId,
      "Negocio A",
    );
    const businessBId = await insertBusiness(
      workspaceBId,
      ownerBId,
      "Negocio B",
    );
    const serviceAId = await insertService(workspaceAId, { name: "Servico A" });
    const serviceBId = await insertService(workspaceBId, { name: "Servico B" });
    const tagAId = await insertTag(workspaceAId, "tag_a");
    const tagBId = await insertTag(workspaceBId, "tag_b");
    const projectAId = await insertProject(workspaceAId, businessAId, {
      sourceServiceId: serviceAId,
    });

    await expect(insertProject(workspaceAId, businessBId)).resolves.toBeTypeOf(
      "string",
    );
    await expect(
      insertProject(workspaceAId, businessAId, {
        sourceServiceId: serviceBId,
      }),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "projects_workspace_source_service_foreign_key",
    });
    await expect(
      pool.query(
        `insert into ${table("project_services")}
           (workspace_id, project_id, service_id)
         values ($1, $2, $3)`,
        [workspaceAId, projectAId, serviceBId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "project_services_workspace_service_foreign_key",
    });
    await expect(
      pool.query(
        `insert into ${table("project_tags")}
           (workspace_id, project_id, tag_id)
         values ($1, $2, $3)`,
        [workspaceAId, projectAId, tagBId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "project_tags_workspace_tag_foreign_key",
    });
    await expect(
      pool.query(
        `insert into ${table("project_responsibles")}
           (workspace_id, project_id, user_id)
         values ($1, $2, $3)`,
        [workspaceAId, projectAId, ownerBId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "project_responsibles_workspace_member_foreign_key",
    });
    await expect(
      pool.query(
        `insert into ${table("service_tags")}
           (workspace_id, service_id, tag_id)
         values ($1, $2, $3)`,
        [workspaceAId, serviceAId, tagBId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "service_tags_workspace_tag_foreign_key",
    });
    await expect(
      pool.query(
        `insert into ${table("service_responsibles")}
           (workspace_id, service_id, user_id)
         values ($1, $2, $3)`,
        [workspaceAId, serviceAId, ownerBId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "service_responsibles_workspace_member_foreign_key",
    });
    await expect(
      pool.query(
        `insert into ${table("project_installments")}
           (workspace_id, project_id, number, due_date, amount_cents)
         values ($1, $2, 1, '2026-08-01', 100)`,
        [workspaceBId, projectAId],
      ),
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "project_installments_workspace_project_foreign_key",
    });

    expect(tagAId).not.toBe(tagBId);
  });

  it("valida defaults de servico, unicidade ativa e catalogo de tags", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const serviceId = await insertService(workspaceId, { name: "Identidade" });

    await expect(
      insertService(workspaceId, { name: "identidade" }),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "services_workspace_active_name_unique",
    });
    await pool.query(
      `update ${table("services")}
       set archived_at = now(), updated_at = now()
       where workspace_id = $1 and id = $2`,
      [workspaceId, serviceId],
    );
    await expect(
      insertService(workspaceId, { name: "IDENTIDADE" }),
    ).resolves.toBeTypeOf("string");

    await expect(
      insertService(workspaceId, { installmentCount: 0 }),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "services_default_installment_count_range",
    });
    await expect(
      pool.query(
        `insert into ${table("services")}
           (workspace_id, name, default_status_key)
         values ($1, 'Status reservado', 'arquivado')`,
        [workspaceId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "services_default_status_not_archived",
    });
    await expect(
      pool.query(
        `insert into ${table("services")}
           (workspace_id, name, default_amount_cents)
         values ($1, 'Valor inseguro', 9007199254740992)`,
        [workspaceId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "services_default_amount_safe",
    });

    await insertTag(workspaceId, "branding");
    await expect(insertTag(workspaceId, "branding")).rejects.toMatchObject({
      code: "23505",
      constraint: "tags_workspace_key_unique",
    });
    await expect(insertTag(workspaceId, "Branding")).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("valida datas, contrato, status e valores monetarios do projeto", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const businessId = await insertBusiness(workspaceId, ownerId);

    await expect(
      pool.query(
        `insert into ${table("projects")}
           (workspace_id, business_id, name, status_key, start_date, end_date)
         values ($1, $2, 'Datas invalidas', 'planejamento',
           '2026-08-02', '2026-08-01')`,
        [workspaceId, businessId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "projects_dates_ordered",
    });
    await expect(
      pool.query(
        `insert into ${table("projects")}
           (workspace_id, business_id, name, status_key)
         values ($1, $2, 'Status reservado', 'arquivado')`,
        [workspaceId, businessId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "projects_status_not_archived",
    });
    await expect(
      pool.query(
        `insert into ${table("projects")}
           (workspace_id, business_id, name, status_key, contract_type)
         values ($1, $2, 'Contrato invalido', 'planejamento', 'mensal')`,
        [workspaceId, businessId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "projects_contract_type_allowed",
    });
    await expect(
      pool.query(
        `insert into ${table("projects")}
           (workspace_id, business_id, name, status_key, amount_cents)
         values ($1, $2, 'Valor negativo', 'planejamento', -1)`,
        [workspaceId, businessId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "projects_amount_cents_safe",
    });
  });

  it("valida parcelas unicas, normalizadas e dentro do limite seguro", async () => {
    const ownerId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    const businessId = await insertBusiness(workspaceId, ownerId);
    const projectId = await insertProject(workspaceId, businessId);

    await pool.query(
      `insert into ${table("project_installments")}
         (workspace_id, project_id, number, due_date, amount_cents, status_key)
       values ($1, $2, 1, '2026-08-01', 100, 'pendente')`,
      [workspaceId, projectId],
    );
    await expect(
      pool.query(
        `insert into ${table("project_installments")}
           (workspace_id, project_id, number, due_date, amount_cents)
         values ($1, $2, 1, '2026-09-01', 100)`,
        [workspaceId, projectId],
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "project_installments_project_number_unique",
    });
    await expect(
      pool.query(
        `insert into ${table("project_installments")}
           (workspace_id, project_id, number, due_date, amount_cents)
         values ($1, $2, 0, '2026-09-01', 100)`,
        [workspaceId, projectId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "project_installments_number_range",
    });
    await expect(
      pool.query(
        `insert into ${table("project_installments")}
           (workspace_id, project_id, number, due_date, amount_cents)
         values ($1, $2, 2, '2026-09-01', 9007199254740992)`,
        [workspaceId, projectId],
      ),
    ).rejects.toMatchObject({
      code: "23514",
      constraint: "project_installments_amount_safe",
    });
    await expect(
      pool.query(
        `insert into ${table("project_installments")}
           (workspace_id, project_id, number, due_date, amount_cents, status_key)
         values ($1, $2, 3, '2026-10-01', 100, 'Em Aberto')`,
        [workspaceId, projectId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("aplica cascades de projeto, membro e workspace sem apagar catalogos", async () => {
    const ownerId = await insertUser();
    const memberId = await insertUser();
    const workspaceId = await insertWorkspace(ownerId);
    await insertMember(workspaceId, memberId);
    const businessId = await insertBusiness(workspaceId, ownerId);
    const serviceId = await insertService(workspaceId);
    const tagId = await insertTag(workspaceId);
    const projectId = await insertProject(workspaceId, businessId, {
      sourceServiceId: serviceId,
    });

    await pool.query(
      `insert into ${table("service_responsibles")}
         (workspace_id, service_id, user_id)
       values ($1, $2, $3)`,
      [workspaceId, serviceId, memberId],
    );
    await pool.query(
      `insert into ${table("project_responsibles")}
         (workspace_id, project_id, user_id)
       values ($1, $2, $3)`,
      [workspaceId, projectId, memberId],
    );
    await pool.query(
      `delete from ${table("workspace_members")}
       where workspace_id = $1 and user_id = $2`,
      [workspaceId, memberId],
    );
    for (const relationTable of [
      "service_responsibles",
      "project_responsibles",
    ] as const) {
      const result = await pool.query<{ total: number }>(
        `select count(*)::int as total from ${table(relationTable)}
         where workspace_id = $1 and user_id = $2`,
        [workspaceId, memberId],
      );
      expect(result.rows[0].total).toBe(0);
    }

    await pool.query(
      `insert into ${table("project_services")}
         (workspace_id, project_id, service_id)
       values ($1, $2, $3)`,
      [workspaceId, projectId, serviceId],
    );
    await pool.query(
      `insert into ${table("project_tags")}
         (workspace_id, project_id, tag_id)
       values ($1, $2, $3)`,
      [workspaceId, projectId, tagId],
    );
    await pool.query(
      `insert into ${table("project_installments")}
         (workspace_id, project_id, number, due_date, amount_cents)
       values ($1, $2, 1, '2026-08-01', 100)`,
      [workspaceId, projectId],
    );
    await expect(
      pool.query(
        `delete from ${table("services")}
         where workspace_id = $1 and id = $2`,
        [workspaceId, serviceId],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    await pool.query(
      `delete from ${table("projects")}
       where workspace_id = $1 and id = $2`,
      [workspaceId, projectId],
    );
    for (const childTable of [
      "project_services",
      "project_tags",
      "project_responsibles",
      "project_installments",
    ] as const) {
      const result = await pool.query<{ total: number }>(
        `select count(*)::int as total from ${table(childTable)}
         where workspace_id = $1 and project_id = $2`,
        [workspaceId, projectId],
      );
      expect(result.rows[0].total).toBe(0);
    }
    for (const catalogTable of ["services", "tags"] as const) {
      const result = await pool.query<{ total: number }>(
        `select count(*)::int as total from ${table(catalogTable)}
         where workspace_id = $1`,
        [workspaceId],
      );
      expect(result.rows[0].total).toBe(1);
    }

    await pool.query(`delete from ${table("workspaces")} where id = $1`, [
      workspaceId,
    ]);
    for (const scopedTable of [
      "services",
      "tags",
      "projects",
      "service_tags",
      "service_responsibles",
      "project_services",
      "project_tags",
      "project_responsibles",
      "project_installments",
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
