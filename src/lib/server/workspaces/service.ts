import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { affectedRows, rawRows, type Database } from "../db/database";
import {
  authSessions,
  auditLogs,
  businesses,
  projectResponsibles,
  projects,
  projectServices,
  services,
  users,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "../db/schema";
import { connectWorkspaceMembers } from "../connections/service";
import {
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
  WorkspaceNotFoundError,
} from "../authorization/workspace-context";
import { WorkspaceOperationNotAllowedError } from "../authorization/workspace-administration";

export type WorkspaceInput = {
  name: string;
  description: string;
  icon: string;
  color: string;
};

export type WorkspaceUserView = {
  id: string;
  username: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

export type WorkspaceInvitationView = {
  id: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  status: "pending";
  createdAt: string;
};

export type IncomingWorkspaceInvitationView = WorkspaceInvitationView & {
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string;
  workspaceColor: string;
  invitedBy: WorkspaceUserView;
};

export type WorkspaceView = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  kind: "personal" | "shared";
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  members: { userId: string; role: WorkspaceRole; joinedAt: string }[];
  invitations: WorkspaceInvitationView[];
  projectCount: number;
  projectPreviews: WorkspaceProjectPreviewView[];
};

export type WorkspaceProjectPreviewView = {
  id: string;
  workspaceId: string;
  name: string;
  businessName: string;
  status: string;
  endDate: string | null;
  responsibleNames: string[];
  serviceNames: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceSnapshot = {
  activeWorkspaceId: string;
  currentUser: WorkspaceUserView;
  users: WorkspaceUserView[];
  workspaces: WorkspaceView[];
  pendingInvitations: IncomingWorkspaceInvitationView[];
};

function userView(user: typeof users.$inferSelect): WorkspaceUserView {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
  };
}

function invitationView(
  invitation: typeof workspaceInvitations.$inferSelect,
): WorkspaceInvitationView {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: "pending",
    createdAt: invitation.createdAt.toISOString(),
  };
}

