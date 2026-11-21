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
  businesses,
  contacts,
  contracts,
  deliveryTemplateSubtasks,
  deliveryTemplates,
  financialEntries,
  projects,
  serviceTaskTemplates,
  services,
  userPreferences,
  users,
  workspaceConfigurations,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "../../src/lib/server/db/schema";
import { resetAccountData } from "../../src/lib/server/settings/account-data-service";
import { getSettingsSnapshot } from "../../src/lib/server/settings/snapshot-service";
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

  it("reseta todos os dados da conta e recria um workspace pessoal vazio", () =>
    withRollback(async (transaction) => {
      const owner = await insertUser(transaction, "ResetOwner");
      const personalId = randomUUID();
      await transaction.insert(workspaces).values({
        id: personalId,
        name: "Pessoal",
        kind: "personal",
        ownerUserId: owner.id,
      });
      await transaction.insert(workspaceMembers).values({
        workspaceId: personalId,
        userId: owner.id,
        role: "owner",
      });
      const shared = await insertWorkspace(
        transaction,
        owner.id,
        "Workspace extra",
      );
      const [personal] = await transaction
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, personalId));
      if (!personal) throw new Error("Workspace pessoal nao criado.");

      const contactId = randomUUID();
      await transaction.insert(contacts).values({
        id: contactId,
        workspaceId: personal.id,
        ownerUserId: owner.id,
        name: "Contato Reset",
      });
      const businessId = randomUUID();
      await transaction.insert(businesses).values({
        id: businessId,
        workspaceId: shared.id,
        ownerUserId: owner.id,
        name: "Negocio Reset",
        categoryKey: "geral",
        stageKey: "ativo",
      });
      const contractId = randomUUID();
      await transaction.insert(contracts).values({
        id: contractId,
        workspaceId: shared.id,
        ownerUserId: owner.id,
        businessId,
        name: "Contrato Reset",
        contractType: "one_off",
        amountCents: 10000,
      });
      await transaction.insert(projects).values({
        id: randomUUID(),
        workspaceId: shared.id,
        businessId,
        contractId,
        name: "Projeto Reset",
        statusKey: "planejamento",
      });
      await transaction.insert(financialEntries).values({
        id: randomUUID(),
        workspaceId: shared.id,
        ownerUserId: owner.id,
        source: "manual",
        type: "revenue",
        mode: "one_off",
        title: "Lancamento Reset",
        amount: "100.00",
        competenceDate: "2026-11-20",
        dueDate: "2026-11-20",
        createdByUserId: owner.id,
        updatedByUserId: owner.id,
      });

      const ownerContext = context(owner, personal, "owner");
      await resetAccountData(transaction, ownerContext);
      const snapshot = await getSettingsSnapshot(transaction, ownerContext);

      expect(ownerContext.activeWorkspace?.workspace.kind).toBe("personal");
      expect(ownerContext.activeWorkspace?.workspace.id).not.toBe(personal.id);
      expect(snapshot.workspace.workspaceId).toBe(
        ownerContext.activeWorkspace?.workspace.id,
      );

      const remainingWorkspaces = await transaction
        .select()
        .from(workspaces)
        .where(eq(workspaces.ownerUserId, owner.id));
      const [remainingContacts] = await transaction
        .select({ total: count() })
        .from(contacts)
        .where(eq(contacts.ownerUserId, owner.id));
      const [remainingBusinesses] = await transaction
        .select({ total: count() })
        .from(businesses)
        .where(eq(businesses.ownerUserId, owner.id));
      const [remainingContracts] = await transaction
        .select({ total: count() })
        .from(contracts)
        .where(eq(contracts.ownerUserId, owner.id));
      const [remainingProjects] = await transaction
        .select({ total: count() })
        .from(projects)
        .where(eq(projects.workspaceId, shared.id));
      const [remainingFinance] = await transaction
        .select({ total: count() })
        .from(financialEntries)
        .where(eq(financialEntries.ownerUserId, owner.id));

      expect(remainingWorkspaces).toHaveLength(1);
      expect(remainingWorkspaces[0]?.kind).toBe("personal");
      expect(remainingContacts?.total).toBe(0);
      expect(remainingBusinesses?.total).toBe(0);
      expect(remainingContracts?.total).toBe(0);
      expect(remainingProjects?.total).toBe(0);
      expect(remainingFinance?.total).toBe(0);
    }));
});

afterAll(async () => {
  await pool.end();
});
