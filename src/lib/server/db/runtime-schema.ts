import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { rawRows, type Database } from "./database";

type RuntimeSchemaGlobals = typeof globalThis & {
  __demandaRuntimeSchemaPromise?: Promise<void>;
};

const runtimeSchemaGlobals = globalThis as RuntimeSchemaGlobals;

/**
 * The managed Node.js runtime starts the generated entry file directly, so it
 * cannot run the Drizzle CLI during deployment. Keep the idempotent schema
 * transitions required by the running application here until that platform
 * exposes a migration command.
 */
export function ensureRuntimeSchema(database: Database): Promise<void> {
  runtimeSchemaGlobals.__demandaRuntimeSchemaPromise ??= applyRuntimeSchema(
    database,
  ).catch((cause) => {
    runtimeSchemaGlobals.__demandaRuntimeSchemaPromise = undefined;
    throw cause;
  });
  return runtimeSchemaGlobals.__demandaRuntimeSchemaPromise;
}

export async function applyRuntimeSchema(database: Database): Promise<void> {
  // Version 0019 is a semantic rename, rather than an additive migration.
  // Managed deployments invoke this guard before serving requests, so old
  // installations receive the same Delivery -> Task vocabulary as migrated
  // installations while preserving every existing UUID and row.
  await renameLegacyDeliverySchema(database);
  await database.execute(
    sql.raw("DROP TABLE IF EXISTS `legacy_import_records`"),
  );

  // Migrations 0013–0017 introduce commercial contracts, personal contract
  // ownership, private finance ownership, contract periods, and per-contract
  // institutional projects. Create missing tables before altering them so
  // managed deployments upgrading from pre-0013 databases succeed cleanly.
  await ensureContractsSchema(database);

  await addColumnIfMissing(
    database,
    "service_delivery_templates",
    "recurrence_type",
    "varchar(16) NOT NULL DEFAULT 'one_off'",
  );
  await addColumnIfMissing(
    database,
    "service_delivery_templates",
    "recurrence_unit",
    "varchar(16) NULL",
  );
  await addColumnIfMissing(
    database,
    "service_delivery_templates",
    "recurrence_days",
    "text NOT NULL DEFAULT ('[]')",
  );

  await database.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS project_delivery_routines (
      id char(36) NOT NULL,
      workspace_id char(36) NOT NULL,
      project_id char(36) NOT NULL,
      source_service_delivery_template_id char(36) NULL,
      name varchar(140) NOT NULL,
      description text NOT NULL,
      category_key varchar(64) NULL,
      priority_key varchar(64) NOT NULL,
      status_key varchar(64) NOT NULL,
      responsible_user_id char(36) NOT NULL,
      tag_ids text NOT NULL,
      tasks text NOT NULL,
      recurrence_type varchar(16) NOT NULL,
      recurrence_unit varchar(16) NULL,
      recurrence_days text NOT NULL,
      created_at timestamp(3) NOT NULL,
      updated_at timestamp(3) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY project_delivery_routines_workspace_id_id_unique (workspace_id, id),
      KEY project_delivery_routines_workspace_project_index (workspace_id, project_id),
      CONSTRAINT project_delivery_routines_workspace_project_foreign_key
        FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE,
      CONSTRAINT project_delivery_routines_workspace_member_foreign_key
        FOREIGN KEY (workspace_id, responsible_user_id)
        REFERENCES workspace_members (workspace_id, user_id)
    )
  `),
  );

  await addColumnIfMissing(
    database,
    "deliveries",
    "project_routine_id",
    "char(36) NULL",
  );
  await addColumnIfMissing(
    database,
    "deliveries",
    "routine_occurrence_date",
    "date NULL",
  );

  await database.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS delivery_comments (
      id char(36) NOT NULL,
      workspace_id char(36) NOT NULL,
      delivery_id char(36) NOT NULL,
      author_user_id char(36) NOT NULL,
      body text NOT NULL,
      created_at timestamp(3) NOT NULL,
      updated_at timestamp(3) NOT NULL,
      PRIMARY KEY (id),
      KEY delivery_comments_workspace_delivery_created_index (workspace_id, delivery_id, created_at, id),
      KEY delivery_comments_author_created_index (author_user_id, created_at),
      CONSTRAINT delivery_comments_workspace_delivery_foreign_key
        FOREIGN KEY (workspace_id, delivery_id)
        REFERENCES deliveries (workspace_id, id) ON DELETE CASCADE,
      CONSTRAINT delivery_comments_author_user_id_users_id_fk
        FOREIGN KEY (author_user_id)
        REFERENCES users (id) ON DELETE RESTRICT
    )
  `),
  );

  // Migration 0024: canonical business stages.
  await database.execute(
    sql.raw(
      "UPDATE `businesses` SET `stage_key` = 'ativo' WHERE `stage_key` IN ('ativado', 'ativa', 'ativada')",
    ),
  );

  // Institutional projects never participate in the Agenda as project cards.
  // Recurring institutional projects also stay outside the Agenda for dates and
  // deliveries, while one-off institutional deliveries keep their due dates.
  await database.execute(
    sql.raw(
      "UPDATE projects SET end_date = NULL WHERE is_institutional = true AND contract_type = 'recurring' AND end_date IS NOT NULL",
    ),
  );
  await database.execute(
    sql.raw(`
      UPDATE deliveries d
      INNER JOIN projects p
        ON p.workspace_id = d.workspace_id AND p.id = d.project_id
      SET d.due_date = NULL
      WHERE p.is_institutional = true AND p.contract_type = 'recurring'
        AND d.due_date IS NOT NULL
    `),
  );
  await database.execute(
    sql.raw(`
      DELETE ae FROM agenda_entries ae
      INNER JOIN projects p
        ON p.workspace_id = ae.workspace_id AND p.id = ae.project_id
      WHERE ae.entity_kind = 'project' AND p.is_institutional = true
    `),
  );
  await database.execute(
    sql.raw(`
      DELETE ae FROM agenda_entries ae
      INNER JOIN deliveries d
        ON d.workspace_id = ae.workspace_id AND d.id = ae.delivery_id
      INNER JOIN projects p
        ON p.workspace_id = d.workspace_id AND p.id = d.project_id
      WHERE ae.entity_kind = 'delivery' AND p.is_institutional = true
        AND p.contract_type = 'recurring'
    `),
  );

  // Migration 0025: restore end_date/due_date for one-off institutional
  // projects and deliveries when a contract end date is present.
  await database.execute(
    sql.raw(`
      UPDATE \`projects\` p
      INNER JOIN \`contracts\` c
        ON c.\`workspace_id\` = p.\`workspace_id\` AND c.\`id\` = p.\`contract_id\`
      SET p.\`end_date\` = c.\`end_date\`
      WHERE p.\`is_institutional\` = true
        AND c.\`contract_type\` = 'one_off'
        AND p.\`end_date\` IS NULL
        AND c.\`end_date\` IS NOT NULL
    `),
  );
  await database.execute(
    sql.raw(`
      UPDATE \`deliveries\` d
      INNER JOIN \`projects\` p
        ON p.\`workspace_id\` = d.\`workspace_id\` AND p.\`id\` = d.\`project_id\`
      INNER JOIN \`contracts\` c
        ON c.\`workspace_id\` = p.\`workspace_id\` AND c.\`id\` = p.\`contract_id\`
      SET d.\`due_date\` = c.\`end_date\`
      WHERE p.\`is_institutional\` = true
        AND c.\`contract_type\` = 'one_off'
        AND d.\`due_date\` IS NULL
        AND c.\`end_date\` IS NOT NULL
    `),
  );
}

