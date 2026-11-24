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
  workspaceId?: string;
  date: string;
  startMinutes: number;
  durationMinutes: number;
  version: number;
};

export type CronogramaDeleteInput = {
  workspaceId?: string;
  version: number;
};

export type CronogramaReorganizationBlockInput = Omit<
  CronogramaBlockInput,
  "workspaceId"
> & {
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
