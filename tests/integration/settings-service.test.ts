import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { RequestAuthorizationContext } from "../../src/lib/server/authorization/workspace-context";
import { WorkspacePermissionDeniedError } from "../../src/lib/server/authorization/policy";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  deliveryTemplateSubtasks,
  deliveryTemplates,
  serviceTaskTemplates,
  services,
  userPreferences,
  users,
  workspaceConfigurations,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "../../src/lib/server/db/schema";
import {
  getUserSettings,
  getWorkspaceSettings,
  importSettingsSnapshot,
  SettingsRelationsInvalidError,
  SettingsVersionConflictError,
  updateUserSettings,
  updateWorkspaceSettings,
} from "../../src/lib/server/settings/service";

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

async function insertUser(database: Database, label: string) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const id = randomUUID();
  await database.insert(users).values({
      id,
      name: label,
      username: `${label.toLowerCase()}_${suffix}`,
      email: `${label.toLowerCase()}-${suffix}@example.test`,
    });
  const [user] = await database.select().from(users).where(eq(users.id, id));
  if (!user) throw new Error("Usuario de teste nao criado.");
  return user;
}

async function insertWorkspace(
  database: Database,
  ownerUserId: string,
  name: string,
) {
  const id = randomUUID();
  await database
    .insert(workspaces)
    .values({ id, name, kind: "shared", ownerUserId });
  await database.insert(workspaceMembers).values({
    workspaceId: id,
    userId: ownerUserId,
    role: "owner",
  });
  const [workspace] = await database.select().from(workspaces).where(eq(workspaces.id, id));
  if (!workspace) throw new Error("Workspace de teste nao criado.");
  return workspace;
}

function context(
  user: typeof users.$inferSelect,
  workspace: typeof workspaces.$inferSelect,
  role: WorkspaceRole,
): RequestAuthorizationContext {
  const now = new Date();
  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    session: {
      id: randomUUID(),
      userId: user.id,
      activeWorkspaceId: workspace.id,
      remembered: false,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    },
    activeWorkspace: {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        icon: workspace.icon,
        color: workspace.color,
        kind: workspace.kind,
        ownerUserId: workspace.ownerUserId,
      },
      membership: { userId: user.id, role, joinedAt: now },
    },
  };
}

async function fixture(database: Database) {
  const owner = await insertUser(database, "OwnerSettings");
  const member = await insertUser(database, "MemberSettings");
  const workspace = await insertWorkspace(database, owner.id, "BE09 principal");
  const isolated = await insertWorkspace(database, owner.id, "BE09 isolado");
  await database.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: member.id,
    role: "member",
  });
  return {
    owner,
    member,
    workspace,
    isolated,
    ownerContext: context(owner, workspace, "owner"),
    memberContext: context(member, workspace, "member"),
    isolatedContext: context(owner, isolated, "owner"),
  };
}

