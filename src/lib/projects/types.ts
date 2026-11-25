export type EngagementType = "fee" | "personal";
export type ProjectContractType = "one_off" | "recurring";

export type ProjectTag = {
  id: string;
  name: string;
  archivedAt: string | null;
};

export type ProjectResponsible = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "owner" | "admin" | "member";
};

export type ProjectBusiness = {
  id: string;
  name: string;
  archivedAt: string | null;
};

export type ProjectServiceSummary = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  archivedAt: string | null;
};

export type Project = {
  id: string;
  workspaceId: string;
  sourceServiceId: string | null;
  contract?: { id: string; name: string } | null;
  isInstitutional: boolean;
  isActive: boolean;
  name: string;
  business: ProjectBusiness;
  services: ProjectServiceSummary[];
  status: string;
  startDate: string;
  endDate: string | null;
  engagementType?: EngagementType;
  briefing: string;
  tags: ProjectTag[];
  responsibles: ProjectResponsible[];
  /** Project execution frequency: one-off ("one_off") or recurring ("recurring"). */
  contractType: ProjectContractType;
  /** @deprecated Finance is being migrated to Contract. */
  amountCents: number;
  firstDueDate: string | null;
  paymentMethod: string;
  paymentTerms: string;
  financeNotes: string;
  installments: ProjectInstallment[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** @deprecated Use ContractInstallment. */
export type ProjectInstallment = { id: string; number: number; dueDate: string; amountCents: number; status: string };
/** @deprecated Use ContractInstallmentInput. */
export type ProjectInstallmentInput = Omit<ProjectInstallment, "id">;

export type ProjectMutationInput = {
  name: string;
  /** Ignored by the server; retained temporarily for legacy form data. */
  businessId?: string;
  contractId?: string;
  serviceIds: string[];
  status: string;
  startDate: string;
  endDate: string | null;
  engagementType?: EngagementType;
  briefing: string;
  tagLabels: string[];
  responsibleUserIds?: string[];
  /** Project execution frequency: one-off ("one_off") or recurring ("recurring"). */
  contractType?: ProjectContractType;
  /** @deprecated Finance belongs to Contract. */
  amountCents?: number;
  /** @deprecated Finance belongs to Contract. */
  firstDueDate?: string | null;
  /** @deprecated Finance belongs to Contract. */
  paymentMethod?: string;
  /** @deprecated Finance belongs to Contract. */
  paymentTerms?: string;
  /** @deprecated Finance belongs to Contract. */
  financeNotes?: string;
  /** @deprecated Finance belongs to Contract. */
  installments?: ProjectInstallmentInput[];
};

export type ProjectFromServiceInput = {
  serviceId: string;
  additionalServiceIds?: string[];
  name: string;
  businessId?: string;
  contractId?: string;
  startDate: string;
  endDate?: string | null;
  engagementType?: EngagementType;
  status?: string;
  briefing?: string;
  tagLabels?: string[];
  responsibleUserIds?: string[];
  contractType?: ProjectContractType;
  amountCents?: number;
  firstDueDate?: string | null;
  paymentMethod?: string;
  paymentTerms?: string;
  financeNotes?: string;
  installments?: ProjectInstallmentInput[];
};

export type ProjectList = {
  workspaceId: string;
  items: Project[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: {
    all: number;
    archived: number;
    statuses: Record<string, number>;
    services: Record<string, number>;
  };
};

export type ProjectOptions = {
  workspaceId: string;
  workspaceName: string;
  members: ProjectResponsible[];
  services: Service[];
  tags: ProjectTag[];
};

export type Service = {
  id: string;
  workspaceId: string;
  version: number;
  name: string;
  description: string;
  icon: string;
  color: string;
  defaultStatus: string;
  defaultDurationDays: number | null;
  defaultBriefing: string;
  tags: ProjectTag[];
  responsibles: ProjectResponsible[];
  defaultContractType: "one_off" | "recurring";
  defaultAmountCents: number;
  defaultInstallmentCount: number;
  defaultPaymentMethod: string;
  defaultPaymentTerms: string;
  defaultFinanceNotes: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServiceMutationInput = {
  name: string;
  description: string;
  icon: string;
  color: string;
  defaultStatus: string;
  defaultDurationDays: number | null;
  defaultBriefing: string;
  tagLabels: string[];
  responsibleUserIds: string[];
  defaultContractType: "one_off" | "recurring";
  defaultAmountCents: number;
  defaultInstallmentCount: number;
  defaultPaymentMethod: string;
  defaultPaymentTerms: string;
  defaultFinanceNotes: string;
};

export type ServiceList = {
  workspaceId: string;
  items: Service[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: { all: number; archived: number };
};
