export const GLOBAL_WORKSPACE_SCOPE_ID = "global";

let selectedWorkspaceId = "";
let accessibleWorkspaceIds: string[] = [];

/** Atualizado pelo armazenamento de workspaces; mantido sem dependencias Svelte. */
export function setWorkspaceRequestScope(
  selectedId: string,
  workspaceIds: string[],
): void {
  selectedWorkspaceId = selectedId;
  accessibleWorkspaceIds = [...workspaceIds];
}

export function isGlobalWorkspaceScope(): boolean {
  return selectedWorkspaceId === GLOBAL_WORKSPACE_SCOPE_ID;
}

export function workspaceIdsForRequestScope(): string[] {
  if (isGlobalWorkspaceScope()) return [...accessibleWorkspaceIds];
  return selectedWorkspaceId ? [selectedWorkspaceId] : [];
}
