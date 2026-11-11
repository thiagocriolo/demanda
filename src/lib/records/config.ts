import {
  businessConfig,
  deliveryConfig,
  peopleConfig,
  projectConfig,
} from "../entities/catalog";
import type { RecordsTab, RecordsTabConfig } from "./types";

export {
  recordsTabFromPath,
  recordsTabRoutes,
  recordsTabs,
} from "./navigation";

export const recordsTabConfigs: Record<RecordsTab, RecordsTabConfig> = {
  pessoas: {
    config: peopleConfig,
    kind: "pessoa",
    statusField: "tipo",
    placeholder: "Buscar contatos",
    emptyLabel: "contato",
    createLabel: "contato",
  },
  negocios: {
    config: businessConfig,
    kind: "negocio",
    statusField: "etapa",
    placeholder: "Buscar negócios",
    emptyLabel: "negócio",
    createLabel: "negócio",
  },
  projetos: {
    config: projectConfig,
    kind: "projeto",
    statusField: "status",
    placeholder: "Buscar projetos",
    emptyLabel: "projeto",
    createLabel: "projeto",
  },
  tarefas: {
    config: deliveryConfig,
    kind: "tarefa",
    statusField: "status",
    placeholder: "Buscar tarefas",
    emptyLabel: "tarefa",
    createLabel: "tarefa",
  },
};
