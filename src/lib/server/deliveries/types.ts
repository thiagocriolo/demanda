export const DELIVERY_COMPLETED_STATUS = "conclusao" as const;
export const TASK_PENDING_STATUS = "pendente" as const;
export const TASK_COMPLETED_STATUS = "concluida" as const;

export type TaskStatus =
  typeof TASK_PENDING_STATUS | typeof TASK_COMPLETED_STATUS;

export type DeliveryBusiness = {
  id: string;
  name: string;
  archivedAt: string | null;
};

export type DeliveryProject = {
  id: string;
  name: string;
  status: string;
  contractType: "one_off" | "recurring";
  archivedAt: string | null;
};

export type DeliveryTag = {
  id: string;
  name: string;
  archivedAt: string | null;
};

export type DeliveryResponsible = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "owner" | "admin" | "member";
};

export type DeliveryTask = {
  id: string;
  name: string;
  durationMinutes: number;
  executionAt: string | null;
  status: TaskStatus;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryBoardView = "status" | "priority" | "business" | "project";

export type DeliveryBoardOrder = Partial<Record<DeliveryBoardView, number>>;

export type Delivery = {
  id: string;
  workspaceId: string;
  name: string;
  business: DeliveryBusiness;
  project: DeliveryProject;
  category: string;
  priority: string;
  status: string;
  briefing: string;
  dueDate: string | null;
  recurrence: DeliveryRecurrence | null;
  engagementType: "fee" | "personal";
  tags: DeliveryTag[];
  responsibles: DeliveryResponsible[];
  tasks: DeliveryTask[];
  durationMinutes: number;
  sortOrder: number;
  boardOrder: DeliveryBoardOrder;
  version: number;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryTaskMutationInput = {
  id?: string;
  name: string;
  durationMinutes: number;
  executionAt?: string | null;
  status: TaskStatus;
};

export type DeliveryRecurrence = "daily" | "weekly" | "monthly";
export type DeliveryRoutinePropagation = "single" | "future";

export type DeliveryContentInput = {
  name: string;
  projectId?: string;
  institutionalContractId?: string;
  recurrence?: DeliveryRecurrence;
  category: string;
  priority: string;
  briefing: string;
  dueDate: string | null;
  engagementType?: "fee" | "personal";
  tagLabels: string[];
  responsibleUserIds: string[];
  tasks: DeliveryTaskMutationInput[];
  sortOrder?: number;
  boardOrder?: DeliveryBoardOrder;
};

export type DeliveryCreateInput = DeliveryContentInput & {
  status: string;
};

export type DeliveryUpdateInput = DeliveryContentInput & {
  version: number;
  status: string;
  routinePropagation?: DeliveryRoutinePropagation;
};

export type DeliveryBoardUpdateInput = {
  id: string;
  version: number;
  position: number;
  columnKey: string;
};

export type DeliveryBoardInput = {
  view: DeliveryBoardView;
  updates: DeliveryBoardUpdateInput[];
};

export type DeliveryBoardResult = {
  workspaceId: string;
  view: DeliveryBoardView;
  items: Delivery[];
};

export type DeliveryStateInput = {
  version: number;
  status: string;
};

export type DeliveryTaskStateInput = {
  version: number;
  status: TaskStatus;
};

export type DeliveryList = {
  workspaceId: string;
  items: Delivery[];
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
