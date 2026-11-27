import { sql } from "drizzle-orm";
import snapshot from "./bootstrap-schema.json";
import { rawRows, type Database } from "./database";

const MARKER = "__demanda_schema_bootstrap";

async function tables(
  database: Pick<Database, "execute">,
): Promise<Set<string>> {
  const result = await database.execute(sql`
    select table_name as name from information_schema.tables
    where table_schema = database() and table_type = 'BASE TABLE'
  `);
  return new Set(rawRows<{ name: string }>(result).map(({ name }) => name));
}

/** Create the complete current schema only in an empty database, never reset data. */
export async function initializeEmptyDatabase(
  database: Database,
): Promise<void> {
  const existing = await tables(database);
  if (existing.has("users") && !existing.has(MARKER)) return;
  if (existing.has(MARKER)) {
    const result = await database.execute(
      sql.raw(`select completed from \`${MARKER}\` where id = 1`),
    );
    if (rawRows<{ completed: number }>(result)[0]?.completed === 1) return;
  } else if ([...existing].some((name) => name !== "__drizzle_migrations")) {
    throw new Error(
      "O banco contém tabelas, mas não possui a estrutura básica do Demanda. A inicialização automática exige um banco vazio.",
    );
  }

  // DDL commits implicitly. The marker allows recovery after interruption;
  // the advisory lock uses the transaction's reserved connection across DDL.
  await database.transaction(async (transaction) => {
    const lock = await transaction.execute(
      sql`select get_lock(concat('demanda_bootstrap_', md5(database())), 30) as acquired`,
    );
    if (rawRows<{ acquired: number }>(lock)[0]?.acquired !== 1) {
      throw new Error(
        "Não foi possível obter o bloqueio para inicializar o banco do Demanda.",
      );
    }
    try {
      const lockedTables = await tables(transaction);
      // Another process may have finished while we were waiting for the lock.
      if (lockedTables.has("users") && !lockedTables.has(MARKER)) return;
      await transaction.execute(
        sql.raw(`CREATE TABLE IF NOT EXISTS \`${MARKER}\` (
        id int NOT NULL PRIMARY KEY,
        completed boolean NOT NULL DEFAULT false
      ) ENGINE=InnoDB`),
      );
      const marker = await transaction.execute(
        sql.raw(`select completed from \`${MARKER}\` where id = 1`),
      );
      if (rawRows<{ completed: number }>(marker)[0]?.completed === 1) return;
      await transaction.execute(
        sql.raw(
          `INSERT IGNORE INTO \`${MARKER}\` (id, completed) VALUES (1, false)`,
        ),
      );

      console.info("[runtime-schema] Initializing empty database.");
      for (const statement of snapshot.statements) {
        const createTable = /^CREATE TABLE `([^`]+)`/.exec(statement);
        if (createTable) {
          await transaction.execute(
            sql.raw(
              statement.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS "),
            ),
          );
          continue;
        }
        const foreignKey =
          /^ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)` FOREIGN KEY/.exec(
            statement,
          );
        if (foreignKey) {
          const found =
            await transaction.execute(sql`select 1 as present from information_schema.table_constraints
            where constraint_schema = database() and table_name = ${foreignKey[1]}
            and constraint_name = ${foreignKey[2]} and constraint_type = 'FOREIGN KEY'`);
          if (rawRows(found).length) continue;
        } else {
          const index = /^CREATE (?:UNIQUE )?INDEX `([^`]+)` ON `([^`]+)`/.exec(
            statement,
          );
          if (!index)
            throw new Error(
              "Instrução inesperada no schema inicial do Demanda.",
            );
          const found =
            await transaction.execute(sql`select 1 as present from information_schema.statistics
            where table_schema = database() and table_name = ${index[2]} and index_name = ${index[1]}`);
          if (rawRows(found).length) continue;
        }
        await transaction.execute(sql.raw(statement));
      }

      // The snapshot already represents these migrations, including renames.
      // Record its baseline so a later db:migrate does not replay old migrations.
      await transaction.execute(
        sql.raw(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id serial PRIMARY KEY, hash text NOT NULL, created_at bigint
      ) ENGINE=InnoDB`),
      );
      for (const migration of snapshot.migrations) {
        await transaction.execute(sql`insert into __drizzle_migrations (hash, created_at)
          select ${migration.hash}, ${migration.createdAt}
          where not exists (select 1 from __drizzle_migrations where created_at = ${migration.createdAt})`);
      }
      await transaction.execute(
        sql.raw(`UPDATE \`${MARKER}\` SET completed = true WHERE id = 1`),
      );
      console.info("[runtime-schema] Empty database initialized.");
    } finally {
      await transaction.execute(
        sql`select release_lock(concat('demanda_bootstrap_', md5(database())))`,
      );
    }
  });
}
