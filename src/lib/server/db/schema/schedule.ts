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

import type { AgendaEntityKind } from "./enums";
import { projects } from "./projects";
import { taskSubtasks, tasks } from "./tasks";
import { workspaces } from "./workspace";

export const cronogramaBlocks = applicationSchema.table(
  "cronograma_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    subtaskId: uuid("subtask_id").notNull(),
    scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
    startMinutes: integer("start_minutes").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("cronograma_blocks_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("cronograma_blocks_workspace_subtask_unique").on(
      table.workspaceId,
      table.subtaskId,
    ),
    foreignKey({
      name: "cronograma_blocks_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "cronograma_blocks_workspace_subtask_foreign_key",
      columns: [table.workspaceId, table.subtaskId, table.taskId],
      foreignColumns: [
        taskSubtasks.workspaceId,
        taskSubtasks.id,
        taskSubtasks.taskId,
      ],
    }).onDelete("cascade"),
    index("cronograma_blocks_workspace_date_start_index").on(
      table.workspaceId,
      table.scheduledDate,
      table.startMinutes,
      table.id,
    ),
    index("cronograma_blocks_workspace_task_date_index").on(
      table.workspaceId,
      table.taskId,
      table.scheduledDate,
      table.startMinutes,
    ),
    check(
      "cronograma_blocks_start_half_hour",
      sql`${table.startMinutes} between 0 and 1410 and ${table.startMinutes} % 30 = 0`,
    ),
    check(
      "cronograma_blocks_duration_range",
      sql`${table.durationMinutes} between 30 and 480`,
    ),
    check(
      "cronograma_blocks_duration_half_hour",
      sql`${table.durationMinutes} % 30 = 0`,
    ),
    check(
      "cronograma_blocks_end_within_day",
      sql`${table.startMinutes} + ${table.durationMinutes} <= 1440`,
    ),
    check("cronograma_blocks_version_positive", sql`${table.version} > 0`),
    check(
      "cronograma_blocks_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const agendaEntries = applicationSchema.table(
  "agenda_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityKind: varchar("entity_kind", { length: 16 })
      .$type<AgendaEntityKind>()
      .notNull(),
    projectId: uuid("project_id"),
    taskId: uuid("task_id"),
    scheduledDate: date("scheduled_date", { mode: "string" }),
    position: integer("position").default(0).notNull(),
    durationMinutes: integer("duration_minutes").default(60).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("agenda_entries_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("agenda_entries_workspace_project_unique").on(
      table.workspaceId,
      table.projectId,
    ),
    unique("agenda_entries_workspace_task_unique").on(
      table.workspaceId,
      table.taskId,
    ),
    unique("agenda_entries_workspace_kind_date_position_unique")
      .on(
        table.workspaceId,
        table.entityKind,
        table.scheduledDate,
        table.position,
      )
      ,
    foreignKey({
      name: "agenda_entries_workspace_project_foreign_key",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agenda_entries_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    index("agenda_entries_workspace_kind_date_position_index").on(
      table.workspaceId,
      table.entityKind,
      table.scheduledDate,
      table.position,
      table.id,
    ),
    check(
      "agenda_entries_entity_kind_allowed",
      sql`${table.entityKind} in ('project', 'task')`,
    ),
    check(
      "agenda_entries_entity_consistent",
      sql`(${table.entityKind} = 'project' and ${table.projectId} is not null and ${table.taskId} is null)
        or (${table.entityKind} = 'task' and ${table.taskId} is not null and ${table.projectId} is null)`,
    ),
    check("agenda_entries_position_non_negative", sql`${table.position} >= 0`),
    check(
      "agenda_entries_duration_range",
      sql`${table.durationMinutes} between 30 and 10080`,
    ),
    check(
      "agenda_entries_duration_half_hour",
      sql`${table.durationMinutes} % 30 = 0`,
    ),
    check("agenda_entries_version_positive", sql`${table.version} > 0`),
    check(
      "agenda_entries_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);
