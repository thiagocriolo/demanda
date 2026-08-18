import type { WorkspaceUser } from "./workspace-storage";

type ResponsibleRecord = {
  responsavel?: string;
  responsavelId?: string;
  assigned_user_id?: string;
};

function normalizeName(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function resolveResponsibleUser(
  record: object,
  users: WorkspaceUser[],
): WorkspaceUser | undefined {
  const responsible = record as ResponsibleRecord;
  const responsibleId =
    responsible.responsavelId || responsible.assigned_user_id;
  const byId = responsibleId
    ? users.find((user) => user.id === responsibleId)
    : undefined;
  if (byId) return byId;

  const responsibleName = normalizeName(responsible.responsavel);
  return responsibleName
    ? users.find((user) => normalizeName(user.name) === responsibleName)
    : undefined;
}

/** Verifica a atribuição pelo ID e mantém compatibilidade com dados legados por nome. */
export function isAssignedToUser(
  record: object,
  user: WorkspaceUser,
  users: WorkspaceUser[],
): boolean {
  return resolveResponsibleUser(record, users)?.id === user.id;
}
