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
import {
  applicationSchema,
  check,
  createdAt,
  timestamp,
  updatedAt,
  uuid,
} from "./base";

import { businesses } from "./crm";
import { users } from "./identity";
import type { DeliveryBoardOrder } from "./enums";
import { projects, projectDeliveryRoutines } from "./projects";
import { deliveryTemplates, tags } from "./services";
import { workspaceMembers, workspaces } from "./workspace";

export const deliveries = applicationSchema.table(
  "deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    businessId: uuid("business_id").notNull(),
    projectRoutineId: uuid("project_routine_id"),
    routineOccurrenceDate: date("routine_occurrence_date", { mode: "string" }),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description").default("").notNull(),
    categoryKey: varchar("category_key", { length: 64 }),
    priorityKey: varchar("priority_key", { length: 64 })
      .default("normal")
      .notNull(),
    statusKey: varchar("status_key", { length: 64 })
      .default("planejamento")
      .notNull(),
    dueDate: date("due_date", { mode: "string" }),
    engagementType: varchar("engagement_type", { length: 16 })
      .$type<"fee" | "personal">()
      .default("personal")
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    boardOrder: jsonb("board_order")
      .$type<DeliveryBoardOrder>()
      .default({})
      .notNull(),
    version: integer("version").default(1).notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("deliveries_workspace_id_id_unique").on(table.workspaceId, table.id),
    foreignKey({
      name: "deliveries_workspace_project_business_foreign_key",
      columns: [table.workspaceId, table.projectId, table.businessId],
      foreignColumns: [projects.workspaceId, projects.id, projects.businessId],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      name: "deliveries_workspace_project_routine_foreign_key",
      columns: [table.workspaceId, table.projectRoutineId],
      foreignColumns: [projectDeliveryRoutines.workspaceId, projectDeliveryRoutines.id],
    }).onDelete("restrict"),
    unique("deliveries_workspace_routine_occurrence_unique").on(
      table.workspaceId,
      table.projectRoutineId,
      table.routineOccurrenceDate,
    ),
    index("deliveries_workspace_updated_id_index").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
    index("deliveries_workspace_project_archived_order_index").on(
      table.workspaceId,
      table.projectId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("deliveries_workspace_business_archived_order_index").on(
      table.workspaceId,
      table.businessId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("deliveries_workspace_status_archived_order_index").on(
      table.workspaceId,
      table.statusKey,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("deliveries_workspace_priority_archived_order_index").on(
      table.workspaceId,
      table.priorityKey,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("deliveries_workspace_due_completion_archive_index").on(
      table.workspaceId,
      table.dueDate,
      table.completedAt,
      table.archivedAt,
      table.id,
    ),
    index("deliveries_workspace_name_lower_index").on(table.workspaceId, table.name),
    index("deliveries_name_search_index").on(table.name),
    check("deliveries_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "deliveries_engagement_type_allowed",
      sql`${table.engagementType} in ('fee', 'personal')`,
    ),
    check(
      "deliveries_category_normalized",
      sql`${table.categoryKey} is null or ${table.categoryKey} = lower(btrim(${table.categoryKey}))`,
    ),
    check(
      "deliveries_category_format",
      sql`${table.categoryKey} is null or ${table.categoryKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "deliveries_priority_normalized",
      sql`${table.priorityKey} = lower(btrim(${table.priorityKey}))`,
    ),
    check(
      "deliveries_priority_format",
      sql`${table.priorityKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "deliveries_status_normalized",
      sql`${table.statusKey} = lower(btrim(${table.statusKey}))`,
    ),
    check(
      "deliveries_status_format",
      sql`${table.statusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check("deliveries_status_not_archived", sql`${table.statusKey} <> 'arquivado'`),
    check(
      "deliveries_completion_status_consistent",
      sql`(${table.statusKey} = 'conclusao') = (${table.completedAt} is not null)`,
    ),
    check("deliveries_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
    check("deliveries_version_positive", sql`${table.version} > 0`),
    check(
      "deliveries_board_order_shape",
      sql`jsonb_typeof(${table.boardOrder}) = 'object'
        and ${table.boardOrder} - 'status' - 'priority' - 'business' - 'project' = '{}'
        and (not (${table.boardOrder} ? 'status') or
          (jsonb_typeof(${table.boardOrder}->'status') = 'number' and
           ${table.boardOrder}->>'status' ~ '^[0-9]{1,9}$'))
        and (not (${table.boardOrder} ? 'priority') or
          (jsonb_typeof(${table.boardOrder}->'priority') = 'number' and
           ${table.boardOrder}->>'priority' ~ '^[0-9]{1,9}$'))
        and (not (${table.boardOrder} ? 'business') or
          (jsonb_typeof(${table.boardOrder}->'business') = 'number' and
           ${table.boardOrder}->>'business' ~ '^[0-9]{1,9}$'))
        and (not (${table.boardOrder} ? 'project') or
          (jsonb_typeof(${table.boardOrder}->'project') = 'number' and
           ${table.boardOrder}->>'project' ~ '^[0-9]{1,9}$'))`,
    ),
    check(
      "deliveries_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "deliveries_completion_not_before_creation",
      sql`${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt}`,
    ),
    check(
      "deliveries_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const deliveryComments = applicationSchema.table(
  "delivery_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    deliveryId: uuid("delivery_id").notNull(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "delivery_comments_workspace_delivery_foreign_key",
      columns: [table.workspaceId, table.deliveryId],
      foreignColumns: [deliveries.workspaceId, deliveries.id],
    }).onDelete("cascade"),
    index("delivery_comments_workspace_delivery_created_index").on(
      table.workspaceId,
      table.deliveryId,
      table.createdAt,
      table.id,
    ),
    index("delivery_comments_author_created_index").on(
      table.authorUserId,
      table.createdAt,
    ),
    check(
      "delivery_comments_body_not_blank",
      sql`length(btrim(${table.body})) > 0`,
    ),
    check(
      "delivery_comments_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const deliveryTasks = applicationSchema.table(
  "delivery_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    deliveryId: uuid("delivery_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    durationMinutes: integer("duration_minutes").default(60).notNull(),
    /** Date and time at which this executable delivery is scheduled. */
    executionAt: timestamp("execution_at", { withTimezone: true, precision: 3 }),
    statusKey: varchar("status_key", { length: 64 })
      .default("pendente")
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("delivery_tasks_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("delivery_tasks_workspace_id_delivery_unique").on(
      table.workspaceId,
      table.id,
      table.deliveryId,
    ),
    foreignKey({
      name: "delivery_tasks_workspace_delivery_foreign_key",
      columns: [table.workspaceId, table.deliveryId],
      foreignColumns: [deliveries.workspaceId, deliveries.id],
    }).onDelete("cascade"),
    index("delivery_tasks_workspace_delivery_archived_order_index").on(
      table.workspaceId,
      table.deliveryId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("delivery_tasks_workspace_status_completion_index").on(
      table.workspaceId,
      table.statusKey,
      table.completedAt,
      table.id,
    ),
    check(
      "delivery_tasks_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "delivery_tasks_duration_range",
      sql`${table.durationMinutes} between 30 and 10080`,
    ),
    check(
      "delivery_tasks_duration_half_hour",
      sql`${table.durationMinutes} % 30 = 0`,
    ),
    check(
      "delivery_tasks_status_normalized",
      sql`${table.statusKey} = lower(btrim(${table.statusKey}))`,
    ),
    check(
      "delivery_tasks_status_format",
      sql`${table.statusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "delivery_tasks_status_not_archived",
      sql`${table.statusKey} <> 'arquivado'`,
    ),
    check(
      "delivery_tasks_completion_status_consistent",
      sql`(${table.statusKey} = 'concluida') = (${table.completedAt} is not null)`,
    ),
    check(
      "delivery_tasks_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
    check(
      "delivery_tasks_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "delivery_tasks_completion_not_before_creation",
      sql`${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt}`,
    ),
    check(
      "delivery_tasks_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const deliveryResponsibles = applicationSchema.table(
  "delivery_responsibles",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    deliveryId: uuid("delivery_id").notNull(),
    userId: uuid("user_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "delivery_responsibles_workspace_delivery_user_primary_key",
      columns: [table.workspaceId, table.deliveryId, table.userId],
    }),
    unique("delivery_responsibles_workspace_delivery_unique").on(
      table.workspaceId,
      table.deliveryId,
    ),
    foreignKey({
      name: "delivery_responsibles_workspace_delivery_foreign_key",
      columns: [table.workspaceId, table.deliveryId],
      foreignColumns: [deliveries.workspaceId, deliveries.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "delivery_responsibles_workspace_member_foreign_key",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }).onDelete("cascade"),
    index("delivery_responsibles_workspace_delivery_order_index").on(
      table.workspaceId,
      table.deliveryId,
      table.sortOrder,
      table.userId,
    ),
    index("delivery_responsibles_workspace_user_delivery_index").on(
      table.workspaceId,
      table.userId,
      table.deliveryId,
    ),
    check(
      "delivery_responsibles_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const deliveryTags = applicationSchema.table(
  "delivery_tags",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    deliveryId: uuid("delivery_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "delivery_tags_workspace_delivery_tag_primary_key",
      columns: [table.workspaceId, table.deliveryId, table.tagId],
    }),
    foreignKey({
      name: "delivery_tags_workspace_delivery_foreign_key",
      columns: [table.workspaceId, table.deliveryId],
      foreignColumns: [deliveries.workspaceId, deliveries.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "delivery_tags_workspace_tag_foreign_key",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tags.workspaceId, tags.id],
    }),
    index("delivery_tags_workspace_delivery_order_index").on(
      table.workspaceId,
      table.deliveryId,
      table.sortOrder,
      table.tagId,
    ),
    index("delivery_tags_workspace_tag_delivery_index").on(
      table.workspaceId,
      table.tagId,
      table.deliveryId,
    ),
    check("delivery_tags_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ],
);