async function ensureContractsSchema(database: Database): Promise<void> {
  const contractsTableExisted = await tableExists(database, "contracts");

  await database.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS \`contracts\` (
      \`id\` char(36) NOT NULL,
      \`workspace_id\` char(36) NOT NULL,
      \`owner_user_id\` char(36) NOT NULL,
      \`business_id\` char(36) NOT NULL,
      \`name\` varchar(140) NOT NULL,
      \`contract_type\` varchar(16) NOT NULL DEFAULT 'one_off',
      \`amount_cents\` bigint NOT NULL DEFAULT 0,
      \`start_date\` date NULL,
      \`end_date\` date NULL,
      \`first_due_date\` date NULL,
      \`payment_method\` varchar(120) NULL,
      \`payment_terms\` text NULL,
      \`finance_notes\` text NULL,
      \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`archived_at\` timestamp(3) NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`contracts_workspace_id_id_unique\` (\`workspace_id\`, \`id\`),
      UNIQUE KEY \`contracts_workspace_id_id_business_id_unique\` (\`workspace_id\`, \`id\`, \`business_id\`),
      KEY \`contracts_owner_workspace_updated_index\` (\`owner_user_id\`, \`workspace_id\`, \`updated_at\`),
      KEY \`contracts_workspace_business_archived_index\` (\`workspace_id\`, \`business_id\`, \`archived_at\`),
      KEY \`contracts_workspace_updated_id_index\` (\`workspace_id\`, \`updated_at\`, \`id\`),
      CONSTRAINT \`contracts_workspace_id_workspaces_id_fk\`
        FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`contracts_owner_user_id_users_id_fk\`
        FOREIGN KEY (\`owner_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`contracts_business_foreign_key\`
        FOREIGN KEY (\`business_id\`) REFERENCES \`businesses\` (\`id\`) ON DELETE CASCADE
    )
  `),
  );

  await database.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS \`contract_installments\` (
      \`id\` char(36) NOT NULL,
      \`workspace_id\` char(36) NOT NULL,
      \`contract_id\` char(36) NOT NULL,
      \`number\` int NOT NULL,
      \`due_date\` date NOT NULL,
      \`amount_cents\` bigint NOT NULL,
      \`status_key\` varchar(64) NULL,
      \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`contract_installments_workspace_id_id_unique\` (\`workspace_id\`, \`id\`),
      UNIQUE KEY \`contract_installments_contract_number_unique\` (\`workspace_id\`, \`contract_id\`, \`number\`),
      KEY \`contract_installments_workspace_due_status_index\` (\`workspace_id\`, \`due_date\`, \`status_key\`),
      CONSTRAINT \`contract_installments_workspace_id_workspaces_id_fk\`
        FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`contract_installments_workspace_contract_foreign_key\`
        FOREIGN KEY (\`workspace_id\`, \`contract_id\`) REFERENCES \`contracts\` (\`workspace_id\`, \`id\`) ON DELETE CASCADE
    )
  `),
  );

  await addColumnIfMissing(
    database,
    "projects",
    "is_active",
    "boolean NOT NULL DEFAULT true",
  );
  const addedProjectContractId = await addColumnIfMissing(
    database,
    "projects",
    "contract_id",
    "char(36) NULL",
  );
  await addColumnIfMissing(
    database,
    "projects",
    "engagement_type",
    "varchar(16) NOT NULL DEFAULT 'personal'",
  );

  const addedContractType = await addColumnIfMissing(
    database,
    "contracts",
    "contract_type",
    "varchar(16) NOT NULL DEFAULT 'one_off'",
  );
  await addColumnIfMissing(database, "contracts", "start_date", "date NULL");
  await addColumnIfMissing(database, "contracts", "end_date", "date NULL");
  await addColumnIfMissing(
    database,
    "contracts",
    "owner_user_id",
    "char(36) NULL",
  );
  await database.execute(
    sql.raw(`
      UPDATE contracts c
      INNER JOIN businesses b ON b.id = c.business_id
      SET c.owner_user_id = b.owner_user_id
      WHERE c.owner_user_id IS NULL OR c.owner_user_id <> b.owner_user_id
    `),
  );
  if (addedContractType) {
    await database.execute(
      sql.raw(`
        UPDATE \`contracts\` c
        INNER JOIN \`projects\` p
          ON p.\`workspace_id\` = c.\`workspace_id\` AND p.\`contract_id\` = c.\`id\`
        SET c.\`contract_type\` = p.\`contract_type\`
      `),
    );
  }
  await dropForeignKeyIfPresent(
    database,
    "contracts",
    "contracts_workspace_business_foreign_key",
  );
  await addUniqueIndexIfMissing(
    database,
    "contracts",
    "contracts_workspace_id_id_business_id_unique",
    "(`workspace_id`, `id`, `business_id`)",
  );
  await addIndexIfMissing(
    database,
    "contracts",
    "contracts_owner_workspace_updated_index",
    "(`owner_user_id`, `workspace_id`, `updated_at`)",
  );
  await addForeignKeyIfMissing(
    database,
    "contracts",
    "contracts_owner_user_id_users_id_fk",
    "(`owner_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE",
  );
  await addForeignKeyIfMissing(
    database,
    "contracts",
    "contracts_business_foreign_key",
    "(`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE",
  );

  await addColumnIfMissing(
    database,
    "deliveries",
    "engagement_type",
    "varchar(16) NOT NULL DEFAULT 'personal'",
  );
  await addColumnIfMissing(
    database,
    "delivery_tasks",
    "execution_at",
    "timestamp(3) NULL",
  );

  await addColumnIfMissing(
    database,
    "financial_entries",
    "contract_id",
    "char(36) NULL",
  );
  await addColumnIfMissing(
    database,
    "financial_entries",
    "contract_installment_id",
    "char(36) NULL",
  );
  await addColumnIfMissing(
    database,
    "financial_entries",
    "owner_user_id",
    "char(36) NULL",
  );
  await database.execute(
    sql.raw(`
      UPDATE financial_entries f
      INNER JOIN workspaces w ON w.id = f.workspace_id
      SET f.owner_user_id = w.owner_user_id
      WHERE f.owner_user_id IS NULL
    `),
  );
  await addIndexIfMissing(
    database,
    "financial_entries",
    "financial_entries_workspace_contract_index",
    "(`workspace_id`, `contract_id`, `deleted_at`)",
  );
  await addIndexIfMissing(
    database,
    "financial_entries",
    "financial_entries_owner_due_status_index",
    "(`owner_user_id`, `due_date`, `status`, `deleted_at`, `id`)",
  );
  await addUniqueIndexIfMissing(
    database,
    "financial_entries",
    "financial_entries_owner_contract_installment_unique",
    "(`owner_user_id`, `contract_installment_id`)",
  );
  await addForeignKeyIfMissing(
    database,
    "financial_entries",
    "financial_entries_owner_user_id_users_id_fk",
    "(`owner_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE",
  );
  await addForeignKeyIfMissing(
    database,
    "financial_entries",
    "financial_entries_workspace_contract_foreign_key",
    "(`workspace_id`, `contract_id`) REFERENCES `contracts` (`workspace_id`, `id`) ON DELETE CASCADE",
  );
  await addForeignKeyIfMissing(
    database,
    "financial_entries",
    "financial_entries_workspace_contract_installment_foreign_key",
    "(`workspace_id`, `contract_installment_id`) REFERENCES `contract_installments` (`workspace_id`, `id`) ON DELETE CASCADE",
  );

  if (!contractsTableExisted || addedProjectContractId) {
    await backfillLegacyProjectContracts(database);
  }

  await dropForeignKeyIfPresent(
    database,
    "projects",
    "projects_workspace_contract_foreign_key",
  );
  await addForeignKeyIfMissing(
    database,
    "projects",
    "projects_workspace_contract_business_foreign_key",
    "(`workspace_id`, `contract_id`, `business_id`) REFERENCES `contracts` (`workspace_id`, `id`, `business_id`) ON DELETE RESTRICT",
  );

  // Migration 0017: institutional projects are unique per contract rather than
  // per business so multiple contracts for the same business can coexist.
  await dropIndexIfPresent(
    database,
    "projects",
    "projects_workspace_business_institutional_unique",
  );
  await addColumnIfMissing(
    database,
    "projects",
    "institutional_contract_id",
    "char(36) GENERATED ALWAYS AS (case when `is_institutional` then `contract_id` else null end) VIRTUAL",
  );
  await addUniqueIndexIfMissing(
    database,
    "projects",
    "projects_workspace_contract_institutional_unique",
    "(`workspace_id`, `institutional_contract_id`)",
  );
}