describe("BE-09: configuracoes persistentes", () => {
  it("inicializa o perfil com o avatar sorteado no cadastro", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction);
      data.ownerContext.user.avatarUrl = "/avatars/avatar-06.png?bg=A78BFA";

      const initial = await getUserSettings(transaction, data.ownerContext);

      expect(initial.settings.profile.avatarImage).toBe("avatar-06");
      expect(initial.settings.profile.avatarColor).toBe("#A78BFA");
    }));

  it("isola preferencias por usuario e usa versao otimista", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction);
      const initial = await getUserSettings(transaction, data.ownerContext);
      const saved = await updateUserSettings(transaction, data.ownerContext, {
        version: initial.version,
        settings: { ...initial.settings, theme: "dark" },
      });

      expect(saved.version).toBe(1);
      expect(saved.settings.theme).toBe("dark");
      expect(
        (await getUserSettings(transaction, data.memberContext)).settings.theme,
      ).toBe("light");
      await expect(
        updateUserSettings(transaction, data.ownerContext, {
          version: initial.version,
          settings: { ...initial.settings, theme: "light" },
        }),
      ).rejects.toBeInstanceOf(SettingsVersionConflictError);

      const [stored] = await transaction
        .select({ total: count() })
        .from(userPreferences)
        .where(eq(userPreferences.userId, data.owner.id));
      expect(stored?.total).toBe(1);
    }));

  it("compartilha catalogos e modelos sem permitir edicao por membro", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction);
      const initial = await getWorkspaceSettings(
        transaction,
        data.ownerContext,
      );
      const settings = structuredClone(initial.settings);
      settings.tags = ["BE09", "backend"];
      settings.serviceTemplates = [
        {
          id: "modelo-projeto-be09",
          name: "Projeto BE09",
          icon: "settings",
          color: "blue",
          briefing: "Modelo persistente",
          tags: "BE09",
          status: "planejamento",
          responsible: "",
          responsibleUserIds: [data.owner.id],
          duration: "15",
          contractType: "Projeto fechado",
          amount: "1500,50",
          installments: "2",
          paymentMethod: "Pix",
          paymentTerms: "Entrada e entrega",
          financeNotes: "",
          tasks: [
            {
              id: "ocorrencia-be09-1",
              templateId: "modelo-entrega-be09",
              name: "Entrega inicial",
            },
            {
              id: "ocorrencia-be09-2",
              templateId: "modelo-entrega-be09",
              name: "Entrega revisada",
            },
          ],
        },
      ];
      settings.deliveryTemplates = [
        {
          id: "modelo-entrega-be09",
          projectTemplateId: "",
          name: "Entrega BE09",
          category: "planejamento",
          briefing: "Entrega persistente",
          subtasks: [
            {
              id: "subtarefa-be09",
              nome: "Validar entrega",
              duracao: "1,5",
              status: "pendente",
            },
          ],
          status: "planejamento",
          priority: "normal",
          tags: "backend",
          responsible: "",
          responsibleUserIds: [data.owner.id],
          duration: "1,5",
        },
      ];

      const saved = await updateWorkspaceSettings(
        transaction,
        data.ownerContext,
        { version: initial.version, settings },
      );
      const memberView = await getWorkspaceSettings(
        transaction,
        data.memberContext,
      );

      expect(saved.version).toBe(initial.version + 1);
      expect(saved.settings.serviceTemplates[0]?.name).toBe("Projeto BE09");
      expect(saved.settings.serviceTemplates[0]?.tasks).toMatchObject([
        { name: "Entrega inicial" },
        { name: "Entrega revisada" },
      ]);
      expect(saved.settings.deliveryTemplates[0]?.subtasks[0]?.duracao).toBe(
        "1.5",
      );
      expect(memberView.settings).toEqual(saved.settings);
      expect(memberView.canManage).toBe(false);
      await expect(
        updateWorkspaceSettings(transaction, data.memberContext, {
          version: memberView.version,
          settings: memberView.settings,
        }),
      ).rejects.toBeInstanceOf(WorkspacePermissionDeniedError);

      const [persisted] = await transaction
        .select({ services: count(services.id) })
        .from(services)
        .where(eq(services.workspaceId, data.workspace.id));
      const [subtasks] = await transaction
        .select({ total: count() })
        .from(deliveryTemplateSubtasks)
        .innerJoin(
          deliveryTemplates,
          and(
            eq(
              deliveryTemplates.id,
              deliveryTemplateSubtasks.deliveryTemplateId,
            ),
            eq(
              deliveryTemplates.workspaceId,
              deliveryTemplateSubtasks.workspaceId,
            ),
          ),
        )
        .where(eq(deliveryTemplates.workspaceId, data.workspace.id));
      const [taskOccurrences] = await transaction
        .select({ total: count() })
        .from(serviceTaskTemplates)
        .where(eq(serviceTaskTemplates.workspaceId, data.workspace.id));
      expect(persisted?.services).toBe(1);
      expect(subtasks?.total).toBe(1);
      expect(taskOccurrences?.total).toBe(2);

      const isolated = await getWorkspaceSettings(
        transaction,
        data.isolatedContext,
      );
      expect(isolated.settings.serviceTemplates).toEqual([]);
      expect(isolated.settings.deliveryTemplates).toEqual([]);
    }));

  it("reverte toda a gravacao quando uma relacao e invalida", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction);
      const initial = await getWorkspaceSettings(
        transaction,
        data.ownerContext,
      );
      const settings = structuredClone(initial.settings);
      settings.serviceTemplates = [
        {
          id: "modelo-invalido",
          name: "Modelo invalido",
          icon: "settings",
          color: "blue",
          briefing: "",
          tags: "rollback",
          status: "planejamento",
          responsible: "",
          responsibleUserIds: [randomUUID()],
          duration: "10",
          contractType: "Projeto fechado",
          amount: "0",
          installments: "1",
          paymentMethod: "",
          paymentTerms: "",
          financeNotes: "",
          tasks: [],
        },
      ];

      const personal = await getUserSettings(transaction, data.ownerContext);
      await expect(
        importSettingsSnapshot(transaction, data.ownerContext, {
          personalVersion: personal.version,
          personal: { ...personal.settings, theme: "dark" },
          workspace: {
            workspaceId: data.workspace.id,
            version: initial.version,
            settings,
          },
        }),
      ).rejects.toBeInstanceOf(SettingsRelationsInvalidError);

      const [configuration] = await transaction
        .select()
        .from(workspaceConfigurations)
        .where(eq(workspaceConfigurations.workspaceId, data.workspace.id));
      const [persisted] = await transaction
        .select({ total: count() })
        .from(services)
        .where(eq(services.workspaceId, data.workspace.id));
      expect(configuration?.version).toBe(initial.version);
      expect(persisted?.total).toBe(0);
      expect(
        (await getUserSettings(transaction, data.ownerContext)).version,
      ).toBe(0);
    }));
});

afterAll(async () => {
  await pool.end();
});
