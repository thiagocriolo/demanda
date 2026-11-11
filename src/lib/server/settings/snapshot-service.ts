import type {
  PersonalSettingsState,
  SettingsSnapshot,
  WorkspaceSettingsState,
} from "../../settings/types";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import type { Database } from "../db/database";
import { SettingsVersionConflictError } from "./errors";
import { getUserSettings, updateUserSettings } from "./personal-service";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
  workspaceIdFromContext,
} from "./workspace-service";

export async function getSettingsSnapshot(
  database: Database,
  context: RequestAuthorizationContext,
): Promise<SettingsSnapshot> {
  const [personal, workspace] = await Promise.all([
    getUserSettings(database, context),
    getWorkspaceSettings(database, context),
  ]);
  return { personal, workspace };
}

export async function importSettingsSnapshot(
  database: Database,
  context: RequestAuthorizationContext,
  input: {
    personalVersion: number;
    personal: PersonalSettingsState;
    workspace?: {
      workspaceId: string;
      version: number;
      settings: WorkspaceSettingsState;
    };
  },
): Promise<SettingsSnapshot> {
  const activeWorkspaceId = workspaceIdFromContext(context);
  if (input.workspace && input.workspace.workspaceId !== activeWorkspaceId) {
    throw new SettingsVersionConflictError();
  }
  return database.transaction(async (transaction) => {
    const scoped = transaction as unknown as Database;
    const personal = await updateUserSettings(scoped, context, {
      version: input.personalVersion,
      settings: input.personal,
    });
    const workspace = input.workspace
      ? await updateWorkspaceSettings(scoped, context, {
          version: input.workspace.version,
          settings: input.workspace.settings,
        })
      : await getWorkspaceSettings(scoped, context);
    return { personal, workspace };
  });
}
