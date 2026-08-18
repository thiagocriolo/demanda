export type DashboardPeriod = "week" | "month";

export type DashboardSnapshot = {
  workspaceId: string;
  date: string;
  period: DashboardPeriod;
  range: { from: string; to: string };
  metrics: {
    overdueTasks: number;
    overdueProjects: number;
    activeTasks: number;
    activeProjects: number;
    overduePayments: number;
    todayTasks: number;
    periodTasks: number;
    todayProjects: number;
    periodProjects: number;
    completedTasks: number;
    upcomingTasks: number;
    plannedMinutes: number;
  };
  finance: {
    receivableCents: number;
    payableCents: number;
    currentBalanceCents: number;
  };
  workload: {
    date: string;
    taskCount: number;
    plannedMinutes: number;
  }[];
  todaySchedule: {
    id: string;
    kind: "project" | "task";
    title: string;
    context: string;
    startMinutes: number | null;
    durationMinutes: number;
    href: string;
  }[];
  activities: {
    id: string;
    actorName: string;
    actorAvatarUrl: string | null;
    action: string;
    target: string;
    targetType: string;
    occurredAt: string;
    href: string;
  }[];
  meta: { queryMs: number };
};

export type GlobalSearchScope =
  "all" | "contact" | "business" | "project" | "task";

export type GlobalSearchResult = {
  kind: Exclude<GlobalSearchScope, "all">;
  id: string;
  title: string;
  subtitle: string;
  status: string;
  href: string;
  updatedAt: string;
};

export type GlobalSearchResponse = {
  workspaceId: string;
  query: string;
  scope: GlobalSearchScope;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: GlobalSearchResult[];
  meta: { queryMs: number };
};
