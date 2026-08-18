export const TASK_COMPLETED_STATUS = "conclusao" as const;
export const SUBTASK_PENDING_STATUS = "pendente" as const;
export const SUBTASK_COMPLETED_STATUS = "concluida" as const;

export type SubtaskStatus =
  typeof SUBTASK_PENDING_STATUS | typeof SUBTASK_COMPLETED_STATUS;

export type TaskBusiness = {
  id: string;
  name: string;
  archivedAt: string | null;
};

export type TaskProject = {
  id: string;
  name: string;
  status: string;
  archivedAt: string | null;
};

export type TaskTag = {
  id: string;
  name: string;
  archivedAt: string | null;
};

export type TaskResponsible = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "owner" | "admin" | "member";
};

export type TaskSubtask = {
  id: string;
  name: string;
  durationMinutes: number;
  status: SubtaskStatus;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskBoardView = "status" | "priority" | "business" | "project";

export type TaskBoardOrder = Partial<Record<TaskBoardView, number>>;

export type Task = {
  id: string;
  workspaceId: string;
  name: string;
  business: TaskBusiness;
  project: TaskProject;
  category: string;
  priority: string;
  status: string;
  briefing: string;
  dueDate: string | null;
  tags: TaskTag[];
  responsibles: TaskResponsible[];
  subtasks: TaskSubtask[];
  durationMinutes: number;
  sortOrder: number;
  boardOrder: TaskBoardOrder;
  version: number;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskSubtaskMutationInput = {
  id?: string;
  name: string;
  durationMinutes: number;
  status: SubtaskStatus;
};

export type TaskContentInput = {
  name: string;
  projectId: string;
  category: string;
  priority: string;
  briefing: string;
  dueDate: string | null;
  tagLabels: string[];
  responsibleUserIds: string[];
  subtasks: TaskSubtaskMutationInput[];
  sortOrder?: number;
  boardOrder?: TaskBoardOrder;
};

export type TaskCreateInput = TaskContentInput & {
  status: string;
};

export type TaskUpdateInput = TaskContentInput & {
  version: number;
  status: string;
};

export type TaskBoardUpdateInput = {
  id: string;
  version: number;
  position: number;
  columnKey: string;
};

export type TaskBoardInput = {
  view: TaskBoardView;
  updates: TaskBoardUpdateInput[];
};

export type TaskBoardResult = {
  workspaceId: string;
  view: TaskBoardView;
  items: Task[];
};

export type TaskStateInput = {
  version: number;
  status: string;
};

export type TaskSubtaskStateInput = {
  version: number;
  status: SubtaskStatus;
};

export type TaskList = {
  workspaceId: string;
  items: Task[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: {
    all: number;
    archived: number;
    statuses: Record<string, number>;
    categories: Record<string, number>;
    priorities: Record<string, number>;
    projects: Record<string, number>;
  };
};
