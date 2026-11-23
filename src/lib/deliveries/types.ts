import type {
  ProjectBusiness,
  ProjectResponsible,
  ProjectTag,
} from "$lib/projects/types";

export type DeliveryBoardView = "status" | "priority" | "business" | "project";
export type DeliveryBoardOrder = Partial<Record<DeliveryBoardView, number>>;

export type DeliveryProject = {
  id: string;
  name: string;
  status: string;
  archivedAt: string | null;
};

export type DeliveryTask = {
  id: string;
  name: string;
  durationMinutes: number;
  executionAt?: string | null;
  status: string;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Delivery = {
  id: string;
  workspaceId: string;
  project: DeliveryProject;
  business: ProjectBusiness;
  name: string;
  category: string;
  priority: string;
  status: string;
  briefing: string;
  dueDate: string | null;
  engagementType?: "fee" | "personal";
  durationMinutes: number;
  sortOrder: number;
  boardOrder: DeliveryBoardOrder;
  tags: ProjectTag[];
  responsibles: ProjectResponsible[];
  tasks: DeliveryTask[];
  version: number;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryTaskInput = {
  id?: string;
  name: string;
  durationMinutes: number;
  executionAt?: string | null;
  status: string;
};

export type DeliveryContentInput = {
  name: string;
  projectId?: string;
  /** Used only while creating a delivery for a contract's phantom project. */
  institutionalContractId?: string;
  category: string;
  priority: string;
  briefing: string;
  dueDate: string | null;
  engagementType?: "fee" | "personal";
  sortOrder: number;
  boardOrder: DeliveryBoardOrder;
  tagLabels: string[];
  responsibleUserIds: string[];
  tasks: DeliveryTaskInput[];
};

export type DeliveryCreateInput = DeliveryContentInput & { status: string };
export type DeliveryUpdateInput = Omit<DeliveryContentInput, "boardOrder"> & {
  version: number;
  status: string;
};

export type DeliveryStateInput = {
  version: number;
  status: string;
};

export type DeliveryTaskStateInput = DeliveryStateInput;

export type DeliveryBoardMutationInput = {
  view: DeliveryBoardView;
  updates: Array<{
    id: string;
    version: number;
    position: number;
    columnKey: string;
  }>;
};

export type DeliveryBoardMutationResult = {
  workspaceId: string;
  view: DeliveryBoardView;
  items: Delivery[];
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
    priorities: Record<string, number>;
    categories: Record<string, number>;
    projects: Record<string, number>;
  };
};
