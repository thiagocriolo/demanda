import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  hashOpaqueToken,
  createOpaqueToken,
} from "../../src/lib/server/auth/token";
import { WorkspacePermissionDeniedError } from "../../src/lib/server/authorization/policy";
import {
  changeWorkspaceMemberRole,
  transferWorkspaceOwnership,
} from "../../src/lib/server/authorization/workspace-administration";
import {
  requireWorkspacePermission,
  resolveAuthorizationContext,
  switchActiveWorkspace,
  WorkspaceNotFoundError,
  type RequestAuthorizationContext,
} from "../../src/lib/server/authorization/workspace-context";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  auditLogs,
  authSessions,
  users,
  workspaceMembers,
  workspaces,
} from "../../src/lib/server/db/schema";

const pool = createDatabasePool(parseServerEnvironment(process.env));
const database = createDatabase(pool);

class RollbackFixture extends Error {}

async function withRollback(
  run: (database: Database) => Promise<void>,
): Promise<void> {
  try {
    await database.transaction(async (transaction) => {
      await run(transaction as unknown as Database);
      throw new RollbackFixture();
    });
  } catch (cause) {
    if (cause instanceof RollbackFixture) return;
    throw cause;
  }
}

async function insertUser(database: Database, label: string): Promise<string> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const id = randomUUID();
  const user = { id };
  await database
    .insert(users)
    .values({
      id,
      name: label,
      username: `${label.toLowerCase()}_${suffix}`,
      email: `${label.toLowerCase()}-${suffix}@example.test`,
    });
  if (!user) throw new Error("Usuário de teste não criado.");
  return user.id;
}

async function insertWorkspace(
  database: Database,
  ownerUserId: string,
  name: string,
  kind: "personal" | "shared" = "shared",
): Promise<string> {
  const id = randomUUID();
  const workspace = { id };
  await database
    .insert(workspaces)
    .values({ id, name, kind, ownerUserId });
  await database.insert(workspaceMembers).values({
    workspaceId: id,
    userId: ownerUserId,
    role: "owner",
  });
  if (!workspace) throw new Error("Workspace de teste não criado.");
  return workspace.id;
}

async function insertSession(
  database: Database,
  userId: string,
  activeWorkspaceId: string,
): Promise<{ id: string; token: string }> {
  const token = createOpaqueToken();
  const id = randomUUID();
  const session = { id };
  await database
    .insert(authSessions)
    .values({
      id,
      userId,
      activeWorkspaceId,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    });
  if (!session) throw new Error("Sessão de teste não criada.");
  return { id: session.id, token };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture(database: Database) {
  const ownerId = await insertUser(database, "owner");
  const adminId = await insertUser(database, "admin");
  const memberId = await insertUser(database, "member");
  const targetId = await insertUser(database, "target");
  const outsiderId = await insertUser(database, "outsider");
  const workspaceId = await insertWorkspace(
    database,
    ownerId,
    "Workspace compartilhado",
  );
  const memberPersonalWorkspaceId = await insertWorkspace(
    database,
    memberId,
    "Pessoal do membro",
    "personal",
  );
  const outsiderWorkspaceId = await insertWorkspace(
    database,
    outsiderId,
    "Workspace externo",
  );

  await database.insert(workspaceMembers).values([
    { workspaceId, userId: adminId, role: "admin" },
    { workspaceId, userId: memberId, role: "member" },
    { workspaceId, userId: targetId, role: "member" },
  ]);

  const ownerSession = await insertSession(database, ownerId, workspaceId);
  const adminSession = await insertSession(database, adminId, workspaceId);
  const memberSession = await insertSession(database, memberId, workspaceId);
  // O banco aceita a preferência, mas o resolvedor deve ignorá-la sem vínculo.
  const outsiderSession = await insertSession(
    database,
    outsiderId,
    workspaceId,
  );

  return {
    ownerId,
    adminId,
    memberId,
    targetId,
    outsiderId,
    workspaceId,
    memberPersonalWorkspaceId,
    outsiderWorkspaceId,
    ownerSession,
    adminSession,
    memberSession,
    outsiderSession,
  };
}

async function context(
  database: Database,
  token: string,
): Promise<RequestAuthorizationContext> {
  const resolved = await resolveAuthorizationContext(database, token);
  if (!resolved) throw new Error("Contexto autenticado não resolvido.");
  return resolved;
}

async function expectNotFound(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error("A operação deveria retornar not found.");
  } catch (cause) {
    expect(cause).toBeInstanceOf(WorkspaceNotFoundError);
    return (cause as WorkspaceNotFoundError).message;
  }
}

