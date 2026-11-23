import type { Database } from "../db/database";

/** Minimal database surface required by contact-domain helpers. */
export type ContactDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;