export async function listUserWorkspaces(
  database: Database,
  userId: string,
  activeWorkspaceId: string | null,
): Promise<WorkspaceSnapshot> {
  const [currentUser] = await database
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  if (!currentUser) throw new WorkspaceNotFoundError();

  const accessible = await database
    .select({ workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(eq(workspaceMembers.userId, userId), isNull(workspaces.archivedAt)),
    )
    .orderBy(
      asc(
        sql<number>`case when ${workspaces.kind} = 'personal' then 0 else 1 end`,
      ),
      asc(workspaceMembers.joinedAt),
      asc(workspaces.id),
    );
  if (accessible.length === 0) throw new WorkspaceNotFoundError();
  const ids = accessible.map(({ workspace }) => workspace.id);
  const memberRows = await database
    .select({ member: workspaceMembers, user: users })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(inArray(workspaceMembers.workspaceId, ids), isNull(users.deletedAt)),
    )
    .orderBy(asc(workspaceMembers.joinedAt), asc(workspaceMembers.userId));
  const invitationRows = await database
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        inArray(workspaceInvitations.workspaceId, ids),
        eq(workspaceInvitations.status, "pending"),
      ),
    )
    .orderBy(asc(workspaceInvitations.createdAt), asc(workspaceInvitations.id));
  const projectRows = await database
    .select({
      id: projects.id,
      workspaceId: projects.workspaceId,
      name: projects.name,
      businessName: businesses.name,
      status: projects.statusKey,
      endDate: projects.endDate,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .innerJoin(businesses, eq(businesses.id, projects.businessId))
    .where(and(inArray(projects.workspaceId, ids), isNull(projects.archivedAt)))
    .orderBy(
      asc(projects.workspaceId),
      asc(projects.endDate),
      asc(projects.id),
    );
  const projectIds = projectRows.map(({ id }) => id);
  const projectResponsibleRows = projectIds.length
    ? await database
        .select({
          workspaceId: projectResponsibles.workspaceId,
          projectId: projectResponsibles.projectId,
          name: users.name,
        })
        .from(projectResponsibles)
        .innerJoin(users, eq(users.id, projectResponsibles.userId))
        .where(inArray(projectResponsibles.projectId, projectIds))
        .orderBy(
          asc(projectResponsibles.projectId),
          asc(projectResponsibles.sortOrder),
        )
    : [];
  const projectServiceRows = projectIds.length
    ? await database
        .select({
          workspaceId: projectServices.workspaceId,
          projectId: projectServices.projectId,
          name: services.name,
        })
        .from(projectServices)
        .innerJoin(
          services,
          and(
            eq(services.workspaceId, projectServices.workspaceId),
            eq(services.id, projectServices.serviceId),
          ),
        )
        .where(inArray(projectServices.projectId, projectIds))
        .orderBy(asc(projectServices.projectId), asc(projectServices.sortOrder))
    : [];
  const incomingInvitationRows = await database
    .select({
      invitation: workspaceInvitations,
      workspace: workspaces,
      invitedBy: users,
    })
    .from(workspaceInvitations)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvitations.workspaceId))
    .innerJoin(users, eq(users.id, workspaceInvitations.invitedByUserId))
    .where(
      and(
        eq(workspaceInvitations.email, currentUser.email),
        eq(workspaceInvitations.status, "pending"),
        isNull(workspaces.archivedAt),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(workspaceInvitations.createdAt), asc(workspaceInvitations.id));
  const visibleUsers = memberRows
    .map(({ user }) => user)
    .filter(
      (user, index, values) =>
        values.findIndex(({ id }) => id === user.id) === index,
    )
    .map(userView);
  const fallbackId = accessible[0]!.workspace.id;
  const resolvedActiveId = ids.includes(activeWorkspaceId ?? "")
    ? activeWorkspaceId!
    : fallbackId;

  return {
    activeWorkspaceId: resolvedActiveId,
    currentUser: userView(currentUser),
    users: visibleUsers,
    pendingInvitations: incomingInvitationRows.map(
      ({ invitation, workspace, invitedBy }) => ({
        ...invitationView(invitation),
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceIcon: workspace.icon,
        workspaceColor: workspace.color,
        invitedBy: userView(invitedBy),
      }),
    ),
    workspaces: accessible.map(({ workspace }) => ({
      id: workspace.id,
      name: workspace.kind === "personal" ? "Pessoal" : workspace.name,
      description: workspace.description,
      icon: workspace.icon,
      color: workspace.color,
      kind: workspace.kind,
      ownerId: workspace.ownerUserId,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
      members: memberRows
        .filter(({ member }) => member.workspaceId === workspace.id)
        .map(({ member }) => ({
          userId: member.userId,
          role: member.role,
          joinedAt: member.joinedAt.toISOString(),
        })),
      invitations: invitationRows
        .filter((invitation) => invitation.workspaceId === workspace.id)
        .map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: "pending" as const,
          createdAt: invitation.createdAt.toISOString(),
        })),
      projectCount: projectRows.filter(
        (project) => project.workspaceId === workspace.id,
      ).length,
      projectPreviews: projectRows
        .filter((project) => project.workspaceId === workspace.id)
        .map((project) => ({
          id: project.id,
          workspaceId: project.workspaceId,
          name: project.name,
          businessName: project.businessName,
          status: project.status,
          endDate: project.endDate,
          responsibleNames: projectResponsibleRows
            .filter(
              (responsible) =>
                responsible.workspaceId === workspace.id &&
                responsible.projectId === project.id,
            )
            .map(({ name }) => name),
          serviceNames: projectServiceRows
            .filter(
              (service) =>
                service.workspaceId === workspace.id &&
                service.projectId === project.id,
            )
            .map(({ name }) => name),
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
        })),
    })),
  };
}

export async function createUserWorkspace(
  database: Database,
  userId: string,
  input: WorkspaceInput,
): Promise<string> {
  return database.transaction(async (transaction) => {
    const id = randomUUID();
    await transaction
      .insert(workspaces)
      .values({ id, ...input, kind: "shared", ownerUserId: userId });
    const created = { id };
    await transaction.insert(workspaceMembers).values({
      workspaceId: id,
      userId,
      role: "owner",
    });
    if (!created) throw new Error("O workspace não pôde ser criado.");
    await transaction.insert(auditLogs).values({
      workspaceId: id,
      actorUserId: userId,
      action: "workspace.created",
      targetType: "workspace",
      targetId: id,
      metadata: {},
    });
    return id;
  });
}

