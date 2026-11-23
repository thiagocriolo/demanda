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
  deliveryId: string;
  deliveryNome: string;
  taskId: string;
  sequence: number;
  taskCount: number;
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
  deliveryStatus?: string;
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
  delivery: ScheduleTask;
  schedule: ScheduleEntry;
  lane: number;
  laneCount: number;
};
