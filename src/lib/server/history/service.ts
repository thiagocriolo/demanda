import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermission,
} from "../authorization/workspace-context";
import type { Database } from "../db/database";
import { auditLogs, users } from "../db/schema";
import type { HistoryQuery } from "./validation";

const typesByModule = {
  tasks: ["task"],
  subtasks: ["subtask"],
  cronograma: ["cronograma"],
  agenda: ["agenda"],
  projects: ["project"],
} as const;

const labels: Record<string, string> = {
  task: "Tarefa",
  subtask: "Subtarefa",
  project: "Projeto",
  agenda: "Agenda",
  cronograma: "Cronograma",
};

type StoredChanges = Array<{ field: string; before: unknown; after: unknown }>;

function nextDay(date: string): Date {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

function changesFrom(value: unknown): StoredChanges {
  if (!value || typeof value !== "object" || !("changes" in value)) return [];
  const changes = (value as { changes?: unknown }).changes;
  if (!Array.isArray(changes)) return [];
  return changes.flatMap((change) => {
    if (!change || typeof change !== "object") return [];
    const item = change as Record<string, unknown>;
    return typeof item.field === "string"
      ? [{ field: item.field, before: item.before ?? null, after: item.after ?? null }]
      : [];
  });
}

export async function getHistoryReport(
  database: Database,
  context: RequestAuthorizationContext,
  input: HistoryQuery,
) {
  const current = requireActiveWorkspacePermission(context, "workspace:read");
  const workspaceId = current.workspace.id;
  await requireWorkspacePermission(
    database,
    context.user.id,
    workspaceId,
    "workspace:read",
  );
  const targetTypes = input.modules.flatMap((module) => typesByModule[module]);
  if (!targetTypes.length) {
    return { workspaceId, range: { from: input.from, to: input.to }, summary: { total: 0, byModule: {} }, events: [] };
  }
  const rows = await database
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(
      and(
        eq(auditLogs.workspaceId, workspaceId),
        inArray(auditLogs.targetType, [...targetTypes]),
        gte(auditLogs.createdAt, new Date(`${input.from}T00:00:00.000Z`)),
        lt(auditLogs.createdAt, nextDay(input.to)),
      ),
    )
    .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id));

  const events = rows.map((row) => ({
    id: row.id,
    occurredAt: row.createdAt.toISOString(),
    actorName: row.actorName ?? "Sistema",
    action: row.action,
    module: row.targetType,
    moduleLabel: labels[row.targetType] ?? row.targetType,
    targetId: row.targetId,
    changes: changesFrom(row.metadata),
  }));
  const byModule = events.reduce<Record<string, number>>((result, event) => {
    result[event.module] = (result[event.module] ?? 0) + 1;
    return result;
  }, {});
  return {
    workspaceId,
    range: { from: input.from, to: input.to },
    summary: { total: events.length, byModule },
    events,
  };
}
