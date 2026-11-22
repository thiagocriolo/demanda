import type { TabItem } from "../ui/Tabs.svelte";
import type { RecordsTab } from "./types";

export const recordsTabRoutes: Record<RecordsTab, string> = {
  pessoas: "/clientes/contatos",
  negocios: "/clientes/negócios",
  contratos: "/clientes/contratos",
  projetos: "/clientes/projetos",
  tarefas: "/clientes/tarefas",
};

export const recordsTabs: TabItem[] = [
  { id: "pessoas", label: "Pessoas" },
  { id: "negocios", label: "Negócios" },
];

export function recordsTabFromPath(pathname: string): RecordsTab | undefined {
  const segment = decodeURIComponent(pathname)
    .replace(/\/$/, "")
    .split("/")
    .at(-1)
    ?.toLocaleLowerCase("pt-BR");

  if (segment === "pessoas" || segment === "contatos") return "pessoas";
  if (segment === "negócios") return "negocios";
  if (segment === "contratos") return "contratos";
  if (segment === "projetos") return "projetos";
  if (segment === "entregas" || segment === "tarefas") return "tarefas";
  return undefined;
}
