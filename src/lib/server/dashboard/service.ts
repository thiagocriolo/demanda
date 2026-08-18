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
import type { Database } from "../db/database";

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
        (select count(*)::int from app.tasks where workspace_id = ${workspaceId} and archived_at is null and completed_at is null and due_date < ${input.date}::date) as "overdueTasks",
        (select count(*)::int from app.projects where workspace_id = ${workspaceId} and archived_at is null and status_key <> 'concluido' and end_date < ${input.date}::date) as "overdueProjects",
        (select count(*)::int from app.tasks where workspace_id = ${workspaceId} and archived_at is null and completed_at is null) as "activeTasks",
        (select count(*)::int from app.projects where workspace_id = ${workspaceId} and archived_at is null and status_key <> 'concluido') as "activeProjects",
        (select count(*)::int from app.financial_entries where workspace_id = ${workspaceId} and deleted_at is null and status = 'open' and due_date < ${input.date}::date) as "overduePayments",
        (select count(distinct cb.task_id)::int from app.cronograma_blocks cb join app.tasks t on t.workspace_id = cb.workspace_id and t.id = cb.task_id where cb.workspace_id = ${workspaceId} and cb.scheduled_date = ${input.date}::date and t.archived_at is null and t.completed_at is null) as "todayTasks",
        (select count(distinct cb.task_id)::int from app.cronograma_blocks cb join app.tasks t on t.workspace_id = cb.workspace_id and t.id = cb.task_id where cb.workspace_id = ${workspaceId} and cb.scheduled_date between ${range.from}::date and ${range.to}::date and t.archived_at is null and t.completed_at is null) as "periodTasks",
        (select count(*)::int from app.projects where workspace_id = ${workspaceId} and archived_at is null and status_key <> 'concluido' and end_date = ${input.date}::date) as "todayProjects",
        (select count(*)::int from app.projects where workspace_id = ${workspaceId} and archived_at is null and status_key <> 'concluido' and end_date between ${range.from}::date and ${range.to}::date) as "periodProjects",
        (select count(*)::int from app.tasks where workspace_id = ${workspaceId} and archived_at is null and completed_at >= ${range.from}::date and completed_at < (${range.to}::date + interval '1 day')) as "completedTasks",
        (select count(distinct cb.task_id)::int from app.cronograma_blocks cb join app.tasks t on t.workspace_id = cb.workspace_id and t.id = cb.task_id where cb.workspace_id = ${workspaceId} and cb.scheduled_date between ${input.date}::date and ${range.to}::date and t.archived_at is null and t.completed_at is null) as "upcomingTasks",
        (select coalesce(sum(duration_minutes), 0)::int from app.cronograma_blocks where workspace_id = ${workspaceId} and scheduled_date between ${range.from}::date and ${range.to}::date) as "plannedMinutes",
        (select coalesce(round(sum(amount) * 100), 0)::bigint::text from app.financial_entries where workspace_id = ${workspaceId} and deleted_at is null and status = 'open' and type = 'revenue' and due_date between ${range.from}::date and ${range.to}::date) as "receivableCents",
        (select coalesce(round(sum(amount) * 100), 0)::bigint::text from app.financial_entries where workspace_id = ${workspaceId} and deleted_at is null and status = 'open' and type = 'expense' and due_date between ${range.from}::date and ${range.to}::date) as "payableCents",
        (select coalesce(round(sum(case when type = 'revenue' then amount else -amount end) * 100), 0)::bigint::text from app.financial_entries where workspace_id = ${workspaceId} and deleted_at is null and status = 'settled') as "currentBalanceCents"
    `);
    const metrics = metricsResult.rows[0] as unknown as MetricRow;

    const workloadResult = await transaction.execute(sql`
      select scheduled_date::text as date,
             count(distinct task_id)::int as "taskCount",
             sum(duration_minutes)::int as "plannedMinutes"
      from app.cronograma_blocks
      where workspace_id = ${workspaceId}
        and scheduled_date between ${range.from}::date and ${range.to}::date
      group by scheduled_date
      order by scheduled_date
    `);

    const scheduleResult = await transaction.execute(sql`
      with scheduled as (
        select 'cronograma:' || cb.id::text as id, 'task'::text as kind,
               ts.name || ' · ' || t.name as title, p.name as context,
               cb.start_minutes as "startMinutes", cb.duration_minutes as "durationMinutes",
               cb.start_minutes as sort_time
        from app.cronograma_blocks cb
        join app.tasks t on t.workspace_id = cb.workspace_id and t.id = cb.task_id
        join app.task_subtasks ts on ts.workspace_id = cb.workspace_id and ts.id = cb.subtask_id
        join app.projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
        where cb.workspace_id = ${workspaceId} and cb.scheduled_date = ${input.date}::date
          and t.archived_at is null and ts.archived_at is null
        union all
        select 'agenda:' || ae.id::text, ae.entity_kind,
               coalesce(t.name, p.name), case when ae.entity_kind = 'task' then coalesce(tp.name, 'Tarefa') else 'Projeto' end,
               null::integer, ae.duration_minutes, 10000 + ae.position
        from app.agenda_entries ae
        left join app.tasks t on t.workspace_id = ae.workspace_id and t.id = ae.task_id
        left join app.projects tp on tp.workspace_id = t.workspace_id and tp.id = t.project_id
        left join app.projects p on p.workspace_id = ae.workspace_id and p.id = ae.project_id
        where ae.workspace_id = ${workspaceId} and ae.scheduled_date = ${input.date}::date
          and not exists (select 1 from app.cronograma_blocks cb where cb.workspace_id = ae.workspace_id and cb.task_id = ae.task_id and cb.scheduled_date = ae.scheduled_date)
      )
      select id, kind, title, context, "startMinutes", "durationMinutes"
      from scheduled order by sort_time, id limit 12
    `);

    const activityResult = await transaction.execute(sql`
      with events as (
        select 'audit:' || al.id::text as id, al.created_at as occurred_at,
               coalesce(u.name, 'Sistema') as actor_name, u.avatar_url as actor_avatar_url,
               al.action, coalesce(fe.title, tu.name, pu.name, bu.name, cu.name, al.target_type) as target,
               al.target_type
        from app.audit_logs al
        left join app.users u on u.id = al.actor_user_id
        left join app.financial_entries fe on al.target_type = 'financial_entry' and al.target_id = fe.id::text
        left join app.tasks tu on al.target_type = 'task' and al.target_id = tu.id::text
        left join app.projects pu on al.target_type = 'project' and al.target_id = pu.id::text
        left join app.businesses bu on al.target_type = 'business' and al.target_id = bu.id::text and bu.owner_user_id = ${context.user.id}
        left join app.contacts cu on al.target_type = 'contact' and al.target_id = cu.id::text and cu.owner_user_id = ${context.user.id}
        where al.workspace_id = ${workspaceId}
        union all
        select 'contact:' || id::text, created_at, 'Você', null::text, 'contact.created', name, 'contact' from app.contacts where owner_user_id = ${context.user.id}
        union all
        select 'business:' || id::text, created_at, 'Você', null::text, 'business.created', name, 'business' from app.businesses where owner_user_id = ${context.user.id}
        union all
        select 'project:' || id::text, created_at, 'Equipe', null::text, 'project.created', name, 'project' from app.projects where workspace_id = ${workspaceId}
        union all
        select 'task:' || id::text, created_at, 'Equipe', null::text, 'task.created', name, 'task' from app.tasks where workspace_id = ${workspaceId}
        union all
        select 'task-completed:' || id::text, completed_at, 'Equipe', null::text, 'task.completed', name, 'task' from app.tasks where workspace_id = ${workspaceId} and completed_at is not null
      )
      select id, actor_name as "actorName", actor_avatar_url as "actorAvatarUrl", action, target,
             target_type as "targetType", occurred_at as "occurredAt"
      from events order by occurred_at desc, id limit 12
    `);

    return {
      metrics,
      workload: workloadResult.rows as unknown as WorkloadRow[],
      schedule: scheduleResult.rows as unknown as ScheduleRow[],
      activities: activityResult.rows as unknown as ActivityRow[],
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

type SearchAggregateRow = { total: number; items: GlobalSearchResult[] };

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
  const offset = (input.page - 1) * input.pageSize;
  const result = await database.execute(sql`
    with matches as (
      select 'contact'::text as kind, c.id, c.name as title,
             coalesce(c.profession, c.contact_type) as subtitle, c.status as status,
             ''::text as href,
             c.updated_at as "updatedAt",
             case when lower(c.name) = ${normalized} then 0 when lower(c.name) like ${prefix} then 1 else 2 end as rank
      from app.contacts c where c.owner_user_id = ${context.user.id} and c.archived_at is null
        and ${input.scope} in ('all', 'contact')
        and to_tsvector('simple', lower(c.name)) @@ plainto_tsquery('simple', ${normalized})
      union all
      select 'business', b.id, b.name, b.category_key, b.stage_key,
             ''::text, b.updated_at,
             case when lower(b.name) = ${normalized} then 0 when lower(b.name) like ${prefix} then 1 else 2 end
      from app.businesses b where b.owner_user_id = ${context.user.id} and b.archived_at is null
        and ${input.scope} in ('all', 'business')
        and to_tsvector('simple', lower(b.name)) @@ plainto_tsquery('simple', ${normalized})
      union all
      select 'project', p.id, p.name, b.name, p.status_key,
             ''::text, p.updated_at,
             case when lower(p.name) = ${normalized} then 0 when lower(p.name) like ${prefix} then 1 else 2 end
      from app.projects p join app.businesses b on b.id = p.business_id
      where p.workspace_id = ${workspaceId} and p.archived_at is null
        and ${input.scope} in ('all', 'project')
        and to_tsvector('simple', lower(p.name)) @@ plainto_tsquery('simple', ${normalized})
      union all
      select 'task', t.id, t.name, p.name, t.status_key,
             ''::text, t.updated_at,
             case when lower(t.name) = ${normalized} then 0 when lower(t.name) like ${prefix} then 1 else 2 end
      from app.tasks t join app.projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
      where t.workspace_id = ${workspaceId} and t.archived_at is null
        and ${input.scope} in ('all', 'task')
        and to_tsvector('simple', lower(t.name)) @@ plainto_tsquery('simple', ${normalized})
    ), page as (
      select kind, id, title, subtitle, status, href, "updatedAt"
      from matches order by rank, lower(title), "updatedAt" desc, id
      limit ${input.pageSize} offset ${offset}
    )
    select (select count(*)::int from matches) as total,
           coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb) as items
  `);
  const row = result.rows[0] as unknown as SearchAggregateRow;
  const items = row.items.map((item) => ({
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
    total: row.total,
    totalPages: Math.max(1, Math.ceil(row.total / input.pageSize)),
    items,
    meta: { queryMs: Math.round((performance.now() - started) * 100) / 100 },
  };
}
