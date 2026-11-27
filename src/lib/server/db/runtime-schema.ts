import { sql } from "drizzle-orm";
import { rawRows, type Database } from "./database";
import { initializeEmptyDatabase } from "./bootstrap";

type RuntimeSchemaGlobals = typeof globalThis & {
  __demandaRuntimeSchemaPromise?: Promise<void>;
  __demandaRuntimeSchemaVersion?: string;
};

const RUNTIME_SCHEMA_VERSION = "2026-11-27-empty-database-v1";
const runtimeSchemaGlobals = globalThis as RuntimeSchemaGlobals;

/**
 * The managed Node.js runtime starts the generated entry file directly, so it
 * cannot run the Drizzle CLI during deployment. Keep the idempotent schema
 * guards required by the running application here until that platform exposes
 * a migration command.
 */
export function ensureRuntimeSchema(database: Database): Promise<void> {
  if (
    !runtimeSchemaGlobals.__demandaRuntimeSchemaPromise ||
    runtimeSchemaGlobals.__demandaRuntimeSchemaVersion !==
      RUNTIME_SCHEMA_VERSION
  ) {
    runtimeSchemaGlobals.__demandaRuntimeSchemaVersion = RUNTIME_SCHEMA_VERSION;
    runtimeSchemaGlobals.__demandaRuntimeSchemaPromise = applyRuntimeSchema(
      database,
    ).catch((cause) => {
      runtimeSchemaGlobals.__demandaRuntimeSchemaPromise = undefined;
      runtimeSchemaGlobals.__demandaRuntimeSchemaVersion = undefined;
      console.error(
        "[runtime-schema] Failed to apply runtime schema:",
        describeDatabaseError(cause),
      );
      throw cause;
    });
  }
  return runtimeSchemaGlobals.__demandaRuntimeSchemaPromise;
}

export async function applyRuntimeSchema(database: Database): Promise<void> {
  await initializeEmptyDatabase(database);
  await ensureServicePackagesSchema(database);
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
}

async function ensureServicePackagesSchema(database: Database): Promise<void> {
  await database.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS \`service_packages\` (
      \`id\` char(36) NOT NULL,
      \`owner_user_id\` char(36) NOT NULL,
      \`name\` varchar(140) NOT NULL,
      \`description\` text NOT NULL,
      \`icon\` varchar(80) NOT NULL DEFAULT 'package',
      \`color\` varchar(32) NOT NULL DEFAULT 'blue',
      \`amount_cents\` bigint NOT NULL DEFAULT 0,
      \`duration_months\` int NULL,
      \`installment_count\` int NOT NULL DEFAULT 1,
      \`payment_method\` varchar(120) NULL,
      \`payment_terms\` text NULL,
      \`sort_order\` int NOT NULL DEFAULT 0,
      \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`archived_at\` timestamp(3) NULL,
      PRIMARY KEY (\`id\`),
      KEY \`service_packages_owner_archived_updated_index\` (\`owner_user_id\`, \`archived_at\`, \`updated_at\`, \`id\`),
      KEY \`service_packages_owner_order_index\` (\`owner_user_id\`, \`sort_order\`, \`id\`),
      CONSTRAINT \`service_packages_owner_user_id_users_id_fk\`
        FOREIGN KEY (\`owner_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
    )
  `),
  );

  await database.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS \`service_package_projects\` (
      \`id\` char(36) NOT NULL,
      \`service_package_id\` char(36) NOT NULL,
      \`is_institutional\` boolean NOT NULL DEFAULT false,
      \`name\` varchar(140) NOT NULL,
      \`briefing\` text NOT NULL,
      \`project_type\` varchar(16) NOT NULL DEFAULT 'one_off',
      \`duration_days\` int NULL,
      \`sort_order\` int NOT NULL DEFAULT 0,
      \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`service_package_projects_package_order_index\` (\`service_package_id\`, \`sort_order\`, \`id\`),
      CONSTRAINT \`service_package_projects_package_fk\`
        FOREIGN KEY (\`service_package_id\`) REFERENCES \`service_packages\` (\`id\`) ON DELETE CASCADE
    )
  `),
  );

  await database.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS \`service_package_deliveries\` (
      \`id\` char(36) NOT NULL,
      \`service_package_id\` char(36) NOT NULL,
      \`service_project_id\` char(36) NOT NULL,
      \`name\` varchar(140) NOT NULL,
      \`description\` text NOT NULL,
      \`priority_key\` varchar(64) NOT NULL DEFAULT 'normal',
      \`recurrence_type\` varchar(16) NOT NULL DEFAULT 'one_off',
      \`recurrence_unit\` varchar(16) NULL,
      \`recurrence_days\` text NOT NULL,
      \`sort_order\` int NOT NULL DEFAULT 0,
      \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`service_package_deliveries_project_order_index\` (\`service_project_id\`, \`sort_order\`, \`id\`),
      KEY \`service_package_deliveries_package_index\` (\`service_package_id\`),
      CONSTRAINT \`service_package_deliveries_package_fk\`
        FOREIGN KEY (\`service_package_id\`) REFERENCES \`service_packages\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`service_package_deliveries_project_fk\`
        FOREIGN KEY (\`service_project_id\`) REFERENCES \`service_package_projects\` (\`id\`) ON DELETE CASCADE
    )
  `),
  );

  await database.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS \`service_package_tasks\` (
      \`id\` char(36) NOT NULL,
      \`service_package_id\` char(36) NOT NULL,
      \`service_delivery_id\` char(36) NOT NULL,
      \`name\` varchar(120) NOT NULL,
      \`duration_minutes\` int NOT NULL DEFAULT 60,
      \`sort_order\` int NOT NULL DEFAULT 0,
      \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`service_package_tasks_delivery_order_index\` (\`service_delivery_id\`, \`sort_order\`, \`id\`),
      KEY \`service_package_tasks_package_index\` (\`service_package_id\`),
      CONSTRAINT \`service_package_tasks_package_fk\`
        FOREIGN KEY (\`service_package_id\`) REFERENCES \`service_packages\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`service_package_tasks_delivery_fk\`
        FOREIGN KEY (\`service_delivery_id\`) REFERENCES \`service_package_deliveries\` (\`id\`) ON DELETE CASCADE
    )
  `),
  );
}