export async function updateUserWorkspace(
  database: Database,
  userId: string,
  workspaceId: string,
  input: WorkspaceInput,
): Promise<void> {
  const access = await requireWorkspacePermissionForUpdate(
    database,
    userId,
    workspaceId,
    "workspace:administer",
  );
  const updated = await database
    .update(workspaces)
    .set({
      ...input,
      name: access.workspace.kind === "personal" ? "Pessoal" : input.name,
      updatedAt: new Date(),
    })
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)));
  if (affectedRows(updated) !== 1) throw new WorkspaceNotFoundError();
  await database.insert(auditLogs).values({
    workspaceId,
    actorUserId: userId,
    action: "workspace.updated",
    targetType: "workspace",
    targetId: workspaceId,
    metadata: { role: access.membership.role },
  });
}

export async function archiveUserWorkspace(
  database: Database,
  userId: string,
  workspaceId: string,
): Promise<void> {
  const access = await requireWorkspacePermissionForUpdate(
    database,
    userId,
    workspaceId,
    "workspace:own",
  );
  if (access.workspace.kind === "personal") {
    throw new WorkspaceOperationNotAllowedError(
      "O workspace pessoal não pode ser excluído.",
    );
  }
  await database.transaction(async (transaction) => {
    const [fallback] = await transaction
      .select({ id: workspaces.id })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          ne(workspaces.id, workspaceId),
          isNull(workspaces.archivedAt),
        ),
      )
      .orderBy(
        asc(
          sql<number>`case when ${workspaces.kind} = 'personal' then 0 else 1 end`,
        ),
      )
      .limit(1);
    if (!fallback) {
      throw new WorkspaceOperationNotAllowedError(
        "Nenhum workspace alternativo está disponível.",
      );
    }
    await transaction
      .update(authSessions)
      .set({
        activeWorkspaceId: sql`case when ${authSessions.userId} = ${userId} then ${fallback.id} else null end`,
      })
      .where(eq(authSessions.activeWorkspaceId, workspaceId));
    const archived = await transaction
      .update(workspaces)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)));
    if (affectedRows(archived) !== 1) throw new WorkspaceNotFoundError();
  });
}

export async function addWorkspaceCollaboratorByEmail(
  database: Database,
  actorUserId: string,
  workspaceId: string,
  input: { email: string; role: "admin" | "member" },
): Promise<
  | { status: "member"; user: WorkspaceUserView }
  | { status: "pending"; invitation: WorkspaceInvitationView }
> {
  const normalizedEmail = input.email.trim().toLocaleLowerCase("pt-BR");
  return database.transaction(async (transaction) => {
    const access = await requireWorkspacePermission(
      transaction as Database,
      actorUserId,
      workspaceId,
      "workspace:administer",
    );
    if (access.workspace.kind === "personal") {
      throw new WorkspaceOperationNotAllowedError(
        "O workspace pessoal não aceita outros membros.",
      );
    }

    await transaction
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for("update");
    const [target] = await transaction
      .select()
      .from(users)
      .where(
        and(
          eq(sql`lower(${users.email})`, normalizedEmail),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);

    if (target) {
      const [membership] = await transaction
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, target.id),
          ),
        )
        .limit(1);
      if (membership) return { status: "member", user: userView(target) };
    }

    const [pending] = await transaction
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          eq(workspaceInvitations.email, normalizedEmail),
          eq(workspaceInvitations.status, "pending"),
        ),
      )
      .limit(1);
    if (pending) {
      return { status: "pending", invitation: invitationView(pending) };
    }

    const capacity = await transaction.execute<{ total: string }>(sql`
      select (
        select count(*)
        from workspace_members member
        where member.workspace_id = ${workspaceId}
          and member.role <> 'owner'
      ) + (
        select count(*)
        from workspace_invitations invitation
        where invitation.workspace_id = ${workspaceId}
          and invitation.status = 'pending'
      ) as total
    `);
    if (Number(rawRows<{ total: string }>(capacity)[0]?.total ?? 0) >= 20) {
      throw new WorkspaceOperationNotAllowedError(
        "Cada workspace aceita no máximo 20 colaboradores.",
      );
    }

    if (target) {
      await transaction.insert(workspaceMembers).values({
        workspaceId,
        userId: target.id,
        role: input.role,
      });
      await connectWorkspaceMembers(
        transaction as Database,
        workspaceId,
        target.id,
      );
      return { status: "member", user: userView(target) };
    }

    const createdInvitationId = randomUUID();
    await transaction
      .insert(workspaceInvitations)
      .values({
        id: createdInvitationId,
        workspaceId,
        invitedByUserId: actorUserId,
        email: normalizedEmail,
        role: input.role,
      });
    const [invitation] = await transaction
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.id, createdInvitationId))
      .limit(1);
    if (!invitation) throw new Error("O convite não pôde ser criado.");
    return { status: "pending", invitation: invitationView(invitation) };
  });
}

