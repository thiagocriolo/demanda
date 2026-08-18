import { getServerEnvironment } from "../config/env";
import { createDatabase, type Database } from "./database";
import { createDatabasePool } from "./pool";

type DatabaseGlobals = typeof globalThis & {
  __demandaDatabase?: Database;
  __demandaDatabasePool?: ReturnType<typeof createDatabasePool>;
};

const databaseGlobals = globalThis as DatabaseGlobals;

export function getDatabasePool(): ReturnType<typeof createDatabasePool> {
  databaseGlobals.__demandaDatabasePool ??= createDatabasePool(
    getServerEnvironment(),
  );
  return databaseGlobals.__demandaDatabasePool;
}

export function getDatabase(): Database {
  databaseGlobals.__demandaDatabase ??= createDatabase(getDatabasePool());
  return databaseGlobals.__demandaDatabase;
}

export async function closeDatabase(): Promise<void> {
  if (!databaseGlobals.__demandaDatabasePool) return;
  await databaseGlobals.__demandaDatabasePool.end();
  databaseGlobals.__demandaDatabasePool = undefined;
  databaseGlobals.__demandaDatabase = undefined;
}
