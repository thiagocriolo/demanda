import type { WorkspaceSettingsState } from "../../settings/types";
import type { SettingsDatabase } from "./database";
import {
  synchronizeDeliveryTemplates,
  synchronizeServiceTaskTemplates,
} from "./workspace-delivery-template-sync";
import { synchronizeServiceTemplates } from "./workspace-service-template-sync";
import { loadWorkspaceMemberIndex } from "./workspace-template-members";

export { hydrateWorkspaceTemplates } from "./workspace-template-hydration";

export async function synchronizeWorkspaceTemplates(
  database: SettingsDatabase,
  workspaceId: string,
  actorUserId: string,
  settings: WorkspaceSettingsState,
  tagIds: Map<string, string>,
  now: Date,
): Promise<void> {
  const members = await loadWorkspaceMemberIndex(database, workspaceId);
  const serviceIds = await synchronizeServiceTemplates(
    database,
    workspaceId,
    actorUserId,
    settings,
    tagIds,
    members,
    now,
  );
  const deliveryIds = await synchronizeDeliveryTemplates(
    database,
    workspaceId,
    settings,
    serviceIds,
    tagIds,
    members,
    now,
  );
  await synchronizeServiceTaskTemplates(
    database,
    workspaceId,
    settings,
    serviceIds,
    deliveryIds,
    now,
  );
}
