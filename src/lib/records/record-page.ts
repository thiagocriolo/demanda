import type { EntityConfig } from "$lib/entities/types";
import type { EntityCardKind } from "$lib/ui/entity-card";
import type { RecordsTab } from "./types";
import { recordsTabRoutes } from "./navigation";

const tabByKind: Record<EntityCardKind, RecordsTab> = {
  pessoa: "pessoas",
  negocio: "negocios",
  contrato: "contratos",
  projeto: "projetos",
  tarefa: "tarefas",
};

const kindByEntityKey: Record<EntityConfig["key"], EntityCardKind> = {
  pessoas: "pessoa",
  negocios: "negocio",
  contratos: "contrato",
  projetos: "projeto",
  entregas: "tarefa",
};

/** The canonical, directly accessible page for a persisted record. */
export function recordPageHref(kind: EntityCardKind, id: string): string {
  return `${recordsTabRoutes[tabByKind[kind]]}/${encodeURIComponent(id)}`;
}

export function recordPageHrefForEntity(
  key: EntityConfig["key"],
  id: string,
): string {
  return recordPageHref(kindByEntityKey[key], id);
}

export function recordTabFromRoute(value: string): RecordsTab | undefined {
  const tab = decodeURIComponent(value).toLocaleLowerCase("pt-BR");
  if (tab === "pessoas" || tab === "contatos") return "pessoas";
  if (tab === "negócios") return "negocios";
  if (tab === "contratos") return "contratos";
  if (tab === "projetos") return "projetos";
  if (tab === "entregas" || tab === "tarefas") return "tarefas";
  return undefined;
}
