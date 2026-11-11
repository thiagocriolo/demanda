import { sql } from "drizzle-orm";
import {
  type AnyMySqlColumn,
  bigint,
  boolean,
  char,
  date,
  foreignKey,
  index,
  int as integer,
  json as jsonb,
  decimal as numeric,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { applicationSchema, check, createdAt, timestamp, updatedAt, uuid } from "./base";

import { users } from "./identity";
import { projects } from "./projects";
import { workspaces } from "./workspace";

export const projectInstallments = applicationSchema.table(
  "project_installments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    number: integer("number").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    statusKey: varchar("status_key", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("project_installments_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("project_installments_project_number_unique").on(
      table.workspaceId,
      table.projectId,
      table.number,
    ),
    foreignKey({
      name: "project_installments_workspace_project_foreign_key",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    index("project_installments_workspace_project_number_index").on(
      table.workspaceId,
      table.projectId,
      table.number,
    ),
    index("project_installments_workspace_due_status_index").on(
      table.workspaceId,
      table.dueDate,
      table.statusKey,
    ),
    check(
      "project_installments_number_range",
      sql`${table.number} between 1 and 999`,
    ),
    check(
      "project_installments_amount_safe",
      sql`${table.amountCents} between 0 and 9007199254740991`,
    ),
    check(
      "project_installments_status_normalized",
      sql`${table.statusKey} is null or ${table.statusKey} = lower(btrim(${table.statusKey}))`,
    ),
    check(
      "project_installments_status_format",
      sql`${table.statusKey} is null or ${table.statusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "project_installments_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const financialEntries = applicationSchema.table(
  "financial_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    projectInstallmentId: uuid("project_installment_id"),
    source: varchar("source", { length: 16 })
      .$type<"manual" | "project">()
      .notNull(),
    type: varchar("type", { length: 16 })
      .$type<"revenue" | "expense">()
      .notNull(),
    mode: varchar("mode", { length: 16 })
      .$type<"one_off" | "recurring">()
      .notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    category: varchar("category", { length: 120 }).default("").notNull(),
    notes: text("notes").default("").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    competenceDate: date("competence_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    status: varchar("status", { length: 16 })
      .$type<"open" | "paused" | "settled">()
      .default("open")
      .notNull(),
    settledAt: timestamp("settled_at", {
      withTimezone: true,
      precision: 3,
    }),
    settledByUserId: uuid("settled_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    seriesId: uuid("series_id"),
    seriesKind: varchar("series_kind", { length: 16 }).$type<
      "installment" | "recurrence"
    >(),
    seriesNumber: integer("series_number"),
    seriesCount: integer("series_count"),
    version: integer("version").default(1).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("financial_entries_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("financial_entries_workspace_project_installment_unique").on(
      table.workspaceId,
      table.projectInstallmentId,
    ),
    foreignKey({
      name: "financial_entries_workspace_project_foreign_key",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "financial_entries_workspace_project_installment_foreign_key",
      columns: [table.workspaceId, table.projectInstallmentId],
      foreignColumns: [projectInstallments.workspaceId, projectInstallments.id],
    }).onDelete("cascade"),
    index("financial_entries_workspace_due_status_index").on(
      table.workspaceId,
      table.dueDate,
      table.status,
      table.deletedAt,
      table.id,
    ),
    index("financial_entries_workspace_competence_type_index").on(
      table.workspaceId,
      table.competenceDate,
      table.type,
      table.deletedAt,
      table.id,
    ),
    index("financial_entries_workspace_series_index").on(
      table.workspaceId,
      table.seriesId,
      table.seriesNumber,
    ),
    index("financial_entries_workspace_project_index").on(
      table.workspaceId,
      table.projectId,
      table.deletedAt,
    ),
    check(
      "financial_entries_source_allowed",
      sql`${table.source} in ('manual', 'project')`,
    ),
    check(
      "financial_entries_source_consistent",
      sql`(${table.source} = 'manual' and ${table.projectId} is null and ${table.projectInstallmentId} is null)
        or (${table.source} = 'project' and ${table.projectId} is not null and ${table.projectInstallmentId} is not null)`,
    ),
    check(
      "financial_entries_type_allowed",
      sql`${table.type} in ('revenue', 'expense')`,
    ),
    check(
      "financial_entries_mode_allowed",
      sql`${table.mode} in ('one_off', 'recurring')`,
    ),
    check(
      "financial_entries_title_not_blank",
      sql`length(btrim(${table.title})) > 0`,
    ),
    check(
      "financial_entries_amount_positive",
      sql`${table.amount} > 0 and ${table.amount} <= 9999999999999999.99`,
    ),
    check(
      "financial_entries_status_allowed",
      sql`${table.status} in ('open', 'paused', 'settled')`,
    ),
    check(
      "financial_entries_settlement_consistent",
      sql`(${table.status} = 'settled') = (${table.settledAt} is not null)`,
    ),
    check(
      "financial_entries_series_consistent",
      sql`(${table.seriesKind} is null and ${table.seriesId} is null and ${table.seriesNumber} is null and ${table.seriesCount} is null)
        or (${table.seriesKind} in ('installment', 'recurrence') and ${table.seriesId} is not null and ${table.seriesNumber} between 1 and 999 and ${table.seriesCount} between 1 and 999 and ${table.seriesNumber} <= ${table.seriesCount})`,
    ),
    check("financial_entries_version_positive", sql`${table.version} > 0`),
    check(
      "financial_entries_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "financial_entries_deleted_not_before_creation",
      sql`${table.deletedAt} is null or ${table.deletedAt} >= ${table.createdAt}`,
    ),
  ],
);