async function backfillLegacyProjectContracts(
  database: Database,
): Promise<void> {
  const legacyProjects = rawRows<{ id: string; workspace_id: string }>(
    await database.execute(
      sql`SELECT id, workspace_id FROM projects WHERE contract_id IS NULL`,
    ),
  );

  for (const project of legacyProjects) {
    const contractId = randomUUID();
    await database.execute(sql`
      INSERT INTO contracts (
        id, workspace_id, owner_user_id, business_id, name, contract_type,
        amount_cents, start_date, end_date, first_due_date, payment_method,
        payment_terms, finance_notes, created_at, updated_at, archived_at
      )
      SELECT
        ${contractId}, p.workspace_id, b.owner_user_id, p.business_id, p.name,
        p.contract_type, COALESCE(p.amount_cents, 0), p.start_date, p.end_date,
        p.first_due_date, p.payment_method, p.payment_terms, p.finance_notes,
        p.created_at, p.updated_at, p.archived_at
      FROM projects p
      INNER JOIN businesses b ON b.id = p.business_id
      WHERE p.workspace_id = ${project.workspace_id}
        AND p.id = ${project.id}
        AND p.contract_id IS NULL
    `);
    await database.execute(sql`
      UPDATE projects
      SET contract_id = ${contractId}
      WHERE workspace_id = ${project.workspace_id}
        AND id = ${project.id}
        AND contract_id IS NULL
    `);
  }

  await database.execute(
    sql.raw(`
      INSERT IGNORE INTO \`contract_installments\` (
        \`id\`, \`workspace_id\`, \`contract_id\`, \`number\`, \`due_date\`,
        \`amount_cents\`, \`status_key\`, \`created_at\`, \`updated_at\`
      )
      SELECT
        UUID(), i.\`workspace_id\`, p.\`contract_id\`, i.\`number\`, i.\`due_date\`,
        i.\`amount_cents\`, i.\`status_key\`, i.\`created_at\`, i.\`updated_at\`
      FROM \`project_installments\` i
      INNER JOIN \`projects\` p
        ON p.\`workspace_id\` = i.\`workspace_id\` AND p.\`id\` = i.\`project_id\`
      WHERE p.\`contract_id\` IS NOT NULL
    `),
  );

  await database.execute(
    sql.raw(`
      UPDATE \`financial_entries\` f
      INNER JOIN \`projects\` p
        ON p.\`workspace_id\` = f.\`workspace_id\` AND p.\`id\` = f.\`project_id\`
      INNER JOIN \`project_installments\` old_i
        ON old_i.\`workspace_id\` = f.\`workspace_id\`
        AND old_i.\`id\` = f.\`project_installment_id\`
      INNER JOIN \`contract_installments\` new_i
        ON new_i.\`workspace_id\` = old_i.\`workspace_id\`
        AND new_i.\`contract_id\` = p.\`contract_id\`
        AND new_i.\`number\` = old_i.\`number\`
      SET f.\`contract_id\` = p.\`contract_id\`,
        f.\`contract_installment_id\` = new_i.\`id\`,
        f.\`source\` = 'contract'
      WHERE f.\`source\` = 'project'
        AND f.\`contract_id\` IS NULL
        AND p.\`contract_id\` IS NOT NULL
    `),
  );
}