async function ensureContractsSchema(database: Database): Promise<void> {
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
  await addColumnIfMissing(
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

  await addColumnIfMissing(
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
  await addColumnIfMissing(
    database,
    "contracts",
    "source_service_package_id",
    "char(36) NULL",
  );
  await addForeignKeyIfMissing(
    database,
    "contracts",
    "contracts_source_service_package_fk",
    "(`source_service_package_id`) REFERENCES `service_packages` (`id`) ON DELETE SET NULL",
  );
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

  await dropIndexIfPresent(
    database,
    "projects",
    "projects_workspace_business_institutional_unique",
  );
  await ensureInstitutionalContractUniqueIndex(database);
}

async function ensureInstitutionalContractUniqueIndex(
  database: Database,
): Promise<void> {
  const indexName = "projects_workspace_contract_institutional_unique";
  if (await indexExists(database, "projects", indexName)) return;

  try {
    await addColumnIfMissing(
      database,
      "projects",
      "institutional_contract_id",
      "char(36) GENERATED ALWAYS AS (case when `is_institutional` then `contract_id` else null end) STORED",
    );

    await addUniqueIndexIfMissing(
      database,
      "projects",
      indexName,
      "(`workspace_id`, `institutional_contract_id`)",
    );
    return;
  } catch (firstError) {
    // MariaDB/InnoDB can reject adding a STORED generated column referencing a
    // foreign-key column (errno 1901) or reject indexing a VIRTUAL generated
    // column whose base column participates in a foreign key (errno 3175).
    // Try VIRTUAL when MariaDB rejects STORED, or STORED when MySQL rejects an
    // index on an existing VIRTUAL column. If neither works, keep the optional
    // index from blocking startup; application transactions also enforce this.
    const extra = await columnExtra(
      database,
      "projects",
      "institutional_contract_id",
    );
    if (extra.toUpperCase().includes("VIRTUAL")) {
      try {
        await database.execute(
          sql.raw(
            "ALTER TABLE `projects` DROP COLUMN `institutional_contract_id`",
          ),
        );
        await database.execute(
          sql.raw(
            "ALTER TABLE `projects` ADD COLUMN `institutional_contract_id` char(36) GENERATED ALWAYS AS (case when `is_institutional` then `contract_id` else null end) STORED",
          ),
        );
        await addUniqueIndexIfMissing(
          database,
          "projects",
          indexName,
          "(`workspace_id`, `institutional_contract_id`)",
        );
        return;
      } catch (retryError) {
        console.warn(
          "[runtime-schema] Skipping projects_workspace_contract_institutional_unique after STORED retry:",
          describeDatabaseError(retryError),
        );
        return;
      }
    }

    if (
      hasDatabaseErrno(firstError, 1901) &&
      !(await columnExists(database, "projects", "institutional_contract_id"))
    ) {
      try {
        await addColumnIfMissing(
          database,
          "projects",
          "institutional_contract_id",
          "char(36) GENERATED ALWAYS AS (case when `is_institutional` then `contract_id` else null end) VIRTUAL",
        );
        await addUniqueIndexIfMissing(
          database,
          "projects",
          indexName,
          "(`workspace_id`, `institutional_contract_id`)",
        );
        return;
      } catch (retryError) {
        console.warn(
          "[runtime-schema] Skipping projects_workspace_contract_institutional_unique after VIRTUAL retry:",
          describeDatabaseError(retryError),
        );
        return;
      }
    }

    console.warn(
      "[runtime-schema] Skipping projects_workspace_contract_institutional_unique:",
      describeDatabaseError(firstError),
    );
  }
}

function hasDatabaseErrno(error: unknown, errno: number): boolean {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    if (record.errno === errno) return true;
    current = record.cause;
  }
  return false;
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

async function columnExtra(
  database: Database,
  tableName: string,
  columnName: string,
): Promise<string> {
  const result = await database.execute(
    sql`select extra from information_schema.columns
        where table_schema = database() and table_name = ${tableName}
          and column_name = ${columnName} limit 1`,
  );
  const row = rawRows<{ extra?: string; EXTRA?: string }>(result)[0];
  return row?.extra ?? row?.EXTRA ?? "";
}

function describeDatabaseError(error: unknown): string {
  const parts: string[] = [];
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    const detail = [
      typeof record.code === "string" ? `code=${record.code}` : null,
      typeof record.errno === "number" ? `errno=${record.errno}` : null,
      typeof record.sqlState === "string"
        ? `sqlState=${record.sqlState}`
        : null,
      typeof record.sqlMessage === "string"
        ? `sqlMessage=${record.sqlMessage}`
        : null,
      typeof record.message === "string" ? record.message : null,
    ]
      .filter(Boolean)
      .join(" ");
    if (detail) parts.push(detail);
    current = record.cause;
  }
  return parts.join(" | ") || String(error);
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
