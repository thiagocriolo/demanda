export type Choice = {
  key: string;
  label: string;
};

export type StyledChoice = Choice & {
  icon: string;
  color: string;
};

export type TemplateTask = {
  id: string;
  templateId: string;
  name: string;
  /** Uma ocorrência única ou a regra que cria novas ocorrências no projeto. */
  frequency?: "one_off" | "weekly" | "monthly" | "custom";
  /** Usado somente em frequências personalizadas. */
  customUnit?: "week" | "month";
  /** Dias da semana (0 = domingo) ou dias do mês (1 a 31). */
  recurrenceDays?: number[];
};

export type Service = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
};

export type ServiceTemplate = {
  id: string;
  version?: number;
  /** Referência ao catálogo antigo, mantida apenas para migração. */
  serviceId?: string;
  name: string;
  icon: string;
  color: string;
  briefing: string;
  tags: string;
  status: string;
  responsible: string;
  responsibleUserIds?: string[];
  /** Duração estimada do projeto, em dias. */
  duration: string;
  contractType: string;
  amount: string;
  installments: string;
  paymentMethod: string;
  paymentTerms: string;
  financeNotes: string;
  tasks: TemplateTask[];
};

export type DeliveryTemplateSubtask = {
  id: string;
  nome: string;
  duracao: string;
  status: string;
};

export type DeliveryTemplate = {
  id: string;
  version?: number;
  /** Referência ao catálogo antigo, mantida apenas para migração. */
  serviceId?: string;
  projectTemplateId: string;
  name: string;
  category: string;
  briefing: string;
  subtasks: DeliveryTemplateSubtask[];
  status: string;
  priority: string;
  tags: string;
  responsible: string;
  responsibleUserIds?: string[];
  /** Duração estimada da tarefa, em horas. */
  duration: string;
};

export type WorkShift = {
  start: string;
  end: string;
};

export type SettingsState = {
  startPage: string;
  rememberLastTab: boolean;
  autoSaveFilters: boolean;
  theme: "light" | "dark";
  interfaceDensity: "default" | "large";
  sidebarDefault: "expanded" | "collapsed";
  interfaceAnimations: boolean;
  compactHeaders: boolean;
  primaryColor: string;
  secondaryColor: string;
  customPalette: { id: string; name: string; color: string }[];
  fontFamily: string;
  fontScale: number;
  dashboardDefaultPeriod: "week" | "month";
  dashboardShowMetrics: boolean;
  dashboardShowTodaySchedule: boolean;
  dashboardShowWorkload: boolean;
  dashboardShowRecentActivity: boolean;
  workspaceOrderBy: "active" | "updated" | "name";
  workspaceShowInactive: boolean;
  workspaceShowProjectPreviews: boolean;
  workspaceShowCollaborators: boolean;
  workspaceIncludeArchivedProjects: boolean;
  recordsDefaultTab: "pessoas" | "negocios" | "projetos" | "tarefas";
  recordsOrderBy: "updated" | "name_asc" | "name_desc";
  recordsShowArchived: boolean;
  recordsCardLevel: number;
  defaultTaskDuration: string;
  pautaScope: string;
  pautaGroupBy: string;
  pautaOrderBy: string;
  pautaShowDone: boolean;
  pautaShowArchived: boolean;
  pautaShowCardDetails: boolean;
  agendaDefaultView: string;
  agendaDefaultMode: "projects" | "tasks";
  agendaDrawerDefault: "expanded" | "collapsed";
  agendaShowWeekends: boolean;
  agendaRememberLastView: boolean;
  cronogramaDefaultView: string;
  cronogramaDrawerDefault: "expanded" | "collapsed";
  cronogramaDays: "weekdays" | "saturday";
  cronogramaShowCurrentTime: boolean;
  workdayShifts: WorkShift[];
  taskReminderMinutes: string;
  notifyTaskReminders: boolean;
  financeDefaultTab: "painel" | "receitas" | "despesas";
  financeInitialPeriod: "current" | "last";
  financePlanningMonths: "3" | "6" | "12";
  financeShowSettled: boolean;
  financeShowPaused: boolean;
  financeShowDashboardValues: boolean;
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  weekStart: string;
  profile: {
    photo: string;
    cover: string;
    avatarImage: string;
    avatarColor: string;
    username: string;
    name: string;
    profession: string;
    email: string;
    phone: string;
    bio: string;
  };
  statusColors: string[];
  personStatuses: StyledChoice[];
  businessStatuses: StyledChoice[];
  projectStatuses: StyledChoice[];
  taskStatuses: StyledChoice[];
  businessCategories: StyledChoice[];
  taskCategories: StyledChoice[];
  taskPriorities: Choice[];
  tags: string[];
  revenueCategories: StyledChoice[];
  expenseCategories: StyledChoice[];
  templateGalleryVersion: number;
  services: Service[];
  serviceTemplates: ServiceTemplate[];
  deliveryTemplates: DeliveryTemplate[];
};

export const workspaceSettingsKeys = [
  "personStatuses",
  "businessStatuses",
  "projectStatuses",
  "taskStatuses",
  "businessCategories",
  "taskCategories",
  "taskPriorities",
  "tags",
  "revenueCategories",
  "expenseCategories",
  "templateGalleryVersion",
  "services",
  "serviceTemplates",
  "deliveryTemplates",
] as const satisfies readonly (keyof SettingsState)[];

export type WorkspaceSettingsKey = (typeof workspaceSettingsKeys)[number];
export type WorkspaceSettingsState = Pick<SettingsState, WorkspaceSettingsKey>;
export type PersonalSettingsState = Omit<SettingsState, WorkspaceSettingsKey>;

export type PersonalSettingsResponse = {
  version: number;
  settings: PersonalSettingsState;
};

export type WorkspaceSettingsResponse = {
  workspaceId: string;
  version: number;
  canManage: boolean;
  settings: WorkspaceSettingsState;
};

export type SettingsSnapshot = {
  personal: PersonalSettingsResponse;
  workspace: WorkspaceSettingsResponse;
};