async function renameLegacyDeliverySchema(database: Database): Promise<void> {
  const tables: Array<[string, string]> = [
    ["tasks", "deliveries"],
    ["task_subtasks", "delivery_tasks"],
    ["task_responsibles", "delivery_responsibles"],
    ["task_tags", "delivery_tags"],
    ["task_comments", "delivery_comments"],
    ["project_task_routines", "project_delivery_routines"],
    ["service_task_templates", "service_delivery_templates"],
    ["delivery_template_subtasks", "delivery_template_tasks"],
    ["personal_tasks", "personal_deliveries"],
  ];
  const columns: Array<[string, string, string]> = [
    ["delivery_tasks", "task_id", "delivery_id"],
    ["delivery_responsibles", "task_id", "delivery_id"],
    ["delivery_tags", "task_id", "delivery_id"],
    ["delivery_comments", "task_id", "delivery_id"],
    ["tool_uses", "task_id", "delivery_id"],
    ["agenda_entries", "task_id", "delivery_id"],
    ["cronograma_blocks", "task_id", "delivery_id"],
    ["cronograma_blocks", "subtask_id", "task_id"],
    ["project_delivery_routines", "subtasks", "tasks"],
    [
      "project_delivery_routines",
      "source_service_task_template_id",
      "source_service_delivery_template_id",
    ],
  ];

  const pendingTables: Array<[string, string]> = [];
  for (const [oldName, newName] of tables) {
    if (
      (await tableExists(database, oldName)) &&
      !(await tableExists(database, newName))
    ) {
      pendingTables.push([oldName, newName]);
    }
  }

  let foreignKeyChecksDisabled = false;
  try {
    if (pendingTables.length > 0) {
      // MySQL updates InnoDB foreign-key targets during RENAME TABLE. Disable
      // validation only while renaming the mutually-referencing aggregate.
      await database.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 0"));
      foreignKeyChecksDisabled = true;
      for (const [oldName, newName] of pendingTables) {
        await database.execute(
          sql.raw(`RENAME TABLE \`${oldName}\` TO \`${newName}\``),
        );
      }
    }

    for (const [table, oldName, newName] of columns) {
      if (
        (await columnExists(database, table, oldName)) &&
        !(await columnExists(database, table, newName))
      ) {
        if (!foreignKeyChecksDisabled) {
          await database.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 0"));
          foreignKeyChecksDisabled = true;
        }
        await database.execute(
          sql.raw(
            `ALTER TABLE \`${table}\` RENAME COLUMN \`${oldName}\` TO \`${newName}\``,
          ),
        );
      }
    }
  } finally {
    if (foreignKeyChecksDisabled) {
      await database.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 1"));
    }
  }
}

