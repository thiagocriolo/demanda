import type { Database } from "../db/database";

/** Minimal database surface required by business-domain helpers. */
export type BusinessDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;
