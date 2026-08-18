import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/database";
import { workspaceConfigurations } from "../db/schema";

type SettingsVersionDatabase = Pick<Database, "insert" | "update">;

export async function ensureWorkspaceConfiguration(
  database: SettingsVersionDatabase,
  workspaceId: string,
): Promise<void> {
  await database
    .insert(workspaceConfigurations)
    .values({ workspaceId })
    .onConflictDoNothing({ target: workspaceConfigurations.workspaceId });
}

export async function touchWorkspaceConfiguration(
  database: SettingsVersionDatabase,
  workspaceId: string,
  now = new Date(),
): Promise<void> {
  await ensureWorkspaceConfiguration(database, workspaceId);
  await database
    .update(workspaceConfigurations)
    .set({
      version: sql`${workspaceConfigurations.version} + 1`,
      updatedAt: now,
    })
    .where(eq(workspaceConfigurations.workspaceId, workspaceId));
}
