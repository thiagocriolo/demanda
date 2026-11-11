import { and, eq, sql } from "drizzle-orm";
import type {
  WorkspaceSettingsResponse,
  WorkspaceSettingsState,
} from "../../settings/types";
import { defaultWorkspaceSettings } from "../../settings/defaults";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
} from "../authorization/workspace-context";
import { affectedRows, type Database } from "../db/database";
import { workspaceConfigurations } from "../db/schema";
import type { SettingsDatabase } from "./database";
import {
  SettingsConflictError,
  SettingsRelationsInvalidError,
  SettingsVersionConflictError,
  translateSettingsConstraint,
} from "./errors";
import { workspaceSettingsSchema } from "./validation";
import {
  ensureWorkspaceDefaults,
  hydrateWorkspaceCatalogs,
  synchronizeWorkspaceCatalogs,
} from "./workspace-catalogs";
import {
  hydrateWorkspaceTemplates,
  synchronizeWorkspaceTemplates,
} from "./workspace-templates";

export function workspaceIdFromContext(
  context: RequestAuthorizationContext,
): string {
  return requireActiveWorkspacePermission(context, "workspace:read").workspace
    .id;
}

async function hydrateWorkspaceSettings(
  database: SettingsDatabase,
  workspaceId: string,
  version: number,
  templateGalleryVersion: number,
  canManage: boolean,
): Promise<WorkspaceSettingsResponse> {
  const settings = defaultWorkspaceSettings();
  settings.templateGalleryVersion = templateGalleryVersion;
  await hydrateWorkspaceCatalogs(database, workspaceId, settings);
  await hydrateWorkspaceTemplates(database, workspaceId, settings);
  return { workspaceId, version, canManage, settings };
}

export async function getWorkspaceSettings(
  database: Database,
  context: RequestAuthorizationContext,
): Promise<WorkspaceSettingsResponse> {
  const workspaceId = workspaceIdFromContext(context);
  const access = await requireWorkspacePermission(
    database,
    context.user.id,
    workspaceId,
    "workspace:read",
  );
  return database.transaction(async (transaction) => {
    await ensureWorkspaceDefaults(transaction, workspaceId);
    const [configuration] = await transaction
      .select()
      .from(workspaceConfigurations)
      .where(eq(workspaceConfigurations.workspaceId, workspaceId))
      .limit(1);
    if (!configuration) throw new SettingsRelationsInvalidError();
    return hydrateWorkspaceSettings(
      transaction,
      workspaceId,
      configuration.version,
      configuration.templateGalleryVersion,
      access.membership.role === "owner" || access.membership.role === "admin",
    );
  });
}

export async function updateWorkspaceSettings(
  database: Database,
  context: RequestAuthorizationContext,
  input: { version: number; settings: WorkspaceSettingsState },
): Promise<WorkspaceSettingsResponse> {
  const workspaceId = workspaceIdFromContext(context);
  const settings = workspaceSettingsSchema.parse(input.settings);
  try {
    return await database.transaction(async (transaction) => {
      const access = await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:administer",
      );
      await ensureWorkspaceDefaults(transaction, workspaceId);
      const [configuration] = await transaction
        .select()
        .from(workspaceConfigurations)
        .where(eq(workspaceConfigurations.workspaceId, workspaceId))
        .limit(1)
        .for("update");
      if (!configuration || configuration.version !== input.version) {
        throw new SettingsVersionConflictError();
      }
      const now = new Date();
      const tagIds = await synchronizeWorkspaceCatalogs(
        transaction,
        workspaceId,
        settings,
        now,
      );
      await synchronizeWorkspaceTemplates(
        transaction,
        workspaceId,
        context.user.id,
        settings,
        tagIds,
        now,
      );
      const updated = await transaction
        .update(workspaceConfigurations)
        .set({
          version: sql`${workspaceConfigurations.version} + 1`,
          templateGalleryVersion: settings.templateGalleryVersion,
          updatedAt: now,
        })
        .where(
          and(
            eq(workspaceConfigurations.workspaceId, workspaceId),
            eq(workspaceConfigurations.version, input.version),
          ),
        );
      if (affectedRows(updated) !== 1) throw new SettingsVersionConflictError();
      return hydrateWorkspaceSettings(
        transaction,
        workspaceId,
        input.version + 1,
        settings.templateGalleryVersion,
        access.membership.role === "owner" ||
          access.membership.role === "admin",
      );
    });
  } catch (error) {
    if (
      error instanceof SettingsVersionConflictError ||
      error instanceof SettingsRelationsInvalidError ||
      error instanceof SettingsConflictError
    ) {
      throw error;
    }
    translateSettingsConstraint(error);
  }
}
