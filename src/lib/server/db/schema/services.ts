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

import { workspaceMembers, workspaces } from "./workspace";

export const services = applicationSchema.table(
  "services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description").default("").notNull(),
    defaultBriefing: text("default_briefing").default("").notNull(),
    icon: varchar("icon", { length: 80 })
      .default("briefcase-business")
      .notNull(),
    color: varchar("color", { length: 32 }).default("blue").notNull(),
    defaultStatusKey: varchar("default_status_key", { length: 64 })
      .default("planejamento")
      .notNull(),
    defaultDurationDays: integer("default_duration_days"),
    defaultContractType: varchar("default_contract_type", { length: 16 })
      .default("one_off")
      .notNull(),
    defaultAmountCents: bigint("default_amount_cents", { mode: "number" }),
    defaultInstallmentCount: integer("default_installment_count")
      .default(1)
      .notNull(),
    defaultPaymentMethod: varchar("default_payment_method", { length: 120 }),
    defaultPaymentTerms: text("default_payment_terms"),
    defaultFinanceNotes: text("default_finance_notes"),
    sortOrder: integer("sort_order").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
    activeName: varchar("active_name", { length: 140 }).generatedAlwaysAs(
      sql`case when archived_at is null then name else null end`,
    ),
  },
  (table) => [
    unique("services_workspace_id_id_unique").on(table.workspaceId, table.id),
    uniqueIndex("services_workspace_active_name_unique")
      .on(table.workspaceId, table.activeName),
    index("services_workspace_updated_id_index").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
    index("services_workspace_archived_name_index").on(
      table.workspaceId,
      table.archivedAt,
      table.name,
    ),
    index("services_workspace_archived_order_index").on(
      table.workspaceId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    check("services_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "services_default_status_normalized",
      sql`${table.defaultStatusKey} = lower(btrim(${table.defaultStatusKey}))`,
    ),
    check(
      "services_default_status_format",
      sql`${table.defaultStatusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "services_default_status_not_archived",
      sql`${table.defaultStatusKey} <> 'arquivado'`,
    ),
    check(
      "services_default_duration_range",
      sql`${table.defaultDurationDays} is null or ${table.defaultDurationDays} between 1 and 3650`,
    ),
    check(
      "services_default_contract_allowed",
      sql`${table.defaultContractType} in ('one_off', 'recurring')`,
    ),
    check(
      "services_default_amount_safe",
      sql`${table.defaultAmountCents} is null or ${table.defaultAmountCents} between 0 and 9007199254740991`,
    ),
    check(
      "services_default_installment_count_range",
      sql`${table.defaultInstallmentCount} between 1 and 99`,
    ),
    check("services_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
    check("services_version_positive", sql`${table.version} > 0`),
    check(
      "services_payment_method_not_blank",
      sql`${table.defaultPaymentMethod} is null or length(btrim(${table.defaultPaymentMethod})) > 0`,
    ),
    check(
      "services_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "services_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const tags = applicationSchema.table(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 64 }).notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("tags_workspace_id_id_unique").on(table.workspaceId, table.id),
    unique("tags_workspace_key_unique").on(table.workspaceId, table.key),
    index("tags_workspace_archived_key_index").on(
      table.workspaceId,
      table.archivedAt,
      table.sortOrder,
      table.key,
    ),
    index("tags_workspace_label_lower_index").on(
      table.workspaceId,
      table.label,
    ),
    check("tags_label_not_blank", sql`length(btrim(${table.label})) > 0`),
    check(
      "tags_key_normalized",
      sql`${table.key} = lower(btrim(${table.key}))`,
    ),
    check("tags_key_format", sql`${table.key} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`),
    check("tags_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
    check("tags_version_positive", sql`${table.version} > 0`),
    check(
      "tags_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "tags_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const serviceTags = applicationSchema.table(
  "service_tags",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "service_tags_workspace_service_tag_primary_key",
      columns: [table.workspaceId, table.serviceId, table.tagId],
    }),
    foreignKey({
      name: "service_tags_workspace_service_foreign_key",
      columns: [table.workspaceId, table.serviceId],
      foreignColumns: [services.workspaceId, services.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_tags_workspace_tag_foreign_key",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tags.workspaceId, tags.id],
    }),
    index("service_tags_workspace_service_order_index").on(
      table.workspaceId,
      table.serviceId,
      table.sortOrder,
      table.tagId,
    ),
    index("service_tags_workspace_tag_service_index").on(
      table.workspaceId,
      table.tagId,
      table.serviceId,
    ),
    check("service_tags_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ],
);

export const serviceResponsibles = applicationSchema.table(
  "service_responsibles",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull(),
    userId: uuid("user_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "service_responsibles_workspace_service_user_primary_key",
      columns: [table.workspaceId, table.serviceId, table.userId],
    }),
    foreignKey({
      name: "service_responsibles_workspace_service_foreign_key",
      columns: [table.workspaceId, table.serviceId],
      foreignColumns: [services.workspaceId, services.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_responsibles_workspace_member_foreign_key",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }).onDelete("cascade"),
    index("service_responsibles_workspace_service_order_index").on(
      table.workspaceId,
      table.serviceId,
      table.sortOrder,
      table.userId,
    ),
    index("service_responsibles_workspace_user_service_index").on(
      table.workspaceId,
      table.userId,
      table.serviceId,
    ),
    check(
      "service_responsibles_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const deliveryTemplates = applicationSchema.table(
  "delivery_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id"),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description").default("").notNull(),
    categoryKey: varchar("category_key", { length: 64 }),
    defaultStatusKey: varchar("default_status_key", { length: 64 })
      .default("planejamento")
      .notNull(),
    defaultPriorityKey: varchar("default_priority_key", { length: 64 })
      .default("normal")
      .notNull(),
    defaultDurationMinutes: integer("default_duration_minutes"),
    sortOrder: integer("sort_order").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
    activeName: varchar("active_name", { length: 140 }).generatedAlwaysAs(
      sql`case when archived_at is null then name else null end`,
    ),
  },
  (table) => [
    unique("delivery_templates_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      name: "delivery_templates_workspace_service_foreign_key",
      columns: [table.workspaceId, table.serviceId],
      foreignColumns: [services.workspaceId, services.id],
    }),
    uniqueIndex("delivery_templates_workspace_active_name_unique")
      .on(table.workspaceId, table.activeName),
    index("delivery_templates_workspace_service_order_index").on(
      table.workspaceId,
      table.serviceId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    check(
      "delivery_templates_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "delivery_templates_category_normalized",
      sql`${table.categoryKey} is null or ${table.categoryKey} = lower(btrim(${table.categoryKey}))`,
    ),
    check(
      "delivery_templates_category_format",
      sql`${table.categoryKey} is null or ${table.categoryKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "delivery_templates_status_normalized",
      sql`${table.defaultStatusKey} = lower(btrim(${table.defaultStatusKey}))`,
    ),
    check(
      "delivery_templates_status_format",
      sql`${table.defaultStatusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "delivery_templates_status_not_archived",
      sql`${table.defaultStatusKey} <> 'arquivado'`,
    ),
    check(
      "delivery_templates_priority_normalized",
      sql`${table.defaultPriorityKey} = lower(btrim(${table.defaultPriorityKey}))`,
    ),
    check(
      "delivery_templates_priority_format",
      sql`${table.defaultPriorityKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "delivery_templates_duration_range",
      sql`${table.defaultDurationMinutes} is null or ${table.defaultDurationMinutes} between 30 and 10080`,
    ),
    check(
      "delivery_templates_duration_half_hour",
      sql`${table.defaultDurationMinutes} is null or ${table.defaultDurationMinutes} % 30 = 0`,
    ),
    check(
      "delivery_templates_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
    check("delivery_templates_version_positive", sql`${table.version} > 0`),
    check(
      "delivery_templates_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "delivery_templates_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const serviceTaskTemplates = applicationSchema.table(
  "service_task_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull(),
    deliveryTemplateId: uuid("delivery_template_id").notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("service_task_templates_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      name: "service_task_templates_workspace_service_foreign_key",
      columns: [table.workspaceId, table.serviceId],
      foreignColumns: [services.workspaceId, services.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_task_templates_workspace_template_foreign_key",
      columns: [table.workspaceId, table.deliveryTemplateId],
      foreignColumns: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }).onDelete("cascade"),
    index("service_task_templates_workspace_service_order_index").on(
      table.workspaceId,
      table.serviceId,
      table.sortOrder,
      table.id,
    ),
    index("service_task_templates_workspace_template_index").on(
      table.workspaceId,
      table.deliveryTemplateId,
    ),
    check(
      "service_task_templates_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "service_task_templates_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
    check(
      "service_task_templates_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const deliveryTemplateSubtasks = applicationSchema.table(
  "delivery_template_subtasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    deliveryTemplateId: uuid("delivery_template_id").notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    defaultStatusKey: varchar("default_status_key", { length: 64 })
      .default("pendente")
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "delivery_template_subtasks_workspace_template_foreign_key",
      columns: [table.workspaceId, table.deliveryTemplateId],
      foreignColumns: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }).onDelete("cascade"),
    index("delivery_template_subtasks_workspace_template_order_index").on(
      table.workspaceId,
      table.deliveryTemplateId,
      table.sortOrder,
      table.id,
    ),
    check(
      "delivery_template_subtasks_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "delivery_template_subtasks_duration_range",
      sql`${table.durationMinutes} between 30 and 10080`,
    ),
    check(
      "delivery_template_subtasks_duration_half_hour",
      sql`${table.durationMinutes} % 30 = 0`,
    ),
    check(
      "delivery_template_subtasks_status_normalized",
      sql`${table.defaultStatusKey} = lower(btrim(${table.defaultStatusKey}))`,
    ),
    check(
      "delivery_template_subtasks_status_format",
      sql`${table.defaultStatusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "delivery_template_subtasks_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
    check(
      "delivery_template_subtasks_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const deliveryTemplateTags = applicationSchema.table(
  "delivery_template_tags",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    deliveryTemplateId: uuid("delivery_template_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "delivery_template_tags_workspace_template_tag_primary_key",
      columns: [table.workspaceId, table.deliveryTemplateId, table.tagId],
    }),
    foreignKey({
      name: "delivery_template_tags_workspace_template_foreign_key",
      columns: [table.workspaceId, table.deliveryTemplateId],
      foreignColumns: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "delivery_template_tags_workspace_tag_foreign_key",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tags.workspaceId, tags.id],
    }),
    check(
      "delivery_template_tags_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const deliveryTemplateResponsibles = applicationSchema.table(
  "delivery_template_responsibles",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    deliveryTemplateId: uuid("delivery_template_id").notNull(),
    userId: uuid("user_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "delivery_template_responsibles_primary_key",
      columns: [table.workspaceId, table.deliveryTemplateId, table.userId],
    }),
    foreignKey({
      name: "delivery_template_responsibles_workspace_template_foreign_key",
      columns: [table.workspaceId, table.deliveryTemplateId],
      foreignColumns: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "delivery_template_responsibles_workspace_member_foreign_key",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }).onDelete("cascade"),
    check(
      "delivery_template_responsibles_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);
