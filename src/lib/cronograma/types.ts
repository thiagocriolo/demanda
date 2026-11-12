export type ScheduleEntry = {
  date: string;
  startMinutes: number;
  durationSlots: number;
  version?: number;
};

export type ScheduleMap = Record<string, ScheduleEntry>;

export type ScheduleTask = {
  id: string;
  createdAt: string;
  updatedAt: string;
  workspaceId?: string;
  archivedAt?: string;
  tipo?: string;
  etapa?: string;
  taskId: string;
  taskNome: string;
  subtaskId: string;
  sequence: number;
  subtaskCount: number;
  nome: string;
  duracao: string;
  negocio?: string;
  projeto?: string;
  responsavel?: string;
  responsavelId?: string;
  assigned_user_id?: string;
  responsibleUserIds?: string;
  responsibleAvatarUrl?: string;
  status?: string;
  taskStatus?: string;
  priority?: string;
  requestedDate?: string;
  dueDate?: string;
  descricao?: string;
};

export type WeekDay = {
  index: number;
  date: Date;
  iso: string;
  fullLabel: string;
  mediumLabel: string;
  shortLabel: string;
  dateLabel: string;
  isToday: boolean;
};

export type PositionedTask = {
  task: ScheduleTask;
  schedule: ScheduleEntry;
  lane: number;
  laneCount: number;
};
