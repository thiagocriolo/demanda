export type EntityCardKind = "pessoa" | "negocio" | "projeto" | "tarefa";

export type EntityCardAction = "view" | "edit" | "copy" | "archive" | "delete";

/** Dados normalizados aceitos pelo card global de entidades. */
export type EntityCardItem = {
  id: string;
  kind: EntityCardKind;
  title: string;
  status: string;
  statusColor: string;
  primary?: string;
  primaryMore?: string;
  secondary?: string;
  relation?: string;
  counts?: [string | number, string | number, (string | number)?];
  progress?: number;
  progressMeta?: string;
  completion?: string;
  responsible?: string;
  responsibleAvatarUrl?: string;
  steps?: string;
};
