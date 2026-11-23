export type CronogramaBlock = {
  id: string;
  workspaceId: string;
  deliveryId: string;
  taskId: string;
  date: string;
  startMinutes: number;
  durationMinutes: number;
  version: number;
  responsibleUserIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CronogramaSnapshot = {
  workspaceId: string;
  items: CronogramaBlock[];
};

export type CronogramaBlockInput = {
  date: string;
  startMinutes: number;
  durationMinutes: number;
  version: number;
};

export type CronogramaDeleteInput = {
  version: number;
};

export type CronogramaReorganizationBlockInput = CronogramaBlockInput & {
  taskId: string;
};

export type CronogramaReorganizationInput = {
  workspaceId: string;
  blocks: CronogramaReorganizationBlockInput[];
};

export type CronogramaQuery = {
  workspaceId?: string;
  from?: string;
  to?: string;
  responsibleUserId?: string;
};