async function tableExists(
  database: Database,
  tableName: string,
): Promise<boolean> {
  const result = await database.execute(
    sql`select 1 as present from information_schema.tables
        where table_schema = database() and table_name = ${tableName} limit 1`,
  );
  return rawRows<{ present: number }>(result).length > 0;
}

async function columnExists(
  database: Database,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await database.execute(
    sql`select 1 as present from information_schema.columns
        where table_schema = database() and table_name = ${tableName}
          and column_name = ${columnName} limit 1`,
  );
  return rawRows<{ present: number }>(result).length > 0;
}

async function indexExists(
  database: Database,
  tableName: string,
  indexName: string,
): Promise<boolean> {
  const result = await database.execute(
    sql`select 1 as present from information_schema.statistics
        where table_schema = database() and table_name = ${tableName}
          and index_name = ${indexName} limit 1`,
  );
  return rawRows<{ present: number }>(result).length > 0;
}

async function foreignKeyExists(
  database: Database,
  tableName: string,
  constraintName: string,
): Promise<boolean> {
  const result = await database.execute(
    sql`select 1 as present from information_schema.table_constraints
        where constraint_schema = database() and table_name = ${tableName}
          and constraint_name = ${constraintName}
          and constraint_type = 'FOREIGN KEY' limit 1`,
  );
  return rawRows<{ present: number }>(result).length > 0;
}

