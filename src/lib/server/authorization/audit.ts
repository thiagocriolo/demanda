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
