import type { CommandAction, CommandResource } from "./command-contract";

export type CommandCatalogEntry = {
  resource: CommandResource;
  area:
    "registros" | "workspaces" | "pauta" | "agenda" | "cronograma" | "modelos";
  label: string;
  actions: CommandAction[];
  implemented: CommandAction[];
};

/**
 * Catálogo único para a IA e a interface. Adicionar uma operação exige também
 * registrar o executor no servidor; ela nunca é liberada só por aparecer aqui.
 */
export const commandCatalog: CommandCatalogEntry[] = [
  {
    resource: "contact",
    area: "registros",
    label: "Contato",
    actions: ["create", "update", "delete"],
    implemented: ["create"],
  },
  {
    resource: "business",
    area: "registros",
    label: "Negócio",
    actions: ["create", "update", "delete"],
    implemented: ["create"],
  },
  {
    resource: "project",
    area: "registros",
    label: "Projeto",
    actions: ["create", "update", "delete"],
    implemented: ["create"],
  },
  {
    resource: "task",
    area: "registros",
    label: "Tarefa",
    actions: ["create", "update", "delete"],
    implemented: ["create"],
  },
  {
    resource: "service_template",
    area: "modelos",
    label: "Modelo de serviço",
    actions: ["create", "update", "delete"],
    implemented: ["create"],
  },
  {
    resource: "delivery_template",
    area: "modelos",
    label: "Modelo de entrega",
    actions: ["create", "update", "delete"],
    implemented: ["create"],
  },
  {
    resource: "workspace",
    area: "workspaces",
    label: "Workspace",
    actions: ["create", "update", "delete"],
    implemented: [],
  },
  {
    resource: "workspace_member",
    area: "workspaces",
    label: "Membro do workspace",
    actions: ["create", "update", "delete"],
    implemented: [],
  },
  {
    resource: "task_board",
    area: "pauta",
    label: "Posição ou estado da tarefa na pauta",
    actions: ["update"],
    implemented: [],
  },
  {
    resource: "agenda_item",
    area: "agenda",
    label: "Item da agenda",
    actions: ["update"],
    implemented: [],
  },
  {
    resource: "schedule_block",
    area: "cronograma",
    label: "Bloco do cronograma",
    actions: ["create", "update", "delete"],
    implemented: [],
  },
];

export function catalogEntry(resource: CommandResource): CommandCatalogEntry {
  const entry = commandCatalog.find((item) => item.resource === resource);
  if (!entry) throw new Error(`Recurso de comando não registrado: ${resource}`);
  return entry;
}
