import { performance } from "node:perf_hooks";
import { sql } from "drizzle-orm";
import type {
  DashboardPeriod,
  DashboardSnapshot,
  GlobalSearchResponse,
  GlobalSearchResult,
  GlobalSearchScope,
} from "../../dashboard/api-types";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermission,
} from "../authorization/workspace-context";
import { rawRows, type Database } from "../db/database";

type MetricRow = {
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
  receivableCents: string;
  payableCents: string;
  currentBalanceCents: string;
};

type WorkloadRow = { date: string; taskCount: number; plannedMinutes: number };
type ScheduleRow = {
  id: string;
  kind: "project" | "task";
  title: string;
  context: string;
  startMinutes: number | null;
  durationMinutes: number;
};
type ActivityRow = {
  id: string;
  actorName: string;
  actorAvatarUrl: string | null;
  action: string;
  target: string;
  targetType: string;
  occurredAt: Date | string;
};

function dateRange(date: string, period: DashboardPeriod) {
  const current = new Date(`${date}T00:00:00.000Z`);
  const from = new Date(current);
  const to = new Date(current);
  if (period === "week") {
    const weekday = (from.getUTCDay() + 6) % 7;
    from.setUTCDate(from.getUTCDate() - weekday);
    to.setTime(from.getTime());
    to.setUTCDate(to.getUTCDate() + 6);
  } else {
    from.setUTCDate(1);
    to.setUTCMonth(to.getUTCMonth() + 1, 0);
  }
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function safeInteger(value: string | number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("Agregação fora do limite seguro.");
  return number;
}

function targetHref(targetType: string): string {
  if (targetType === "task") return "/pauta";
  if (targetType === "project") return "/registros/projetos";
  if (targetType === "business") return "/registros/negócios";
  if (targetType === "contact") return "/registros/contatos";
  if (targetType === "financial_entry") return "/financeiro";
  if (targetType === "stored_file" || targetType === "user")
    return "/social/usuario";
  return "/dashboard";
}

export async function getDashboardSnapshot(
  database: Database,
  context: RequestAuthorizationContext,
  input: { date: string; period: DashboardPeriod },
): Promise<DashboardSnapshot> {
  const started = performance.now();
  const current = requireActiveWorkspacePermission(context, "workspace:read");
  const workspaceId = current.workspace.id;
  await requireWorkspacePermission(
    database,
    context.user.id,
    workspaceId,
    "workspace:read",
  );
  const range = dateRange(input.date, input.period);

  const snapshot = await database.transaction(async (transaction) => {
    const metricsResult = await transaction.execute(sql`
      select
        (select count(*) from tasks where workspace_id = ${workspaceId} and archived_at is null and completed_at is null and due_date < ${input.date}) as "overdueTasks",
        (select count(*) from projects where workspace_id = ${workspaceId} and archived_at is null and status_key <> 'concluido' and end_date < ${input.date}) as "overdueProjects",
        (select count(*) from tasks where workspace_id = ${workspaceId} and archived_at is null and completed_at is null) as "activeTasks",
        (select count(*) from projects where workspace_id = ${workspaceId} and archived_at is null and status_key <> 'concluido') as "activeProjects",
        (select count(*) from financial_entries where workspace_id = ${workspaceId} and deleted_at is null and status = 'open' and due_date < ${input.date}) as "overduePayments",
        (select count(distinct cb.task_id) from cronograma_blocks cb join tasks t on t.workspace_id = cb.workspace_id and t.id = cb.task_id where cb.workspace_id = ${workspaceId} and cb.scheduled_date = ${input.date} and t.archived_at is null and t.completed_at is null) as "todayTasks",
        (select count(distinct cb.task_id) from cronograma_blocks cb join tasks t on t.workspace_id = cb.workspace_id and t.id = cb.task_id where cb.workspace_id = ${workspaceId} and cb.scheduled_date between ${range.from} and ${range.to} and t.archived_at is null and t.completed_at is null) as "periodTasks",
        (select count(*) from projects where workspace_id = ${workspaceId} and archived_at is null and status_key <> 'concluido' and end_date = ${input.date}) as "todayProjects",
        (select count(*) from projects where workspace_id = ${workspaceId} and archived_at is null and status_key <> 'concluido' and end_date between ${range.from} and ${range.to}) as "periodProjects",
        (select count(*) from tasks where workspace_id = ${workspaceId} and archived_at is null and completed_at >= ${range.from} and completed_at < date_add(${range.to}, interval 1 day)) as "completedTasks",
        (select count(distinct cb.task_id) from cronograma_blocks cb join tasks t on t.workspace_id = cb.workspace_id and t.id = cb.task_id where cb.workspace_id = ${workspaceId} and cb.scheduled_date between ${input.date} and ${range.to} and t.archived_at is null and t.completed_at is null) as "upcomingTasks",
        (select cast(coalesce(sum(duration_minutes), 0) as signed) from cronograma_blocks where workspace_id = ${workspaceId} and scheduled_date between ${range.from} and ${range.to}) as "plannedMinutes",
        (select coalesce(round(sum(amount) * 100), 0) from financial_entries where workspace_id = ${workspaceId} and deleted_at is null and status = 'open' and type = 'revenue' and due_date between ${range.from} and ${range.to}) as "receivableCents",
        (select coalesce(round(sum(amount) * 100), 0) from financial_entries where workspace_id = ${workspaceId} and deleted_at is null and status = 'open' and type = 'expense' and due_date between ${range.from} and ${range.to}) as "payableCents",
        (select coalesce(round(sum(case when type = 'revenue' then amount else -amount end) * 100), 0) from financial_entries where workspace_id = ${workspaceId} and deleted_at is null and status = 'settled') as "currentBalanceCents"
    `);
    const metrics = rawRows<MetricRow>(metricsResult)[0]!;

    const workloadResult = await transaction.execute(sql`
      select scheduled_date as date,
             count(distinct task_id) as "taskCount",
             cast(sum(duration_minutes) as signed) as "plannedMinutes"
      from cronograma_blocks
      where workspace_id = ${workspaceId}
        and scheduled_date between ${range.from} and ${range.to}
      group by scheduled_date
      order by scheduled_date
    `);

    const scheduleResult = await transaction.execute(sql`
      with scheduled as (
        select concat('cronograma:', cb.id) as id, 'task' as kind,
               concat(ts.name, ' / ', t.name) as title, /*
               ts.name || ' · ' || t.name as title, p.name as context,
               */ p.name as context, cb.start_minutes as startMinutes, cb.duration_minutes as durationMinutes,
               cb.start_minutes as sort_time
        from cronograma_blocks cb
        join tasks t on t.workspace_id = cb.workspace_id and t.id = cb.task_id
        join task_subtasks ts on ts.workspace_id = cb.workspace_id and ts.id = cb.subtask_id
        join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
        where cb.workspace_id = ${workspaceId} and cb.scheduled_date = ${input.date}
          and t.archived_at is null and ts.archived_at is null
        union all
        select concat('agenda:', ae.id), ae.entity_kind,
               coalesce(t.name, p.name), case when ae.entity_kind = 'task' then coalesce(tp.name, 'Tarefa') else 'Projeto' end,
               null, ae.duration_minutes, 10000 + ae.position
        from agenda_entries ae
        left join tasks t on t.workspace_id = ae.workspace_id and t.id = ae.task_id
        left join projects tp on tp.workspace_id = t.workspace_id and tp.id = t.project_id
        left join projects p on p.workspace_id = ae.workspace_id and p.id = ae.project_id
        where ae.workspace_id = ${workspaceId} and ae.scheduled_date = ${input.date}
          and not exists (select 1 from cronograma_blocks cb where cb.workspace_id = ae.workspace_id and cb.task_id = ae.task_id and cb.scheduled_date = ae.scheduled_date)
      )
      select id, kind, title, context, startMinutes, durationMinutes
      from scheduled order by sort_time, id limit 12
    `);

    const activityResult = await transaction.execute(sql`
      with events as (
        select concat('audit:', al.id) as id, al.created_at as occurred_at,
               coalesce(u.name, 'Sistema') as actor_name, u.avatar_url as actor_avatar_url,
               al.action, coalesce(fe.title, tu.name, pu.name, bu.name, cu.name, al.target_type) as target,
               al.target_type
        from audit_logs al
        left join users u on u.id = al.actor_user_id
        left join financial_entries fe on al.target_type = 'financial_entry' and al.target_id = fe.id
        left join tasks tu on al.target_type = 'task' and al.target_id = tu.id
        left join projects pu on al.target_type = 'project' and al.target_id = pu.id
        left join businesses bu on al.target_type = 'business' and al.target_id = bu.id and bu.owner_user_id = ${context.user.id}
        left join contacts cu on al.target_type = 'contact' and al.target_id = cu.id and cu.owner_user_id = ${context.user.id}
        where al.workspace_id = ${workspaceId}
        union all
        select concat('contact:', id), created_at, 'Você', null, 'contact.created', name, 'contact' from contacts where owner_user_id = ${context.user.id}
        union all
        select concat('business:', id), created_at, 'Você', null, 'business.created', name, 'business' from businesses where owner_user_id = ${context.user.id}
        union all
        select concat('project:', id), created_at, 'Equipe', null, 'project.created', name, 'project' from projects where workspace_id = ${workspaceId}
        union all
        select concat('task:', id), created_at, 'Equipe', null, 'task.created', name, 'task' from tasks where workspace_id = ${workspaceId}
        union all
        select concat('task-completed:', id), completed_at, 'Equipe', null, 'task.completed', name, 'task' from tasks where workspace_id = ${workspaceId} and completed_at is not null
      )
      select id, actor_name as "actorName", actor_avatar_url as "actorAvatarUrl", action, target,
             target_type as "targetType", occurred_at as "occurredAt"
      from events order by occurred_at desc, id limit 12
    `);

    return {
      metrics,
      workload: rawRows<WorkloadRow>(workloadResult),
      schedule: rawRows<ScheduleRow>(scheduleResult),
      activities: rawRows<ActivityRow>(activityResult),
    };
  });

  return {
    workspaceId,
    date: input.date,
    period: input.period,
    range,
    metrics: {
      overdueTasks: snapshot.metrics.overdueTasks,
      overdueProjects: snapshot.metrics.overdueProjects,
      activeTasks: snapshot.metrics.activeTasks,
      activeProjects: snapshot.metrics.activeProjects,
      overduePayments: snapshot.metrics.overduePayments,
      todayTasks: snapshot.metrics.todayTasks,
      periodTasks: snapshot.metrics.periodTasks,
      todayProjects: snapshot.metrics.todayProjects,
      periodProjects: snapshot.metrics.periodProjects,
      completedTasks: snapshot.metrics.completedTasks,
      upcomingTasks: snapshot.metrics.upcomingTasks,
      plannedMinutes: snapshot.metrics.plannedMinutes,
    },
    finance: {
      receivableCents: safeInteger(snapshot.metrics.receivableCents),
      payableCents: safeInteger(snapshot.metrics.payableCents),
      currentBalanceCents: safeInteger(snapshot.metrics.currentBalanceCents),
    },
    workload: snapshot.workload,
    todaySchedule: snapshot.schedule.map((item) => ({
      ...item,
      href: item.kind === "task" ? "/pauta" : "/registros/projetos",
    })),
    activities: snapshot.activities.map((item) => ({
      ...item,
      occurredAt: new Date(item.occurredAt).toISOString(),
      href: targetHref(item.targetType),
    })),
    meta: { queryMs: Math.round((performance.now() - started) * 100) / 100 },
  };
}

type SearchRow = GlobalSearchResult & { total: number };

export async function searchWorkspace(
  database: Database,
  context: RequestAuthorizationContext,
  input: {
    query: string;
    scope: GlobalSearchScope;
    page: number;
    pageSize: number;
  },
): Promise<GlobalSearchResponse> {
  const started = performance.now();
  const current = requireActiveWorkspacePermission(context, "workspace:read");
  const workspaceId = current.workspace.id;
  await requireWorkspacePermission(
    database,
    context.user.id,
    workspaceId,
    "workspace:read",
  );
  const normalized = input.query.trim().toLocaleLowerCase("pt-BR");
  const prefix = `${normalized}%`;
  const contains = `%${normalized}%`;
  const offset = (input.page - 1) * input.pageSize;
  const result = await database.execute(sql`
    with matches as (
      select 'contact' as kind, c.id, c.name as title,
             coalesce(c.profession, c.contact_type) as subtitle, c.status as status,
             '' as href,
             c.updated_at as updatedAt,
             case when lower(c.name) = ${normalized} then 0 when lower(c.name) like ${prefix} then 1 else 2 end as match_rank
      from contacts c where c.owner_user_id = ${context.user.id} and c.archived_at is null
        and ${input.scope} in ('all', 'contact')
        and lower(c.name) like ${contains}
      union all
      select 'business', b.id, b.name, b.category_key, b.stage_key,
             '', b.updated_at,
             case when lower(b.name) = ${normalized} then 0 when lower(b.name) like ${prefix} then 1 else 2 end
      from businesses b where b.owner_user_id = ${context.user.id} and b.archived_at is null
        and ${input.scope} in ('all', 'business')
        and lower(b.name) like ${contains}
      union all
      select 'project', p.id, p.name, b.name, p.status_key,
             '', p.updated_at,
             case when lower(p.name) = ${normalized} then 0 when lower(p.name) like ${prefix} then 1 else 2 end
      from projects p join businesses b on b.id = p.business_id
      where p.workspace_id = ${workspaceId} and p.archived_at is null
        and ${input.scope} in ('all', 'project')
        and lower(p.name) like ${contains}
      union all
      select 'task', t.id, t.name, p.name, t.status_key,
             '', t.updated_at,
             case when lower(t.name) = ${normalized} then 0 when lower(t.name) like ${prefix} then 1 else 2 end
      from tasks t join projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
      where t.workspace_id = ${workspaceId} and t.archived_at is null
        and ${input.scope} in ('all', 'task')
        and lower(t.name) like ${contains}
    )
      select count(*) over() as total, kind, id, title, subtitle, status, href, updatedAt
      from matches order by match_rank, lower(title), updatedAt desc, id
      limit ${input.pageSize} offset ${offset}
  `);
  const rows = rawRows<SearchRow>(result);
  const items = rows.map((item) => ({
    ...item,
    href: `/registros/${
      item.kind === "contact"
        ? "contatos"
        : item.kind === "business"
          ? "negócios"
          : item.kind === "project"
            ? "projetos"
            : "tarefas"
    }?q=${encodeURIComponent(item.title)}`,
    updatedAt: new Date(item.updatedAt).toISOString(),
  }));
  return {
    workspaceId,
    query: input.query.trim(),
    scope: input.scope,
    page: input.page,
    pageSize: input.pageSize,
    total: rows[0]?.total ?? 0,
    totalPages: Math.max(1, Math.ceil((rows[0]?.total ?? 0) / input.pageSize)),
    items,
    meta: { queryMs: Math.round((performance.now() - started) * 100) / 100 },
  };
}
