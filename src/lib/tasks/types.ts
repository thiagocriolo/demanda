import type {
  ProjectBusiness,
  ProjectResponsible,
  ProjectTag,
} from "$lib/projects/types";

export type TaskBoardView = "status" | "priority" | "business" | "project";
export type TaskBoardOrder = Partial<Record<TaskBoardView, number>>;

export type TaskProject = {
  id: string;
  name: string;
  status: string;
  archivedAt: string | null;
};

export type TaskSubtask = {
  id: string;
  name: string;
  durationMinutes: number;
  status: string;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  workspaceId: string;
  project: TaskProject;
  business: ProjectBusiness;
  name: string;
  category: string;
  priority: string;
  status: string;
  briefing: string;
  dueDate: string | null;
  durationMinutes: number;
  sortOrder: number;
  boardOrder: TaskBoardOrder;
  tags: ProjectTag[];
  responsibles: ProjectResponsible[];
  subtasks: TaskSubtask[];
  version: number;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskSubtaskInput = {
  id?: string;
  name: string;
  durationMinutes: number;
  status: string;
};

export type TaskContentInput = {
  name: string;
  projectId: string;
  category: string;
  priority: string;
  briefing: string;
  dueDate: string | null;
  sortOrder: number;
  boardOrder: TaskBoardOrder;
  tagLabels: string[];
  responsibleUserIds: string[];
  subtasks: TaskSubtaskInput[];
};

export type TaskCreateInput = TaskContentInput & { status: string };
export type TaskUpdateInput = Omit<TaskContentInput, "boardOrder"> & {
  version: number;
  status: string;
};

export type TaskStateInput = {
  version: number;
  status: string;
};

export type TaskSubtaskStateInput = TaskStateInput;

export type TaskBoardMutationInput = {
  view: TaskBoardView;
  updates: Array<{
    id: string;
    version: number;
    position: number;
    columnKey: string;
  }>;
};

export type TaskBoardMutationResult = {
  workspaceId: string;
  view: TaskBoardView;
  items: Task[];
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
    priorities: Record<string, number>;
    categories: Record<string, number>;
    projects: Record<string, number>;
  };
};
