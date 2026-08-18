import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/database";
import {
  authSessions,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "../db/schema";
import { resolveSession, type SessionPrincipal } from "../auth/service";
import { assertWorkspacePermission, type WorkspacePermission } from "./policy";

type AuthorizationDatabase = Pick<Database, "select" | "update">;

class SessionNoLongerActiveError extends Error {}

export type AuthorizedWorkspace = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  kind: "personal" | "shared";
  ownerUserId: string;
};

export type WorkspaceAccessContext = {
  workspace: AuthorizedWorkspace;
  membership: {
    userId: string;
    role: WorkspaceRole;
    joinedAt: Date;
  };
};

export type RequestAuthorizationContext = SessionPrincipal & {
  activeWorkspace: WorkspaceAccessContext | null;
};

export class WorkspaceNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Workspace não encontrado.");
    this.name = "WorkspaceNotFoundError";
  }
}

export class ActiveWorkspaceRequiredError extends Error {
  readonly status = 409;

  constructor() {
    super("Nenhum workspace ativo está disponível.");
    this.name = "ActiveWorkspaceRequiredError";
  }
}

function mapWorkspace(
  workspace: typeof workspaces.$inferSelect,
): AuthorizedWorkspace {
  return {
    id: workspace.id,
    name: workspace.name,
    description: workspace.description,
    icon: workspace.icon,
    color: workspace.color,
    kind: workspace.kind,
    ownerUserId: workspace.ownerUserId,
  };
}

function mapAccess(result: {
  workspace: typeof workspaces.$inferSelect;
  userId: string;
  role: WorkspaceRole;
  joinedAt: Date;
}): WorkspaceAccessContext {
  return {
    workspace: mapWorkspace(result.workspace),
    membership: {
      userId: result.userId,
      role: result.role,
      joinedAt: result.joinedAt,
    },
  };
}

export async function findWorkspaceAccess(
  database: AuthorizationDatabase,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceAccessContext | null> {
  const [result] = await database
    .select({
      workspace: workspaces,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);

  return result ? mapAccess(result) : null;
}

export async function findDefaultWorkspaceAccess(
  database: AuthorizationDatabase,
  userId: string,
): Promise<WorkspaceAccessContext | null> {
  const [result] = await database
    .select({
      workspace: workspaces,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(eq(workspaceMembers.userId, userId), isNull(workspaces.archivedAt)),
    )
    .orderBy(
      desc(sql<boolean>`${workspaces.kind} = 'personal'`),
      asc(workspaceMembers.joinedAt),
      asc(workspaces.id),
    )
    .limit(1);

  return result ? mapAccess(result) : null;
}

async function findWorkspaceAccessForUpdate(
  database: AuthorizationDatabase,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceAccessContext | null> {
  const [result] = await database
    .select({
      workspace: workspaces,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1)
    .for("update");

  return result ? mapAccess(result) : null;
}

async function persistActiveWorkspace(
  database: AuthorizationDatabase,
  principal: SessionPrincipal,
  workspaceId: string | null,
  now = new Date(),
): Promise<void> {
  const updated = await database
    .update(authSessions)
    .set({ activeWorkspaceId: workspaceId })
    .where(
      and(
        eq(authSessions.id, principal.session.id),
        eq(authSessions.userId, principal.user.id),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
      ),
    )
    .returning({ id: authSessions.id });
  if (updated.length !== 1) throw new SessionNoLongerActiveError();
  principal.session.activeWorkspaceId = workspaceId;
}

export async function resolveActiveWorkspace(
  database: AuthorizationDatabase,
  principal: SessionPrincipal,
): Promise<WorkspaceAccessContext | null> {
  const preferredId = principal.session.activeWorkspaceId;
  if (preferredId) {
    const preferred = await findWorkspaceAccess(
      database,
      principal.user.id,
      preferredId,
    );
    if (preferred) return preferred;
  }

  const fallback = await findDefaultWorkspaceAccess(
    database,
    principal.user.id,
  );
  const fallbackId = fallback?.workspace.id ?? null;
  if (fallbackId !== preferredId) {
    await persistActiveWorkspace(database, principal, fallbackId);
  }
  return fallback;
}

export async function resolveAuthorizationContext(
  database: Database,
  token: string | undefined,
  now = new Date(),
): Promise<RequestAuthorizationContext | null> {
  const principal = await resolveSession(database, token, now);
  if (!principal) return null;
  try {
    const activeWorkspace = await resolveActiveWorkspace(database, principal);
    return { ...principal, activeWorkspace };
  } catch (cause) {
    if (cause instanceof SessionNoLongerActiveError) return null;
    throw cause;
  }
}

export async function switchActiveWorkspace(
  database: Database,
  context: RequestAuthorizationContext,
  requestedWorkspaceId: string,
): Promise<WorkspaceAccessContext> {
  const access = await database.transaction(async (transaction) => {
    const locked = await findWorkspaceAccessForUpdate(
      transaction,
      context.user.id,
      requestedWorkspaceId,
    );
    if (!locked) throw new WorkspaceNotFoundError();
    await persistActiveWorkspace(transaction, context, locked.workspace.id);
    return locked;
  });
  context.activeWorkspace = access;
  return access;
}

export async function requireWorkspacePermission(
  database: AuthorizationDatabase,
  userId: string,
  workspaceId: string,
  permission: WorkspacePermission,
): Promise<WorkspaceAccessContext> {
  const access = await findWorkspaceAccess(database, userId, workspaceId);
  if (!access) throw new WorkspaceNotFoundError();
  assertWorkspacePermission(access.membership.role, permission);
  return access;
}

/** Revalida e bloqueia o vínculo; obrigatório antes de mutations sensíveis. */
export async function requireWorkspacePermissionForUpdate(
  database: AuthorizationDatabase,
  userId: string,
  workspaceId: string,
  permission: WorkspacePermission,
): Promise<WorkspaceAccessContext> {
  const access = await findWorkspaceAccessForUpdate(
    database,
    userId,
    workspaceId,
  );
  if (!access) throw new WorkspaceNotFoundError();
  assertWorkspacePermission(access.membership.role, permission);
  return access;
}

export function requireActiveWorkspacePermission(
  context: RequestAuthorizationContext,
  permission: WorkspacePermission,
): WorkspaceAccessContext {
  if (!context.activeWorkspace) throw new ActiveWorkspaceRequiredError();
  assertWorkspacePermission(
    context.activeWorkspace.membership.role,
    permission,
  );
  return context.activeWorkspace;
}
