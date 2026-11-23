import type { Database } from "../db/database";

/** Minimal database surface required by finance-domain helpers. */
export type FinanceDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;
