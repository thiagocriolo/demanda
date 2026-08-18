import type { EntityRecord } from "$lib/entities/types";
import type { Workspace } from "./workspace-storage";

const PERSONAL_WORKSPACE_ID = "personal";
const GLOBAL_WORKSPACE_ID = "global";

export function belongsToWorkspace(
  record: EntityRecord,
  workspaceId: string,
): boolean {
  if (workspaceId === GLOBAL_WORKSPACE_ID) return true;
  return (record.workspaceId ?? PERSONAL_WORKSPACE_ID) === workspaceId;
}

/** No modelo atual, os membros do workspace formam a equipe dos projetos nele. */
export function projectsParticipatedByUser(
  projects: EntityRecord[],
  workspace: Workspace | undefined,
  userId: string,
): EntityRecord[] {
  if (!workspace?.members.some((member) => member.userId === userId)) return [];
  return projects.filter((project) =>
    belongsToWorkspace(project, workspace.id),
  );
}

/** Relações com projetos só são válidas por ID exato. */
export function taskBelongsToProjects(
  task: EntityRecord,
  projects: EntityRecord[],
): boolean {
  const projectId =
    task.projetoId || task.projeto_id || task.projectId || task.project_id;
  return Boolean(
    projectId && projects.some((project) => project.id === projectId),
  );
}