export async function acceptWorkspaceInvitation(
  database: Database,
  userId: string,
  invitationId: string,
): Promise<string> {
  return database.transaction(async (transaction) => {
    const [user] = await transaction
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user) throw new WorkspaceNotFoundError();

    const [invitation] = await transaction
      .select({ invitation: workspaceInvitations, workspace: workspaces })
      .from(workspaceInvitations)
      .innerJoin(
        workspaces,
        eq(workspaces.id, workspaceInvitations.workspaceId),
      )
      .where(
        and(
          eq(workspaceInvitations.id, invitationId),
          eq(workspaceInvitations.email, user.email),
          eq(workspaceInvitations.status, "pending"),
          isNull(workspaces.archivedAt),
        ),
      )
      .limit(1);
    if (!invitation) throw new WorkspaceNotFoundError();

    await transaction
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, invitation.workspace.id))
      .for("update");
    const acceptedAt = new Date();
    const accepted = await transaction
      .update(workspaceInvitations)
      .set({
        status: "accepted",
        acceptedByUserId: userId,
        acceptedAt,
        updatedAt: acceptedAt,
      })
      .where(
        and(
          eq(workspaceInvitations.id, invitationId),
          eq(workspaceInvitations.status, "pending"),
        ),
      );
    if (affectedRows(accepted) !== 1) throw new WorkspaceNotFoundError();

    await transaction
      .insert(workspaceMembers)
      .values({
        workspaceId: invitation.workspace.id,
        userId,
        role: invitation.invitation.role,
        joinedAt: acceptedAt,
      })
      .onDuplicateKeyUpdate({
        set: { workspaceId: sql`${workspaceMembers.workspaceId}` },
      });
    await connectWorkspaceMembers(
      transaction as Database,
      invitation.workspace.id,
      userId,
    );
    await transaction.insert(auditLogs).values({
      workspaceId: invitation.workspace.id,
      actorUserId: userId,
      action: "workspace.invitation.accepted",
      targetType: "workspace_invitation",
      targetId: invitationId,
      metadata: { role: invitation.invitation.role },
    });
    return invitation.workspace.id;
  });
}

export async function revokeWorkspaceInvitation(
  database: Database,
  actorUserId: string,
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  await requireWorkspacePermission(
    database,
    actorUserId,
    workspaceId,
    "workspace:administer",
  );
  const revoked = await database
    .update(workspaceInvitations)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.workspaceId, workspaceId),
        eq(workspaceInvitations.status, "pending"),
      ),
    );
  if (affectedRows(revoked) !== 1) throw new WorkspaceNotFoundError();
}

export async function removeWorkspaceMember(
  database: Database,
  actorUserId: string,
  workspaceId: string,
  targetUserId: string,
): Promise<void> {
  await requireWorkspacePermission(
    database,
    actorUserId,
    workspaceId,
    "workspace:administer",
  );
  const removed = await database
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, targetUserId),
        ne(workspaceMembers.role, "owner"),
      ),
    );
  if (affectedRows(removed) !== 1) throw new WorkspaceNotFoundError();
}
