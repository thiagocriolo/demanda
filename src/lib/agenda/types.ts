export type AgendaMode = "projects" | "tasks";
export type AgendaView = "daily" | "weekly" | "monthly";

export type AgendaTone = "blue" | "green" | "amber" | "red" | "gray";

export type AgendaItem = {
  id: string;
  mode: AgendaMode;
  title: string;
  date: string | null;
  order: number;
  version: number;
  status: string;
  statusLabel: string;
  tone: AgendaTone;
  client: string;
  relation: string;
  responsible: string;
  responsibleAvatarUrl?: string;
  description: string;
  durationMinutes: number;
  priority: "baixa" | "normal" | "alta" | "urgente";
  progress: number;
  completed: number;
  total: number;
};

export type AgendaDensity = "roomy" | "comfortable" | "compact" | "micro";

export type AgendaPlacement = {
  id: string;
  date: string | null;
  order: number;
  durationMinutes: number;
  version: number;
};

export type AgendaSnapshot = {
  workspaceId: string;
  projects: AgendaPlacement[];
  tasks: AgendaPlacement[];
};

export type AgendaQuery = {
  workspaceId?: string;
};

export type AgendaMoveInput = {
  mode: AgendaMode;
  items: AgendaPlacement[];
};