describe("BE-04: contexto e autorização multi-tenant", () => {
  afterAll(() => pool.end());

  it("resolve o workspace da sessão, ignora preferência forjada e faz fallback", async () => {
    await withRollback(async (database) => {
      const fixture = await createFixture(database);
      const member = await context(database, fixture.memberSession.token);
      expect(member.activeWorkspace).toMatchObject({
        workspace: { id: fixture.workspaceId },
        membership: { role: "member" },
      });

      const outsider = await context(database, fixture.outsiderSession.token);
      expect(outsider.activeWorkspace?.workspace.id).toBe(
        fixture.outsiderWorkspaceId,
      );
      const [storedOutsiderSession] = await database
        .select({ activeWorkspaceId: authSessions.activeWorkspaceId })
        .from(authSessions)
        .where(eq(authSessions.id, fixture.outsiderSession.id));
      expect(storedOutsiderSession?.activeWorkspaceId).toBe(
        fixture.outsiderWorkspaceId,
      );

      const owner = await context(database, fixture.ownerSession.token);
      await expect(
        switchActiveWorkspace(database, owner, fixture.outsiderWorkspaceId),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
      const [unchangedOwnerSession] = await database
        .select({ activeWorkspaceId: authSessions.activeWorkspaceId })
        .from(authSessions)
        .where(eq(authSessions.id, fixture.ownerSession.id));
      expect(unchangedOwnerSession?.activeWorkspaceId).toBe(
        fixture.workspaceId,
      );

      await database
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, fixture.workspaceId),
            eq(workspaceMembers.userId, fixture.memberId),
          ),
        );
      const fallback = await context(database, fixture.memberSession.token);
      expect(fallback.activeWorkspace?.workspace.id).toBe(
        fixture.memberPersonalWorkspaceId,
      );
    });
  });

  it("aplica a matriz de papéis e oculta workspace estrangeiro como inexistente", async () => {
    await withRollback(async (database) => {
      const fixture = await createFixture(database);

      for (const permission of [
        "workspace:read",
        "workspace:write",
        "workspace:administer",
        "workspace:own",
      ] as const) {
        await expect(
          requireWorkspacePermission(
            database,
            fixture.ownerId,
            fixture.workspaceId,
            permission,
          ),
        ).resolves.toMatchObject({ membership: { role: "owner" } });
      }

      await expect(
        requireWorkspacePermission(
          database,
          fixture.adminId,
          fixture.workspaceId,
          "workspace:administer",
        ),
      ).resolves.toMatchObject({ membership: { role: "admin" } });
      await expect(
        requireWorkspacePermission(
          database,
          fixture.adminId,
          fixture.workspaceId,
          "workspace:own",
        ),
      ).rejects.toBeInstanceOf(WorkspacePermissionDeniedError);

      for (const permission of ["workspace:read", "workspace:write"] as const) {
        await expect(
          requireWorkspacePermission(
            database,
            fixture.memberId,
            fixture.workspaceId,
            permission,
          ),
        ).resolves.toMatchObject({ membership: { role: "member" } });
      }
      await expect(
        requireWorkspacePermission(
          database,
          fixture.memberId,
          fixture.workspaceId,
          "workspace:administer",
        ),
      ).rejects.toBeInstanceOf(WorkspacePermissionDeniedError);

      const foreignMessage = await expectNotFound(
        requireWorkspacePermission(
          database,
          fixture.outsiderId,
          fixture.workspaceId,
          "workspace:read",
        ),
      );
      const missingMessage = await expectNotFound(
        requireWorkspacePermission(
          database,
          fixture.outsiderId,
          randomUUID(),
          "workspace:read",
        ),
      );
      expect(foreignMessage).toBe(missingMessage);
    });
  });

  it("reautoriza mutations e grava auditoria atômica somente no sucesso", async () => {
    await withRollback(async (database) => {
      const fixture = await createFixture(database);
      const member = await context(database, fixture.memberSession.token);
      const admin = await context(database, fixture.adminSession.token);
      const owner = await context(database, fixture.ownerSession.token);

      await expect(
        changeWorkspaceMemberRole(database, member, {
          workspaceId: fixture.workspaceId,
          targetUserId: fixture.targetId,
          role: "admin",
        }),
      ).rejects.toBeInstanceOf(WorkspacePermissionDeniedError);
      expect(
        await database
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.workspaceId, fixture.workspaceId)),
      ).toHaveLength(0);

      await changeWorkspaceMemberRole(database, admin, {
        workspaceId: fixture.workspaceId,
        targetUserId: fixture.targetId,
        role: "admin",
        request: { ipAddress: "127.0.0.1", userAgent: "Vitest BE-04" },
      });
      let logs = await database
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.workspaceId, fixture.workspaceId));
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        workspaceId: fixture.workspaceId,
        actorUserId: fixture.adminId,
        action: "workspace.member_role_changed",
        targetId: fixture.targetId,
        metadata: { fromRole: "member", toRole: "admin" },
      });

      // O snapshot ainda diz admin, mas o serviço deve revalidar no banco.
      await database
        .update(workspaceMembers)
        .set({ role: "member" })
        .where(
          and(
            eq(workspaceMembers.workspaceId, fixture.workspaceId),
            eq(workspaceMembers.userId, fixture.adminId),
          ),
        );
      await expect(
        changeWorkspaceMemberRole(database, admin, {
          workspaceId: fixture.workspaceId,
          targetUserId: fixture.targetId,
          role: "member",
        }),
      ).rejects.toBeInstanceOf(WorkspacePermissionDeniedError);
      logs = await database
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.workspaceId, fixture.workspaceId));
      expect(logs).toHaveLength(1);

      await expect(
        transferWorkspaceOwnership(database, admin, {
          workspaceId: fixture.workspaceId,
          targetUserId: fixture.targetId,
        }),
      ).rejects.toBeInstanceOf(WorkspacePermissionDeniedError);
      await transferWorkspaceOwnership(database, owner, {
        workspaceId: fixture.workspaceId,
        targetUserId: fixture.targetId,
      });

      const [workspace] = await database
        .select({ ownerUserId: workspaces.ownerUserId })
        .from(workspaces)
        .where(eq(workspaces.id, fixture.workspaceId));
      expect(workspace?.ownerUserId).toBe(fixture.targetId);
      logs = await database
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.workspaceId, fixture.workspaceId));
      expect(logs).toHaveLength(2);
      expect(logs.find((log) => log.action === "workspace.ownership_transferred")).toMatchObject({
        actorUserId: fixture.ownerId,
        action: "workspace.ownership_transferred",
      });
      expect(JSON.stringify(logs)).not.toContain(fixture.ownerSession.token);
    });
  });
});
