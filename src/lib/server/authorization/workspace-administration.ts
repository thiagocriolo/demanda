import { and, eq } from "drizzle-orm";
import type { Database } from "../db/database";
import { workspaceMembers, workspaces } from "../db/schema";
import {
  appendAdministrativeAuditLog,
  type AuditRequestMetadata,
} from "./audit";
import type { RequestAuthorizationContext } from "./workspace-context";
import {
  requireWorkspacePermissionForUpdate,
  WorkspaceNotFoundError,
} from "./workspace-context";

export type AssignableWorkspaceRole = "admin" | "member";

export class WorkspaceOperationNotAllowedError extends Error {
  readonly status = 409;

  constructor(message = "A operação não é permitida para este workspace.") {
    super(message);
    this.name = "WorkspaceOperationNotAllowedError";
  }
}

export async function changeWorkspaceMemberRole(
  database: Database,
  actor: RequestAuthorizationContext,
  input: {
    workspaceId: string;
    targetUserId: string;
    role: AssignableWorkspaceRole;
    request?: AuditRequestMetadata;
  },
): Promise<void> {
  if (actor.activeWorkspace?.workspace.id !== input.workspaceId) {
    throw new WorkspaceNotFoundError();
  }
  await database.transaction(async (transaction) => {
    const access = await requireWorkspacePermissionForUpdate(
      transaction,
      actor.user.id,
      input.workspaceId,
      "workspace:administer",
    );

    const [target] = await transaction
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.workspaceId),
          eq(workspaceMembers.userId, input.targetUserId),
        ),
      )
      .limit(1)
      .for("update");

    if (!target) throw new WorkspaceNotFoundError();
    if (target.role === "owner") {
      throw new WorkspaceOperationNotAllowedError(
        "O papel de proprietário só pode mudar por transferência.",
      );
    }
    if (target.role === input.role) return;

    const changed = await transaction
      .update(workspaceMembers)
      .set({ role: input.role, updatedAt: new Date() })
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.workspaceId),
          eq(workspaceMembers.userId, input.targetUserId),
          eq(workspaceMembers.role, target.role),
        ),
      )
      .returning({ userId: workspaceMembers.userId });
    if (changed.length !== 1) throw new WorkspaceNotFoundError();

    await appendAdministrativeAuditLog(
      transaction,
      { userId: actor.user.id, workspace: access },
      {
        action: "workspace.member_role_changed",
        targetType: "workspace_member",
        targetId: input.targetUserId,
        metadata: { fromRole: target.role, toRole: input.role },
      },
      input.request,
    );
  });
}

export async function transferWorkspaceOwnership(
  database: Database,
  actor: RequestAuthorizationContext,
  input: {
    workspaceId: string;
    targetUserId: string;
    request?: AuditRequestMetadata;
  },
): Promise<void> {
  if (actor.activeWorkspace?.workspace.id !== input.workspaceId) {
    throw new WorkspaceNotFoundError();
  }
  await database.transaction(async (transaction) => {
    const access = await requireWorkspacePermissionForUpdate(
      transaction,
      actor.user.id,
      input.workspaceId,
      "workspace:own",
    );
    if (access.workspace.kind !== "shared") {
      throw new WorkspaceOperationNotAllowedError(
        "O workspace pessoal não pode ser transferido.",
      );
    }
    if (input.targetUserId === actor.user.id) {
      throw new WorkspaceOperationNotAllowedError(
        "O proprietário informado já possui este papel.",
      );
    }

    const [target] = await transaction
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, input.workspaceId),
          eq(workspaceMembers.userId, input.targetUserId),
        ),
      )
      .limit(1)
      .for("update");
    if (!target) throw new WorkspaceNotFoundError();

    const changed = await transaction
      .update(workspaces)
      .set({ ownerUserId: target.userId, updatedAt: new Date() })
      .where(
        and(
          eq(workspaces.id, input.workspaceId),
          eq(workspaces.ownerUserId, actor.user.id),
        ),
      )
      .returning({ id: workspaces.id });
    if (changed.length !== 1) throw new WorkspaceNotFoundError();

    await appendAdministrativeAuditLog(
      transaction,
      { userId: actor.user.id, workspace: access },
      {
        action: "workspace.ownership_transferred",
        targetType: "workspace",
        targetId: input.workspaceId,
        metadata: {
          previousOwnerUserId: actor.user.id,
          nextOwnerUserId: target.userId,
        },
      },
      input.request,
    );
  });
}
