import type { Database } from "../db/database";

export type SettingsDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;
