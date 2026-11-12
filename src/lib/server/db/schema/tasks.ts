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
import type { TaskBoardOrder } from "./enums";
import { projects, projectTaskRoutines } from "./projects";
import { deliveryTemplates, tags } from "./services";
import { workspaceMembers, workspaces } from "./workspace";

export const tasks = applicationSchema.table(
  "tasks",
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
    sortOrder: integer("sort_order").default(0).notNull(),
    boardOrder: jsonb("board_order")
      .$type<TaskBoardOrder>()
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
    unique("tasks_workspace_id_id_unique").on(table.workspaceId, table.id),
    foreignKey({
      name: "tasks_workspace_project_business_foreign_key",
      columns: [table.workspaceId, table.projectId, table.businessId],
      foreignColumns: [projects.workspaceId, projects.id, projects.businessId],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      name: "tasks_workspace_project_routine_foreign_key",
      columns: [table.workspaceId, table.projectRoutineId],
      foreignColumns: [projectTaskRoutines.workspaceId, projectTaskRoutines.id],
    }).onDelete("restrict"),
    unique("tasks_workspace_routine_occurrence_unique").on(
      table.workspaceId,
      table.projectRoutineId,
      table.routineOccurrenceDate,
    ),
    index("tasks_workspace_updated_id_index").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
    index("tasks_workspace_project_archived_order_index").on(
      table.workspaceId,
      table.projectId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("tasks_workspace_business_archived_order_index").on(
      table.workspaceId,
      table.businessId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("tasks_workspace_status_archived_order_index").on(
      table.workspaceId,
      table.statusKey,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("tasks_workspace_priority_archived_order_index").on(
      table.workspaceId,
      table.priorityKey,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("tasks_workspace_due_completion_archive_index").on(
      table.workspaceId,
      table.dueDate,
      table.completedAt,
      table.archivedAt,
      table.id,
    ),
    index("tasks_workspace_name_lower_index").on(table.workspaceId, table.name),
    index("tasks_name_search_index").on(table.name),
    check("tasks_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "tasks_category_normalized",
      sql`${table.categoryKey} is null or ${table.categoryKey} = lower(btrim(${table.categoryKey}))`,
    ),
    check(
      "tasks_category_format",
      sql`${table.categoryKey} is null or ${table.categoryKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "tasks_priority_normalized",
      sql`${table.priorityKey} = lower(btrim(${table.priorityKey}))`,
    ),
    check(
      "tasks_priority_format",
      sql`${table.priorityKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "tasks_status_normalized",
      sql`${table.statusKey} = lower(btrim(${table.statusKey}))`,
    ),
    check(
      "tasks_status_format",
      sql`${table.statusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check("tasks_status_not_archived", sql`${table.statusKey} <> 'arquivado'`),
    check(
      "tasks_completion_status_consistent",
      sql`(${table.statusKey} = 'conclusao') = (${table.completedAt} is not null)`,
    ),
    check("tasks_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
    check("tasks_version_positive", sql`${table.version} > 0`),
    check(
      "tasks_board_order_shape",
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
      "tasks_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "tasks_completion_not_before_creation",
      sql`${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt}`,
    ),
    check(
      "tasks_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const taskComments = applicationSchema.table(
  "task_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "task_comments_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    index("task_comments_workspace_task_created_index").on(
      table.workspaceId,
      table.taskId,
      table.createdAt,
      table.id,
    ),
    index("task_comments_author_created_index").on(
      table.authorUserId,
      table.createdAt,
    ),
    check(
      "task_comments_body_not_blank",
      sql`length(btrim(${table.body})) > 0`,
    ),
    check(
      "task_comments_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const taskSubtasks = applicationSchema.table(
  "task_subtasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    durationMinutes: integer("duration_minutes").default(60).notNull(),
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
    unique("task_subtasks_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("task_subtasks_workspace_id_task_unique").on(
      table.workspaceId,
      table.id,
      table.taskId,
    ),
    foreignKey({
      name: "task_subtasks_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    index("task_subtasks_workspace_task_archived_order_index").on(
      table.workspaceId,
      table.taskId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("task_subtasks_workspace_status_completion_index").on(
      table.workspaceId,
      table.statusKey,
      table.completedAt,
      table.id,
    ),
    check(
      "task_subtasks_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "task_subtasks_duration_range",
      sql`${table.durationMinutes} between 30 and 10080`,
    ),
    check(
      "task_subtasks_duration_half_hour",
      sql`${table.durationMinutes} % 30 = 0`,
    ),
    check(
      "task_subtasks_status_normalized",
      sql`${table.statusKey} = lower(btrim(${table.statusKey}))`,
    ),
    check(
      "task_subtasks_status_format",
      sql`${table.statusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "task_subtasks_status_not_archived",
      sql`${table.statusKey} <> 'arquivado'`,
    ),
    check(
      "task_subtasks_completion_status_consistent",
      sql`(${table.statusKey} = 'concluida') = (${table.completedAt} is not null)`,
    ),
    check(
      "task_subtasks_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
    check(
      "task_subtasks_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "task_subtasks_completion_not_before_creation",
      sql`${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt}`,
    ),
    check(
      "task_subtasks_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const taskResponsibles = applicationSchema.table(
  "task_responsibles",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    userId: uuid("user_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "task_responsibles_workspace_task_user_primary_key",
      columns: [table.workspaceId, table.taskId, table.userId],
    }),
    unique("task_responsibles_workspace_task_unique").on(
      table.workspaceId,
      table.taskId,
    ),
    foreignKey({
      name: "task_responsibles_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "task_responsibles_workspace_member_foreign_key",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }).onDelete("cascade"),
    index("task_responsibles_workspace_task_order_index").on(
      table.workspaceId,
      table.taskId,
      table.sortOrder,
      table.userId,
    ),
    index("task_responsibles_workspace_user_task_index").on(
      table.workspaceId,
      table.userId,
      table.taskId,
    ),
    check(
      "task_responsibles_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const taskTags = applicationSchema.table(
  "task_tags",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "task_tags_workspace_task_tag_primary_key",
      columns: [table.workspaceId, table.taskId, table.tagId],
    }),
    foreignKey({
      name: "task_tags_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "task_tags_workspace_tag_foreign_key",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tags.workspaceId, tags.id],
    }),
    index("task_tags_workspace_task_order_index").on(
      table.workspaceId,
      table.taskId,
      table.sortOrder,
      table.tagId,
    ),
    index("task_tags_workspace_tag_task_index").on(
      table.workspaceId,
      table.tagId,
      table.taskId,
    ),
    check("task_tags_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ],
);
