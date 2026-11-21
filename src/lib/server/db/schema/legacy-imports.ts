import { primaryKey, varchar } from "drizzle-orm/mysql-core";
import { applicationSchema, createdAt, uuid } from "./base";
import { tasks } from "./tasks";
import { workspaces } from "./workspace";

/**
 * Immutable source markers make browser-data imports safe to retry. The legacy
 * payload itself is never persisted, only the accepted source identity.
 */
export const legacyImportRecords = applicationSchema.table(
  "legacy_import_records",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceKey: varchar("source_key", { length: 96 }).notNull(),
    sourceRecordId: varchar("source_record_id", { length: 160 }).notNull(),
    importedTaskId: uuid("imported_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      name: "legacy_import_records_workspace_source_record_primary",
      columns: [table.workspaceId, table.sourceKey, table.sourceRecordId],
    }),
  ],
);
