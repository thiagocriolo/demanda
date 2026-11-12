import { sql } from "drizzle-orm";
import type { Database } from "./database";

type RuntimeSchemaGlobals = typeof globalThis & {
  __demandaRuntimeSchemaPromise?: Promise<void>;
};

const runtimeSchemaGlobals = globalThis as RuntimeSchemaGlobals;

/**
 * The managed Node.js runtime starts the generated entry file directly, so it
 * cannot run the Drizzle CLI during deployment. Keep the additive migrations
 * required by the running application here until that platform exposes a
 * migration command.
 */
export function ensureRuntimeSchema(database: Database): Promise<void> {
  runtimeSchemaGlobals.__demandaRuntimeSchemaPromise ??= applyRuntimeSchema(
    database,
  ).catch((cause) => {
    runtimeSchemaGlobals.__demandaRuntimeSchemaPromise = undefined;
    throw cause;
  });
  return runtimeSchemaGlobals.__demandaRuntimeSchemaPromise;
}

async function applyRuntimeSchema(database: Database): Promise<void> {
  await database.execute(
    sql.raw(`
    ALTER TABLE service_task_templates
      ADD COLUMN IF NOT EXISTS recurrence_type varchar(16) NOT NULL DEFAULT 'one_off',
      ADD COLUMN IF NOT EXISTS recurrence_unit varchar(16) NULL,
      ADD COLUMN IF NOT EXISTS recurrence_days text NOT NULL DEFAULT ('[]')
  `),
  );

  await database.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS project_task_routines (
      id char(36) NOT NULL,
      workspace_id char(36) NOT NULL,
      project_id char(36) NOT NULL,
      source_service_task_template_id char(36) NULL,
      name varchar(140) NOT NULL,
      description text NOT NULL,
      category_key varchar(64) NULL,
      priority_key varchar(64) NOT NULL,
      status_key varchar(64) NOT NULL,
      responsible_user_id char(36) NOT NULL,
      tag_ids text NOT NULL,
      subtasks text NOT NULL,
      recurrence_type varchar(16) NOT NULL,
      recurrence_unit varchar(16) NULL,
      recurrence_days text NOT NULL,
      created_at timestamp(3) NOT NULL,
      updated_at timestamp(3) NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY project_task_routines_workspace_id_id_unique (workspace_id, id),
      KEY project_task_routines_workspace_project_index (workspace_id, project_id),
      CONSTRAINT project_task_routines_workspace_project_foreign_key
        FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE,
      CONSTRAINT project_task_routines_workspace_member_foreign_key
        FOREIGN KEY (workspace_id, responsible_user_id)
        REFERENCES workspace_members (workspace_id, user_id)
    )
  `),
  );

  await database.execute(
    sql.raw(`
    ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS project_routine_id char(36) NULL,
      ADD COLUMN IF NOT EXISTS routine_occurrence_date date NULL
  `),
  );

  await database.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id char(36) NOT NULL,
      workspace_id char(36) NOT NULL,
      task_id char(36) NOT NULL,
      author_user_id char(36) NOT NULL,
      body text NOT NULL,
      created_at timestamp(3) NOT NULL,
      updated_at timestamp(3) NOT NULL,
      PRIMARY KEY (id),
      KEY task_comments_workspace_task_created_index (workspace_id, task_id, created_at, id),
      KEY task_comments_author_created_index (author_user_id, created_at),
      CONSTRAINT task_comments_workspace_task_foreign_key
        FOREIGN KEY (workspace_id, task_id)
        REFERENCES tasks (workspace_id, id) ON DELETE CASCADE,
      CONSTRAINT task_comments_author_user_id_users_id_fk
        FOREIGN KEY (author_user_id)
        REFERENCES users (id) ON DELETE RESTRICT
    )
  `),
  );
}
