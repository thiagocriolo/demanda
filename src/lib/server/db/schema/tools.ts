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

import type {
  ToolConfig,
  ToolKey,
  ToolResponsePayload,
  ToolUseContent,
  ToolUseStatus,
} from "../../../tools/types";
import { users } from "./identity";
import { tasks } from "./tasks";
import { workspaces } from "./workspace";

export const toolModels = applicationSchema.table(
  "tool_models",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    toolKey: varchar("tool_key", { length: 32 }).$type<ToolKey>().notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 500 }).default("").notNull(),
    config: jsonb("config").$type<ToolConfig>().notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("tool_models_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("tool_models_workspace_tool_archived_updated_index").on(
      table.workspaceId,
      table.toolKey,
      table.archivedAt,
      table.updatedAt,
      table.id,
    ),
    index("tool_models_workspace_name_lower_index").on(
      table.workspaceId,
      table.name,
    ),
    check(
      "tool_models_tool_key_allowed",
      sql`${table.toolKey} in ('form', 'evaluation', 'comparison', 'intensity')`,
    ),
    check("tool_models_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "tool_models_config_object",
      sql`jsonb_typeof(${table.config}) = 'object'`,
    ),
    check("tool_models_version_positive", sql`${table.version} > 0`),
    check(
      "tool_models_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "tool_models_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const toolUses = applicationSchema.table(
  "tool_uses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    modelId: uuid("model_id").notNull(),
    taskId: uuid("task_id"),
    toolKey: varchar("tool_key", { length: 32 }).$type<ToolKey>().notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    configSnapshot: jsonb("config_snapshot").$type<ToolConfig>().notNull(),
    content: jsonb("content").$type<ToolUseContent>().notNull(),
    status: varchar("status", { length: 16 })
      .$type<ToolUseStatus>()
      .default("draft")
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
    unique("tool_uses_workspace_id_id_unique").on(table.workspaceId, table.id),
    foreignKey({
      name: "tool_uses_workspace_model_foreign_key",
      columns: [table.workspaceId, table.modelId],
      foreignColumns: [toolModels.workspaceId, toolModels.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "tool_uses_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    index("tool_uses_workspace_status_updated_index").on(
      table.workspaceId,
      table.status,
      table.updatedAt,
      table.id,
    ),
    index("tool_uses_workspace_tool_updated_index").on(
      table.workspaceId,
      table.toolKey,
      table.updatedAt,
      table.id,
    ),
    index("tool_uses_workspace_task_index").on(
      table.workspaceId,
      table.taskId,
      table.updatedAt,
    ),
    check(
      "tool_uses_tool_key_allowed",
      sql`${table.toolKey} in ('form', 'evaluation', 'comparison', 'intensity')`,
    ),
    check(
      "tool_uses_status_allowed",
      sql`${table.status} in ('draft', 'open', 'completed', 'archived')`,
    ),
    check("tool_uses_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "tool_uses_json_objects",
      sql`jsonb_typeof(${table.configSnapshot}) = 'object' and jsonb_typeof(${table.content}) = 'object'`,
    ),
    check("tool_uses_version_positive", sql`${table.version} > 0`),
    check(
      "tool_uses_completion_consistent",
      sql`(${table.status} = 'completed' and ${table.completedAt} is not null)
        or (${table.status} in ('draft', 'open') and ${table.completedAt} is null)
        or ${table.status} = 'archived'`,
    ),
    check(
      "tool_uses_archive_consistent",
      sql`(${table.status} = 'archived') = (${table.archivedAt} is not null)`,
    ),
    check(
      "tool_uses_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const toolResponses = applicationSchema.table(
  "tool_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    useId: uuid("use_id").notNull(),
    respondentUserId: uuid("respondent_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    payload: jsonb("payload").$type<ToolResponsePayload>().notNull(),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "tool_responses_workspace_use_foreign_key",
      columns: [table.workspaceId, table.useId],
      foreignColumns: [toolUses.workspaceId, toolUses.id],
    }).onDelete("cascade"),
    unique("tool_responses_workspace_use_respondent_unique").on(
      table.workspaceId,
      table.useId,
      table.respondentUserId,
    ),
    index("tool_responses_workspace_use_submitted_index").on(
      table.workspaceId,
      table.useId,
      table.submittedAt,
      table.id,
    ),
    check(
      "tool_responses_payload_object",
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
    check(
      "tool_responses_submission_not_before_creation",
      sql`${table.submittedAt} >= ${table.createdAt}`,
    ),
  ],
);
