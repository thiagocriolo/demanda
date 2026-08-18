import type { LucideIcon } from "@lucide/svelte";
import {
  ClipboardPenLine,
  GitCompareArrows,
  ScanSearch,
  SlidersHorizontal,
} from "@lucide/svelte";
import type { ToolDefinition, ToolKey } from "./types";

export type ToolResource = ToolDefinition & { icon: LucideIcon };

export const toolResources: ToolResource[] = [
  {
    key: "form",
    name: "Formulário",
    description: "Colete informações através de perguntas estruturadas.",
    iconName: "clipboard-pen-line",
    icon: ClipboardPenLine,
    availability: "available",
    highlights: ["Campos personalizáveis", "Respostas organizadas"],
  },
  {
    key: "evaluation",
    name: "Avaliação",
    description:
      "Avalie individualmente referências ou outros materiais visuais.",
    iconName: "scan-search",
    icon: ScanSearch,
    availability: "available",
    highlights: ["Escala visual", "Atributos e comentários"],
  },
  {
    key: "comparison",
    name: "Comparação",
    description: "Compare alternativas e identifique a preferência entre elas.",
    iconName: "git-compare-arrows",
    icon: GitCompareArrows,
    availability: "available",
    highlights: ["Alternativas lado a lado", "Escolha justificada"],
  },
  {
    key: "intensity",
    name: "Intensidade",
    description: "Determine uma posição entre características opostas.",
    iconName: "sliders-horizontal",
    icon: SlidersHorizontal,
    availability: "available",
    highlights: ["Escalas bipolares", "Passos de cinco unidades"],
  },
];

export function findToolResource(toolKey: ToolKey): ToolResource {
  const resource = toolResources.find(({ key }) => key === toolKey);
  if (!resource) throw new Error(`Ferramenta desconhecida: ${toolKey}`);
  return resource;
}

export function toolName(toolKey: ToolKey): string {
  return findToolResource(toolKey).name;
}
