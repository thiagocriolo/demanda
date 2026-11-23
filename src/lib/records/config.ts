import {
  businessConfig,
  contractConfig,
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
    placeholder: "Buscar pessoas",
    emptyLabel: "pessoa",
    createLabel: "pessoa",
  },
  negocios: {
    config: businessConfig,
    kind: "negocio",
    statusField: "etapa",
    placeholder: "Buscar negócios",
    emptyLabel: "negócio",
    createLabel: "negócio",
  },
  contratos: {
    config: contractConfig,
    kind: "contrato",
    statusField: "status",
    placeholder: "Buscar contratos",
    emptyLabel: "contrato",
    createLabel: "contrato",
  },
  projetos: {
    config: projectConfig,
    kind: "projeto",
    statusField: "status",
    placeholder: "Buscar projetos",
    emptyLabel: "projeto",
    createLabel: "projeto",
  },
  entregas: {
    config: deliveryConfig,
    kind: "entrega",
    statusField: "status",
    placeholder: "Buscar entregas",
    emptyLabel: "entrega",
    createLabel: "entrega",
  },
};
