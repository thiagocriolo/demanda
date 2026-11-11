import type { TabItem } from "../ui/Tabs.svelte";
import type { RecordsTab } from "./types";

export const recordsTabRoutes: Record<RecordsTab, string> = {
  pessoas: "/registros/contatos",
  negocios: "/registros/negócios",
  projetos: "/registros/projetos",
  tarefas: "/registros/tarefas",
};

export const recordsTabs: TabItem[] = [
  { id: "pessoas", label: "Contatos" },
  { id: "negocios", label: "Negócios" },
  { id: "projetos", label: "Projetos" },
  { id: "tarefas", label: "Tarefas" },
];

export function recordsTabFromPath(pathname: string): RecordsTab | undefined {
  const segment = decodeURIComponent(pathname)
    .replace(/\/$/, "")
    .split("/")
    .at(-1)
    ?.toLocaleLowerCase("pt-BR");

  if (segment === "contatos") return "pessoas";
  if (segment === "negócios") return "negocios";
  if (segment === "projetos") return "projetos";
  if (segment === "tarefas") return "tarefas";
  return undefined;
}
