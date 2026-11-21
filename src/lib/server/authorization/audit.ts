import type { Database } from "../db/database";
import { auditLogs } from "../db/schema";
import type { WorkspaceAccessContext } from "./workspace-context";

type AuditDatabase = Pick<Database, "insert">;

export type AuditRequestMetadata = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AdministrativeAuditEntry = {
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * An immutable record of a business-data mutation.  Keeping the change list in
 * the audit metadata lets reports describe the exact fields that changed
 * without coupling the audit table to every aggregate in the application.
 */
export type DataChangeAuditEntry = {
  action: string;
  targetType: "task" | "subtask" | "project" | "agenda" | "cronograma";
  targetId: string;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
  metadata?: Record<string, unknown>;
};

export async function appendDataChangeAuditLog(
  database: AuditDatabase,
  actor: { userId: string; workspaceId: string },
  entry: DataChangeAuditEntry,
): Promise<void> {
  if (!entry.changes.length) return;
  await database.insert(auditLogs).values({
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: { changes: entry.changes, ...(entry.metadata ?? {}) },
  });
}

export async function appendAdministrativeAuditLog(
  database: AuditDatabase,
  actor: { userId: string; workspace: WorkspaceAccessContext },
  entry: AdministrativeAuditEntry,
  request: AuditRequestMetadata = {},
): Promise<void> {
  await database.insert(auditLogs).values({
    workspaceId: actor.workspace.workspace.id,
    actorUserId: actor.userId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
    ipAddress: request.ipAddress?.slice(0, 64) || null,
    userAgent: request.userAgent?.slice(0, 512) || null,
  });
}
