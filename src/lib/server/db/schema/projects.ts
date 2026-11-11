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

import { businesses } from "./crm";
import { services, tags } from "./services";
import { workspaceMembers, workspaces } from "./workspace";

export const projects = applicationSchema.table(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    sourceServiceId: uuid("source_service_id"),
    isInstitutional: boolean("is_institutional").default(false).notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    statusKey: varchar("status_key", { length: 64 }).notNull(),
    briefing: text("briefing").default("").notNull(),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    contractType: varchar("contract_type", { length: 16 })
      .default("one_off")
      .notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }),
    firstDueDate: date("first_due_date", { mode: "string" }),
    paymentMethod: varchar("payment_method", { length: 120 }),
    paymentTerms: text("payment_terms"),
    financeNotes: text("finance_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("projects_workspace_id_id_unique").on(table.workspaceId, table.id),
    unique("projects_workspace_id_business_id_unique").on(
      table.workspaceId,
      table.id,
      table.businessId,
    ),
    foreignKey({
      name: "projects_workspace_source_service_foreign_key",
      columns: [table.workspaceId, table.sourceServiceId],
      foreignColumns: [services.workspaceId, services.id],
    }),
    index("projects_workspace_updated_id_index").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
    index("projects_workspace_status_archived_index").on(
      table.workspaceId,
      table.statusKey,
      table.archivedAt,
    ),
    index("projects_workspace_business_archived_index").on(
      table.workspaceId,
      table.businessId,
      table.archivedAt,
    ),
    index("projects_workspace_source_service_index").on(
      table.workspaceId,
      table.sourceServiceId,
    ),
    index("projects_workspace_name_lower_index").on(
      table.workspaceId,
      table.name,
    ),
    index("projects_name_search_index").on(table.name),
    index("projects_workspace_end_status_archive_index").on(
      table.workspaceId,
      table.endDate,
      table.statusKey,
      table.archivedAt,
    ),
    check("projects_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "projects_status_key_normalized",
      sql`${table.statusKey} = lower(btrim(${table.statusKey}))`,
    ),
    check(
      "projects_status_key_format",
      sql`${table.statusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "projects_status_not_archived",
      sql`${table.statusKey} <> 'arquivado'`,
    ),
    check(
      "projects_contract_type_allowed",
      sql`${table.contractType} in ('one_off', 'recurring')`,
    ),
    check(
      "projects_amount_cents_safe",
      sql`${table.amountCents} is null or ${table.amountCents} between 0 and 9007199254740991`,
    ),
    check(
      "projects_dates_ordered",
      sql`${table.startDate} is null or ${table.endDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      "projects_payment_method_not_blank",
      sql`${table.paymentMethod} is null or length(btrim(${table.paymentMethod})) > 0`,
    ),
    check(
      "projects_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "projects_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
    check(
      "projects_institutional_not_archived",
      sql`not ${table.isInstitutional} or ${table.archivedAt} is null`,
    ),
  ],
);

export const projectServices = applicationSchema.table(
  "project_services",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "project_services_workspace_project_service_primary_key",
      columns: [table.workspaceId, table.projectId, table.serviceId],
    }),
    foreignKey({
      name: "project_services_workspace_project_foreign_key",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "project_services_workspace_service_foreign_key",
      columns: [table.workspaceId, table.serviceId],
      foreignColumns: [services.workspaceId, services.id],
    }),
    index("project_services_workspace_project_order_index").on(
      table.workspaceId,
      table.projectId,
      table.sortOrder,
      table.serviceId,
    ),
    index("project_services_workspace_service_project_index").on(
      table.workspaceId,
      table.serviceId,
      table.projectId,
    ),
    check(
      "project_services_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const projectTags = applicationSchema.table(
  "project_tags",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "project_tags_workspace_project_tag_primary_key",
      columns: [table.workspaceId, table.projectId, table.tagId],
    }),
    foreignKey({
      name: "project_tags_workspace_project_foreign_key",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "project_tags_workspace_tag_foreign_key",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tags.workspaceId, tags.id],
    }),
    index("project_tags_workspace_project_order_index").on(
      table.workspaceId,
      table.projectId,
      table.sortOrder,
      table.tagId,
    ),
    index("project_tags_workspace_tag_project_index").on(
      table.workspaceId,
      table.tagId,
      table.projectId,
    ),
    check("project_tags_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ],
);

export const projectResponsibles = applicationSchema.table(
  "project_responsibles",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    userId: uuid("user_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "project_responsibles_workspace_project_user_primary_key",
      columns: [table.workspaceId, table.projectId, table.userId],
    }),
    foreignKey({
      name: "project_responsibles_workspace_project_foreign_key",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "project_responsibles_workspace_member_foreign_key",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }).onDelete("cascade"),
    index("project_responsibles_workspace_project_order_index").on(
      table.workspaceId,
      table.projectId,
      table.sortOrder,
      table.userId,
    ),
    index("project_responsibles_workspace_user_project_index").on(
      table.workspaceId,
      table.userId,
      table.projectId,
    ),
    check(
      "project_responsibles_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);
