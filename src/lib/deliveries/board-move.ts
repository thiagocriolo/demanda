import type { EntityRecord } from "$lib/entities/types";

export type PautaBoardViewMode = "status" | "priority" | "client" | "project";

export function recordWorkspaceId(record: EntityRecord): string {
  return record.workspaceId || record.workspace_id || "";
}

export function canMoveBetweenColumns(viewMode: PautaBoardViewMode): boolean {
  return viewMode === "status" || viewMode === "priority";
}

export function isArchiveColumnDrop(
  viewMode: PautaBoardViewMode,
  targetColumnValue: string,
): boolean {
  return viewMode === "status" && targetColumnValue === "arquivado";
}

export function canDropInBoardColumn(
  viewMode: PautaBoardViewMode,
  sourceColumnValue: string,
  targetColumnValue: string,
): boolean {
  if (viewMode === "status" && sourceColumnValue === "arquivado") {
    return false;
  }
  return (
    canMoveBetweenColumns(viewMode) || sourceColumnValue === targetColumnValue
  );
}

function defaultIsArchived(record: EntityRecord): boolean {
  return (
    Boolean(record.archivedAt) ||
    record.tipo === "arquivado" ||
    record.etapa === "arquivado" ||
    record.status === "arquivado"
  );
}

export function filterWorkspaceActiveBoardRecords(
  records: readonly EntityRecord[],
  movedWorkspaceId: string,
  isArchived: (record: EntityRecord) => boolean = defaultIsArchived,
): EntityRecord[] {
  return records.filter(
    (record) =>
      !isArchived(record) &&
      (!movedWorkspaceId || recordWorkspaceId(record) === movedWorkspaceId),
  );
}

export function resolveWorkspaceBeforeId(
  beforeId: string | undefined,
  visualColumnItems: ReadonlyArray<{ id: string }>,
  workspaceTargetIds: readonly string[],
): string | undefined {
  if (!beforeId) return undefined;
  if (workspaceTargetIds.includes(beforeId)) return beforeId;

  const visualIndex = visualColumnItems.findIndex(({ id }) => id === beforeId);
  if (visualIndex < 0) return undefined;

  const workspaceTargetSet = new Set(workspaceTargetIds);
  for (let index = visualIndex + 1; index < visualColumnItems.length; index += 1) {
    const candidateId = visualColumnItems[index]?.id;
    if (candidateId && workspaceTargetSet.has(candidateId)) {
      return candidateId;
    }
  }
  return undefined;
}
