import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import type { Pool } from "mysql2/promise";
import * as schema from "./schema";

export type Database = MySql2Database<typeof schema>;

export function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object") return 0;
  const count = (header as { affectedRows?: unknown }).affectedRows;
  return typeof count === "number" ? count : 0;
}

/** Normaliza o primeiro item retornado pelo mysql2 para uma lista de linhas. */
export function rawRows<T>(result: unknown): T[] {
  const rows = Array.isArray(result) ? result[0] : result;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema, mode: "default" });
}
