import type { ProjectResponsible } from "$lib/projects/types";

export type DeliveryResponsibleWorkspaceInput = {
  contractId: string;
  contractWorkspaceId?: string;
  optionsWorkspaceId: string;
};

export function hasDeliveryResponsibleWorkspace({
  contractId,
  contractWorkspaceId,
  optionsWorkspaceId,
}: DeliveryResponsibleWorkspaceInput): boolean {
  if (!contractId || !optionsWorkspaceId) return false;
  return !contractWorkspaceId || contractWorkspaceId === optionsWorkspaceId;
}

export type DeliveryResponsibleEnabledInput = {
  viewOnly: boolean;
  hasContractWorkspace: boolean;
  hasProject: boolean;
  contractsLoading: boolean;
  projectLoading: boolean;
  contractsError: boolean;
  projectError: boolean;
};

export function canSelectDeliveryResponsible({
  viewOnly,
  hasContractWorkspace,
  hasProject,
  contractsLoading,
  projectLoading,
  contractsError,
  projectError,
}: DeliveryResponsibleEnabledInput): boolean {
  return !(
    viewOnly ||
    (!hasContractWorkspace && !hasProject) ||
    contractsLoading ||
    projectLoading ||
    contractsError ||
    projectError
  );
}

export type RecordResponsiblesForWorkspaceInput = {
  currentRecordResponsibles: ProjectResponsible[];
  recordWorkspaceId?: string;
  activeWorkspaceId?: string;
};

export function currentRecordResponsiblesForWorkspace({
  currentRecordResponsibles,
  recordWorkspaceId,
  activeWorkspaceId,
}: RecordResponsiblesForWorkspaceInput): ProjectResponsible[] {
  if (
    activeWorkspaceId &&
    recordWorkspaceId &&
    activeWorkspaceId !== recordWorkspaceId
  ) {
    return [];
  }
  return currentRecordResponsibles;
}

export type DeliveryResponsibleSyncInput = {
  hasContractWorkspace: boolean;
  hasProject: boolean;
  workspaceMembers: ProjectResponsible[];
  currentRecordResponsibles: ProjectResponsible[];
  recordWorkspaceId?: string;
  activeWorkspaceId?: string;
  selectedResponsibleIds: string[];
  fallbackResponsibleId?: string;
};

export type DeliveryResponsibleSyncResult = {
  members: ProjectResponsible[];
  selectedResponsible?: ProjectResponsible;
};

function uniqueResponsibles(
  items: ProjectResponsible[],
): ProjectResponsible[] {
  return items.filter(
    (item, index) =>
      items.findIndex(({ userId }) => userId === item.userId) === index,
  );
}

export function resolveDeliveryResponsibleSelection({
  hasContractWorkspace,
  hasProject,
  workspaceMembers,
  currentRecordResponsibles,
  recordWorkspaceId,
  activeWorkspaceId,
  selectedResponsibleIds,
  fallbackResponsibleId,
}: DeliveryResponsibleSyncInput): DeliveryResponsibleSyncResult {
  if (!hasContractWorkspace && !hasProject) {
    return { members: [], selectedResponsible: undefined };
  }

  const members = workspaceMembers;
  const available = uniqueResponsibles([
    ...members,
    ...currentRecordResponsiblesForWorkspace({
      currentRecordResponsibles,
      recordWorkspaceId,
      activeWorkspaceId,
    }),
  ]);

  const candidateId =
    selectedResponsibleIds[0] ||
    (selectedResponsibleIds.length === 0 ? fallbackResponsibleId : undefined);
  const selectedResponsible = candidateId
    ? available.find(({ userId }) => userId === candidateId)
    : undefined;

  return { members, selectedResponsible };
}
