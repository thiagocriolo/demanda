import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { BusinessMutationInput } from "../../src/lib/businesses/types";
import type { RequestAuthorizationContext } from "../../src/lib/server/authorization/workspace-context";
import {
  archiveWorkspaceBusiness,
  BusinessNotFoundError,
  BusinessResponsiblesInvalidError,
  createWorkspaceBusiness,
  getWorkspaceBusiness,
  listBusinessResponsibleUsers,
  listWorkspaceBusinesses,
  updateWorkspaceBusiness,
} from "../../src/lib/server/businesses/service";
import { businessListQuerySchema } from "../../src/lib/server/businesses/validation";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  businesses,
  contacts,
  projects,
  userConnections,
  users,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
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
  kind: "personal" | "shared" = "personal",
) {
  const id = randomUUID();
  await database.insert(workspaces).values({ id, name, kind, ownerUserId });
  await database.insert(workspaceMembers).values({ workspaceId: id, userId: ownerUserId, role: "owner" });
  const [workspace] = await database.select().from(workspaces).where(eq(workspaces.id, id));
  if (!workspace) throw new Error("Workspace de teste nao criado.");
  return workspace;
}

async function insertContact(
  database: Database,
  ownerUserId: string,
  workspaceId: string,
  name: string,
  archived = false,
) {
  const id = randomUUID();
  await database.insert(contacts).values({
      id,
      workspaceId,
      ownerUserId,
      name,
      contactType: "person",
      status: "active",
      profession: "Estrategista",
      archivedAt: archived ? new Date() : null,
    });
  const [contact] = await database.select().from(contacts).where(eq(contacts.id, id));
  if (!contact) throw new Error("Contato de teste nao criado.");
  return contact;
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

function input(
  name: string,
  responsibleContactIds: string[],
  category = "negocio",
  stage = "negociacao",
  note = `Resumo de ${name}`,
): BusinessMutationInput {
  return {
    name,
    category,
    stage,
    responsibleContactIds,
    notes: [{ body: note }],
  };
}

function query(values: Record<string, string> = {}) {
  return businessListQuerySchema.parse(values);
}

describe("BE-06: servico privado de negocios", () => {
  afterAll(() => pool.end());

  it("mantem CRUD, busca, filtros e facets privados e independentes do workspace ativo", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "BusinessOwner");
      const collaborator = await insertUser(database, "BusinessCollaborator");
      const ownerPersonal = await insertWorkspace(
        database,
        owner.id,
        "Pessoal owner",
      );
      const collaboratorPersonal = await insertWorkspace(
        database,
        collaborator.id,
        "Pessoal collaborator",
      );
      const shared = await insertWorkspace(
        database,
        owner.id,
        "Workspace compartilhado",
        "shared",
      );
      await database.insert(workspaceMembers).values({
        workspaceId: shared.id,
        userId: collaborator.id,
        role: "member",
      });

      const ana = await insertContact(
        database,
        owner.id,
        ownerPersonal.id,
        "Ana Cliente",
      );
      const zuleica = await insertContact(
        database,
        owner.id,
        ownerPersonal.id,
        "Zuleica Cliente",
      );
      const collaboratorContact = await insertContact(
        database,
        collaborator.id,
        collaboratorPersonal.id,
        "Contato do colaborador",
      );
      const ownerContext = context(owner, shared, "owner");
      const collaboratorContext = context(collaborator, shared, "member");

      const alpha = await createWorkspaceBusiness(database, ownerContext, {
        ...input("Alpha", [zuleica.id, ana.id], "marca_pessoal"),
        notes: [{ body: "Briefing ultravioleta" }, { body: "Historico" }],
      });
      await createWorkspaceBusiness(
        database,
        ownerContext,
        input("Beta", [ana.id], "negocio", "ativo"),
      );
      await createWorkspaceBusiness(
        database,
        ownerContext,
        input("Gama", [ana.id]),
      );
      const privateCollaborator = await createWorkspaceBusiness(
        database,
        collaboratorContext,
        input("Somente colaborador", [collaboratorContact.id]),
      );

      expect(alpha).toMatchObject({
        workspaceId: ownerPersonal.id,
        ownerUserId: owner.id,
      });
      const institutionalProjects = await database
        .select()
        .from(projects)
        .where(eq(projects.businessId, alpha.id));
      expect(institutionalProjects).toHaveLength(1);
      expect(institutionalProjects[0]).toMatchObject({
        workspaceId: ownerPersonal.id,
        businessId: alpha.id,
        isInstitutional: true,
        name: "Institucional",
        statusKey: "execucao",
        archivedAt: null,
      });
      expect(privateCollaborator).toMatchObject({
        workspaceId: collaboratorPersonal.id,
        ownerUserId: collaborator.id,
      });
      expect(
        (await getWorkspaceBusiness(database, ownerContext, alpha.id)).name,
      ).toBe("Alpha");
      await expect(
        getWorkspaceBusiness(database, collaboratorContext, alpha.id),
      ).rejects.toBeInstanceOf(BusinessNotFoundError);

      const firstPage = await listWorkspaceBusinesses(
        database,
        ownerContext,
        query({ page: "1", pageSize: "2", orderBy: "name_asc" }),
      );
      expect(firstPage).toMatchObject({
        workspaceId: ownerPersonal.id,
        ownerUserId: owner.id,
        total: 3,
        totalPages: 2,
      });
      expect(firstPage.items.map(({ name }) => name)).toEqual([
        "Alpha",
        "Beta",
      ]);
      expect(firstPage.facets).toEqual({
        all: 3,
        archived: 0,
        stages: { negociacao: 2, ativo: 1 },
        categories: { marca_pessoal: 1, negocio: 2 },
      });
      expect(
        (
          await listWorkspaceBusinesses(
            database,
            collaboratorContext,
            query({ archived: "include" }),
          )
        ).items.map(({ id }) => id),
      ).toEqual([privateCollaborator.id]);

      for (const search of ["Zuleica", "ultravioleta"]) {
        const result = await listWorkspaceBusinesses(
          database,
          ownerContext,
          query({ query: search }),
        );
        expect(result.items.map(({ id }) => id)).toEqual([alpha.id]);
      }

      const updated = await updateWorkspaceBusiness(
        database,
        ownerContext,
        alpha.id,
        input("Alpha Atualizado", [ana.id, zuleica.id], "outro", "contratacao"),
      );
      expect(updated).toMatchObject({
        id: alpha.id,
        name: "Alpha Atualizado",
        category: "outro",
        stage: "contratacao",
        ownerUserId: owner.id,
      });
      expect(updated.responsibles.map(({ contactId }) => contactId)).toEqual([
        ana.id,
        zuleica.id,
      ]);

      await archiveWorkspaceBusiness(database, ownerContext, alpha.id);
      await archiveWorkspaceBusiness(database, ownerContext, alpha.id);
      expect(
        (await listWorkspaceBusinesses(database, ownerContext, query())).total,
      ).toBe(2);
      expect(
        (
          await listWorkspaceBusinesses(
            database,
            ownerContext,
            query({ archived: "only" }),
          )
        ).items.map(({ id }) => id),
      ).toEqual([alpha.id]);
    });
  });

  it("nao distingue negocio de outro usuario de UUID inexistente em nenhum mutation", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "BusinessTenantA");
      const outsider = await insertUser(database, "BusinessTenantB");
      const ownerPersonal = await insertWorkspace(
        database,
        owner.id,
        "Tenant A",
      );
      const outsiderPersonal = await insertWorkspace(
        database,
        outsider.id,
        "Tenant B",
      );
      const localContact = await insertContact(
        database,
        owner.id,
        ownerPersonal.id,
        "Contato A",
      );
      const outsiderContact = await insertContact(
        database,
        outsider.id,
        outsiderPersonal.id,
        "Contato B",
      );
      const ownerContext = context(owner, ownerPersonal, "owner");
      const outsiderContext = context(outsider, outsiderPersonal, "owner");
      const created = await createWorkspaceBusiness(
        database,
        ownerContext,
        input("Privado", [localContact.id]),
      );

      const messages: string[] = [];
      for (const id of [created.id, randomUUID()]) {
        try {
          await getWorkspaceBusiness(database, outsiderContext, id);
        } catch (cause) {
          expect(cause).toBeInstanceOf(BusinessNotFoundError);
          messages.push((cause as Error).message);
        }
      }
      expect(messages[0]).toBe(messages[1]);
      await expect(
        updateWorkspaceBusiness(
          database,
          outsiderContext,
          created.id,
          input("Tentativa", [outsiderContact.id]),
        ),
      ).rejects.toBeInstanceOf(BusinessNotFoundError);
      await expect(
        archiveWorkspaceBusiness(database, outsiderContext, created.id),
      ).rejects.toBeInstanceOf(BusinessNotFoundError);
      expect(
        (
          await listWorkspaceBusinesses(
            database,
            outsiderContext,
            query({ archived: "include" }),
          )
        ).total,
      ).toBe(0);
      expect(
        (await getWorkspaceBusiness(database, ownerContext, created.id)).name,
      ).toBe("Privado");
    });
  });

  it("aceita apenas contatos do mesmo owner e faz rollback integral", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "ResponsibleOwner");
      const outsider = await insertUser(database, "ResponsibleOutsider");
      const personal = await insertWorkspace(database, owner.id, "Pessoal");
      await insertWorkspace(database, outsider.id, "Pessoal outsider");
      const active = await insertContact(
        database,
        owner.id,
        personal.id,
        "Ativo",
      );
      const archived = await insertContact(
        database,
        owner.id,
        personal.id,
        "Arquivado",
        true,
      );
      // Mesmo workspace interno, mas owner diferente: simula tentativa de IDOR.
      const foreignOwner = await insertContact(
        database,
        outsider.id,
        personal.id,
        "Estrangeiro",
      );
      const ownerContext = context(owner, personal, "owner");

      for (const invalidId of [archived.id, foreignOwner.id]) {
        await expect(
          createWorkspaceBusiness(
            database,
            ownerContext,
            input("Invalido", [invalidId]),
          ),
        ).rejects.toBeInstanceOf(BusinessResponsiblesInvalidError);
      }

      const before = await database.select({ value: count() }).from(businesses);
      await expect(
        createWorkspaceBusiness(database, ownerContext, {
          ...input("Deve reverter", [active.id]),
          notes: [{ body: "   " }],
        }),
      ).rejects.toBeTruthy();
      const after = await database.select({ value: count() }).from(businesses);
      expect(after[0]?.value).toBe(before[0]?.value);
    });
  });

  it("aceita o proprio usuario e conexoes do ciclo como responsaveis", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "CycleOwner");
      const connected = await insertUser(database, "CycleConnected");
      const outsider = await insertUser(database, "CycleOutsider");
      const personal = await insertWorkspace(database, owner.id, "Pessoal");
      const contact = await insertContact(
        database,
        owner.id,
        personal.id,
        "Contato cadastrado",
      );
      const [userAId, userBId] = [owner.id, connected.id].sort();
      await database.insert(userConnections).values({
        userAId,
        userBId,
        manualConnectedAt: new Date(),
      });
      const ownerContext = context(owner, personal, "owner");

      const candidates = await listBusinessResponsibleUsers(
        database,
        ownerContext,
      );
      expect(candidates.map(({ id }) => id)).toEqual([owner.id, connected.id]);
      expect(candidates[0]?.current).toBe(true);

      const created = await createWorkspaceBusiness(database, ownerContext, {
        ...input("Misto", [contact.id]),
        responsibleUserIds: [owner.id, connected.id],
      });
      expect(
        created.responsibles.map((responsible) => [
          responsible.kind,
          responsible.kind === "user"
            ? responsible.userId
            : responsible.contactId,
        ]),
      ).toEqual([
        ["contact", contact.id],
        ["user", owner.id],
        ["user", connected.id],
      ]);

      const byUser = await listWorkspaceBusinesses(
        database,
        ownerContext,
        query({ query: connected.username }),
      );
      expect(byUser.items.map(({ id }) => id)).toEqual([created.id]);

      await expect(
        createWorkspaceBusiness(database, ownerContext, {
          ...input("Usuario externo", []),
          responsibleUserIds: [outsider.id],
        }),
      ).rejects.toBeInstanceOf(BusinessResponsiblesInvalidError);
    });
  });

  it("continua listando os mesmos negocios apos trocar workspace ou perder membership", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "IndependentOwner");
      const workspaceOwner = await insertUser(database, "SharedWorkspaceOwner");
      const personal = await insertWorkspace(database, owner.id, "Pessoal");
      const shared = await insertWorkspace(
        database,
        workspaceOwner.id,
        "Compartilhado",
        "shared",
      );
      await database.insert(workspaceMembers).values({
        workspaceId: shared.id,
        userId: owner.id,
        role: "member",
      });
      const contact = await insertContact(
        database,
        owner.id,
        personal.id,
        "Responsavel",
      );
      const personalContext = context(owner, personal, "owner");
      const sharedContext = context(owner, shared, "member");
      const created = await createWorkspaceBusiness(
        database,
        sharedContext,
        input("Independente", [contact.id]),
      );

      const personalList = await listWorkspaceBusinesses(
        database,
        personalContext,
        query(),
      );
      await database
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, shared.id),
            eq(workspaceMembers.userId, owner.id),
          ),
        );
      const staleSharedList = await listWorkspaceBusinesses(
        database,
        sharedContext,
        query(),
      );
      expect(personalList.items.map(({ id }) => id)).toEqual([created.id]);
      expect(staleSharedList.items.map(({ id }) => id)).toEqual([created.id]);
    });
  });
});
