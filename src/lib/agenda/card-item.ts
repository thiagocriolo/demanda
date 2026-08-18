import type { EntityCardItem } from "$lib/ui/entity-card";
import type { AgendaItem, AgendaTone } from "./types";

const toneColors: Record<AgendaTone, string> = {
  blue: "#2e56ff",
  green: "#5dac83",
  amber: "#eab308",
  red: "#dc2626",
  gray: "#64748b",
};

function formatDate(date: string | null): string {
  if (!date) return "Não agendado";
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

export function toAgendaCardItem(
  item: AgendaItem,
  timeLabel = "",
): EntityCardItem {
  if (item.mode === "projects") {
    return {
      id: item.id,
      kind: "projeto",
      title: item.title,
      status: item.statusLabel,
      statusColor: toneColors[item.tone],
      secondary: item.client,
      relation: item.relation || item.description,
      completion: formatDate(item.date),
    };
  }

  return {
    id: item.id,
    kind: "tarefa",
    title: item.title,
    status: item.statusLabel,
    statusColor: toneColors[item.tone],
    primary: item.client,
    secondary: timeLabel ? `${timeLabel} · ${item.relation}` : item.relation,
    relation: item.description,
    responsible: item.responsible.trim() || "Sem responsável",
    responsibleAvatarUrl: item.responsibleAvatarUrl,
    steps: `${item.completed}/${item.total}`,
  };
}