async function addColumnIfMissing(
  database: Database,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<boolean> {
  if (await columnExists(database, tableName, columnName)) return false;

  await database.execute(
    sql.raw(
      `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`,
    ),
  );
  return true;
}

async function addIndexIfMissing(
  database: Database,
  tableName: string,
  indexName: string,
  columnsSql: string,
): Promise<boolean> {
  if (await indexExists(database, tableName, indexName)) return false;

  await database.execute(
    sql.raw(
      `ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` ${columnsSql}`,
    ),
  );
  return true;
}

async function addUniqueIndexIfMissing(
  database: Database,
  tableName: string,
  indexName: string,
  columnsSql: string,
): Promise<boolean> {
  if (await indexExists(database, tableName, indexName)) return false;

  await database.execute(
    sql.raw(
      `ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${indexName}\` UNIQUE ${columnsSql}`,
    ),
  );
  return true;
}

async function dropIndexIfPresent(
  database: Database,
  tableName: string,
  indexName: string,
): Promise<boolean> {
  if (!(await indexExists(database, tableName, indexName))) return false;

  await database.execute(
    sql.raw(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``),
  );
  return true;
}

async function addForeignKeyIfMissing(
  database: Database,
  tableName: string,
  constraintName: string,
  definitionSql: string,
): Promise<boolean> {
  if (await foreignKeyExists(database, tableName, constraintName)) return false;

  await database.execute(
    sql.raw(
      `ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` FOREIGN KEY ${definitionSql}`,
    ),
  );
  return true;
}

async function dropForeignKeyIfPresent(
  database: Database,
  tableName: string,
  constraintName: string,
): Promise<boolean> {
  if (!(await foreignKeyExists(database, tableName, constraintName))) {
    return false;
  }

  await database.execute(
    sql.raw(
      `ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${constraintName}\``,
    ),
  );
  return true;
}
