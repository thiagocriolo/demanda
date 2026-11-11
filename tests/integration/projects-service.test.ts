import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, asc, count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type {
  ProjectMutationInput,
  ServiceMutationInput,
} from "../../src/lib/projects/types";
import type { RequestAuthorizationContext } from "../../src/lib/server/authorization/workspace-context";
import { WorkspaceNotFoundError } from "../../src/lib/server/authorization/workspace-context";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  businesses,
  projectInstallments,
  projects,
  projectTags,
  services,
  tags,
  tasks,
  users,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "../../src/lib/server/db/schema";
import {
  archiveWorkspaceProject,
  archiveWorkspaceService,
  createWorkspaceProject,
  createWorkspaceProjectFromService,
  createWorkspaceService,
  getWorkspaceProject,
  getWorkspaceProjectOptions,
  getWorkspaceService,
  InstitutionalProjectProtectedError,
  listWorkspaceProjects,
  listWorkspaceServices,
  ProjectNotFoundError,
  ProjectRelationsInvalidError,
  ServiceNameConflictError,
  ServiceNotFoundError,
  updateWorkspaceProject,
  updateWorkspaceService,
} from "../../src/lib/server/projects/service";
import {
  archiveWorkspaceTask,
  TaskVersionConflictError,
} from "../../src/lib/server/tasks/service";
import {
  projectListQuerySchema,
  serviceListQuerySchema,
} from "../../src/lib/server/projects/validation";

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

async function insertUser(
  database: Database,
  label: string,
): Promise<typeof users.$inferSelect> {
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
): Promise<typeof workspaces.$inferSelect> {
  const id = randomUUID();
  await database.insert(workspaces).values({ id, name, kind: "shared", ownerUserId });
  await database.insert(workspaceMembers).values({ workspaceId: id, userId: ownerUserId, role: "owner" });
  const [workspace] = await database.select().from(workspaces).where(eq(workspaces.id, id));
  if (!workspace) throw new Error("Workspace de teste nao criado.");
  return workspace;
}

async function insertBusiness(
  database: Database,
  workspaceId: string,
  name: string,
  ownerUserId?: string,
): Promise<typeof businesses.$inferSelect> {
  const [workspace] = await database
    .select({ ownerUserId: workspaces.ownerUserId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const resolvedOwnerUserId = ownerUserId ?? workspace?.ownerUserId;
  if (!resolvedOwnerUserId) throw new Error("Owner do negocio nao encontrado.");
  const id = randomUUID();
  await database.insert(businesses).values({
      id,
      workspaceId,
      ownerUserId: resolvedOwnerUserId,
      name,
      categoryKey: "cliente",
      stageKey: "ativo",
    });
  const [business] = await database.select().from(businesses).where(eq(businesses.id, id));
  if (!business) throw new Error("Negocio de teste nao criado.");
  return business;
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

function serviceInput(
  name: string,
  responsibleUserIds: string[],
  overrides: Partial<ServiceMutationInput> = {},
): ServiceMutationInput {
  return {
    name,
    description: `Descricao de ${name}`,
    icon: "palette",
    color: "violet",
    defaultStatus: "planejamento",
    defaultDurationDays: 30,
    defaultBriefing: `Briefing de ${name}`,
    tagLabels: ["Branding", "Estrategia"],
    responsibleUserIds,
    defaultContractType: "one_off",
    defaultAmountCents: 10_001,
    defaultInstallmentCount: 3,
    defaultPaymentMethod: "Pix",
    defaultPaymentTerms: "Tres parcelas",
    defaultFinanceNotes: "Snapshot financeiro",
    ...overrides,
  };
}

function projectInput(
  name: string,
  businessId: string,
  responsibleUserIds: string[],
  serviceIds: string[] = [],
  overrides: Partial<ProjectMutationInput> = {},
): ProjectMutationInput {
  return {
    name,
    businessId,
    serviceIds,
    status: "planejamento",
    startDate: "2028-01-31",
    endDate: "2028-03-31",
    briefing: `Briefing de ${name}`,
    tagLabels: ["Branding", "Site"],
    responsibleUserIds,
    contractType: "one_off",
    amountCents: 10_001,
    firstDueDate: "2028-01-31",
    paymentMethod: "Pix",
    paymentTerms: "Duas parcelas",
    financeNotes: "Nota",
    installments: [
      {
        number: 1,
        dueDate: "2028-01-31",
        amountCents: 5_000,
        status: "pending",
      },
      {
        number: 2,
        dueDate: "2028-02-29",
        amountCents: 5_001,
        status: "pending",
      },
    ],
    ...overrides,
  };
}

describe("BE-07: servicos e projetos", () => {
  afterAll(() => pool.end());

  it("oculta o projeto institucional vazio, expoe no seletor e protege seu ciclo de vida", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "InstitutionOwner");
      const workspace = await insertWorkspace(
        database,
        owner.id,
        "Projetos institucionais",
      );
      const business = await insertBusiness(
        database,
        workspace.id,
        "Negocio institucional",
      );
      const ownerContext = context(owner, workspace, "owner");
      const institutionalId = randomUUID();
      await database
        .insert(projects)
        .values({
          id: institutionalId,
          workspaceId: workspace.id,
          businessId: business.id,
          isInstitutional: true,
          name: "Institucional",
          statusKey: "execucao",
          startDate: "2026-07-17",
        });
      const [institutional] = await database
        .select()
        .from(projects)
        .where(eq(projects.id, institutionalId));
      if (!institutional) throw new Error("Projeto institucional nao criado.");

      const regularList = await listWorkspaceProjects(
        database,
        ownerContext,
        projectListQuerySchema.parse({}),
      );
      expect(regularList.items).toEqual([]);
      expect(regularList.total).toBe(0);
      expect(regularList.facets.all).toBe(0);

      const selectorList = await listWorkspaceProjects(
        database,
        ownerContext,
        projectListQuerySchema.parse({
          includeEmptyInstitutional: "true",
        }),
      );
      expect(selectorList.items).toHaveLength(1);
      expect(selectorList.items[0]).toMatchObject({
        id: institutional.id,
        isInstitutional: true,
        name: "Institucional",
        business: { id: business.id },
      });

      await database.insert(tasks).values({
        workspaceId: workspace.id,
        projectId: institutional.id,
        businessId: business.id,
        name: "Tarefa institucional",
        priorityKey: "media",
        statusKey: "fila",
      });

      const populatedList = await listWorkspaceProjects(
        database,
        ownerContext,
        projectListQuerySchema.parse({}),
      );
      expect(populatedList.items.map(({ id }) => id)).toEqual([
        institutional.id,
      ]);
      expect(populatedList.total).toBe(1);
      expect(populatedList.facets.all).toBe(1);

      await expect(
        updateWorkspaceProject(
          database,
          ownerContext,
          institutional.id,
          projectInput("Tentativa de alteracao", business.id, [owner.id]),
        ),
      ).rejects.toBeInstanceOf(InstitutionalProjectProtectedError);
      await expect(
        archiveWorkspaceProject(database, ownerContext, institutional.id),
      ).rejects.toBeInstanceOf(InstitutionalProjectProtectedError);
    });
  });

  it("compartilha CRUD, busca, filtros, options e arquivamento no workspace", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "ProjectOwner");
      const member = await insertUser(database, "ProjectMember");
      const workspace = await insertWorkspace(
        database,
        owner.id,
        "Projetos compartilhados",
      );
      await database.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: member.id,
        role: "member",
      });
      const ownerContext = context(owner, workspace, "owner");
      const memberContext = context(member, workspace, "member");
      const business = await insertBusiness(
        database,
        workspace.id,
        "Cliente Aurora",
        member.id,
      );
      const service = await createWorkspaceService(
        database,
        ownerContext,
        serviceInput("Identidade visual", [owner.id, member.id]),
      );
      expect(service.tags.map(({ name }) => name)).toEqual([
        "Branding",
        "Estrategia",
      ]);
      expect(service.responsibles.map(({ userId }) => userId)).toEqual([
        owner.id,
        member.id,
      ]);
      const serviceList = await listWorkspaceServices(
        database,
        memberContext,
        serviceListQuerySchema.parse({ query: "Identidade" }),
      );
      expect(serviceList).toMatchObject({
        workspaceId: workspace.id,
        total: 1,
        facets: { all: 1, archived: 0 },
      });
      expect(serviceList.items[0]?.id).toBe(service.id);

      const created = await createWorkspaceProject(
        database,
        memberContext,
        projectInput("Projeto Aurora", business.id, [member.id], [service.id]),
      );
      expect(created).toMatchObject({
        workspaceId: workspace.id,
        name: "Projeto Aurora",
        business: { id: business.id, name: "Cliente Aurora" },
        amountCents: 10_001,
      });
      expect(created.services.map(({ id }) => id)).toEqual([service.id]);
      expect(created.tags.map(({ name }) => name)).toEqual([
        "Branding",
        "Site",
      ]);
      expect(
        created.installments.map(({ amountCents }) => amountCents),
      ).toEqual([5_000, 5_001]);
      expect(
        (await getWorkspaceProject(database, ownerContext, created.id)).id,
      ).toBe(created.id);

      for (const search of ["Aurora", "Identidade", "Site", "ProjectMember"]) {
        const result = await listWorkspaceProjects(
          database,
          ownerContext,
          projectListQuerySchema.parse({ query: search }),
        );
        expect(result.items.map(({ id }) => id)).toEqual([created.id]);
      }
      const filtered = await listWorkspaceProjects(
        database,
        memberContext,
        projectListQuerySchema.parse({
          serviceId: service.id,
          businessId: business.id,
          responsibleUserId: member.id,
          startFrom: "2028-01-01",
          endTo: "2028-12-31",
        }),
      );
      expect(filtered).toMatchObject({ total: 1, totalPages: 1 });
      expect(filtered.facets.statuses).toEqual({ planejamento: 1 });
      expect(filtered.facets.services).toEqual({ [service.id]: 1 });

      const options = await getWorkspaceProjectOptions(database, memberContext);
      expect(options).toMatchObject({
        workspaceId: workspace.id,
        workspaceName: "Projetos compartilhados",
      });
      expect(options.members.map(({ userId }) => userId).sort()).toEqual(
        [owner.id, member.id].sort(),
      );
      expect(options.services.map(({ id }) => id)).toContain(service.id);
      expect(options.tags.every(({ archivedAt }) => archivedAt === null)).toBe(
        true,
      );

      const alternateWorkspace = await insertWorkspace(
        database,
        member.id,
        "Projetos alternativos",
      );
      await expect(
        getWorkspaceProjectOptions(
          database,
          memberContext,
          alternateWorkspace.id,
        ),
      ).resolves.toMatchObject({
        workspaceId: alternateWorkspace.id,
        workspaceName: "Projetos alternativos",
      });

      const updated = await updateWorkspaceProject(
        database,
        ownerContext,
        created.id,
        projectInput(
          "Projeto Aurora atualizado",
          business.id,
          [owner.id, member.id],
          [service.id],
          { status: "execucao", tagLabels: ["Nova tag"] },
        ),
      );
      expect(updated).toMatchObject({
        name: "Projeto Aurora atualizado",
        status: "execucao",
      });
      expect(updated.responsibles.map(({ userId }) => userId)).toEqual([
        owner.id,
        member.id,
      ]);

      await archiveWorkspaceProject(database, memberContext, created.id);
      await archiveWorkspaceProject(database, memberContext, created.id);
      expect(
        (
          await listWorkspaceProjects(
            database,
            ownerContext,
            projectListQuerySchema.parse({}),
          )
        ).total,
      ).toBe(0);
      const archivedProjects = await listWorkspaceProjects(
        database,
        ownerContext,
        projectListQuerySchema.parse({ archived: "only" }),
      );
      expect(archivedProjects.items.map(({ id }) => id)).toEqual([created.id]);
      expect(archivedProjects.facets.services).toEqual({ [service.id]: 1 });

      await archiveWorkspaceService(database, ownerContext, service.id);
      await archiveWorkspaceService(database, ownerContext, service.id);
      expect(
        (await getWorkspaceService(database, memberContext, service.id))
          .archivedAt,
      ).not.toBeNull();
      expect(
        (
          await listWorkspaceProjects(
            database,
            ownerContext,
            projectListQuerySchema.parse({ archived: "only" }),
          )
        ).items[0]?.services[0]?.archivedAt,
      ).not.toBeNull();
    });
  });

  it("impede anti-IDOR e todos os vinculos entre workspaces", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "TenantProjectA");
      const outsider = await insertUser(database, "TenantProjectB");
      const workspace = await insertWorkspace(database, owner.id, "Tenant A");
      const foreignWorkspace = await insertWorkspace(
        database,
        outsider.id,
        "Tenant B",
      );
      const ownerContext = context(owner, workspace, "owner");
      const outsiderContext = context(outsider, foreignWorkspace, "owner");
      const business = await insertBusiness(database, workspace.id, "Local");
      const foreignBusiness = await insertBusiness(
        database,
        foreignWorkspace.id,
        "Estrangeiro",
      );
      const localService = await createWorkspaceService(
        database,
        ownerContext,
        serviceInput("Servico local", [owner.id]),
      );
      const foreignService = await createWorkspaceService(
        database,
        outsiderContext,
        serviceInput("Servico estrangeiro", [outsider.id]),
      );
      const project = await createWorkspaceProject(
        database,
        ownerContext,
        projectInput("Privado", business.id, [owner.id], [localService.id]),
      );

      await expect(
        getWorkspaceProjectOptions(database, outsiderContext, workspace.id),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);

      const projectMessages: string[] = [];
      for (const id of [project.id, randomUUID()]) {
        try {
          await getWorkspaceProject(database, outsiderContext, id);
        } catch (cause) {
          expect(cause).toBeInstanceOf(ProjectNotFoundError);
          projectMessages.push((cause as Error).message);
        }
      }
      expect(projectMessages[0]).toBe(projectMessages[1]);
      const serviceMessages: string[] = [];
      for (const id of [localService.id, randomUUID()]) {
        try {
          await getWorkspaceService(database, outsiderContext, id);
        } catch (cause) {
          expect(cause).toBeInstanceOf(ServiceNotFoundError);
          serviceMessages.push((cause as Error).message);
        }
      }
      expect(serviceMessages[0]).toBe(serviceMessages[1]);
      await expect(
        updateWorkspaceProject(
          database,
          outsiderContext,
          project.id,
          projectInput(
            "Tentativa",
            foreignBusiness.id,
            [outsider.id],
            [foreignService.id],
          ),
        ),
      ).rejects.toBeInstanceOf(ProjectNotFoundError);
      await expect(
        archiveWorkspaceProject(database, outsiderContext, project.id),
      ).rejects.toBeInstanceOf(ProjectNotFoundError);

      const before = await database
        .select({ value: count() })
        .from(projects)
        .where(eq(projects.workspaceId, workspace.id));
      const invalidInputs = [
        projectInput("Negocio externo", foreignBusiness.id, [owner.id]),
        projectInput(
          "Servico externo",
          business.id,
          [owner.id],
          [foreignService.id],
        ),
        projectInput("Membro externo", business.id, [outsider.id]),
      ];
      for (const input of invalidInputs) {
        await expect(
          createWorkspaceProject(database, ownerContext, input),
        ).rejects.toBeInstanceOf(ProjectRelationsInvalidError);
      }
      const after = await database
        .select({ value: count() })
        .from(projects)
        .where(eq(projects.workspaceId, workspace.id));
      expect(after[0]?.value).toBe(before[0]?.value);
    });
  });

  it("cria pelo servico atomicamente e preserva o snapshot dos defaults", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "TemplateOwner");
      const member = await insertUser(database, "TemplateMember");
      const workspace = await insertWorkspace(
        database,
        owner.id,
        "Modelos atomicos",
      );
      await database.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: member.id,
        role: "member",
      });
      const ownerContext = context(owner, workspace, "owner");
      const business = await insertBusiness(database, workspace.id, "Modelo");
      const source = await createWorkspaceService(
        database,
        ownerContext,
        serviceInput("Modelo principal", [owner.id], {
          defaultStatus: "execucao",
          defaultBriefing: "Snapshot original",
          tagLabels: ["Original"],
        }),
      );
      const additional = await createWorkspaceService(
        database,
        ownerContext,
        serviceInput("Complementar", [member.id], {
          tagLabels: ["Complementar"],
        }),
      );

      const created = await createWorkspaceProjectFromService(
        database,
        ownerContext,
        {
          serviceId: source.id,
          additionalServiceIds: [additional.id],
          name: "Projeto materializado",
          businessId: business.id,
          startDate: "2028-01-31",
        },
      );
      expect(created).toMatchObject({
        sourceServiceId: source.id,
        status: "execucao",
        briefing: "Snapshot original",
        endDate: "2028-03-01",
        amountCents: 10_001,
        firstDueDate: "2028-01-31",
      });
      expect(created.services.map(({ id }) => id)).toEqual([
        source.id,
        additional.id,
      ]);
      expect(created.tags.map(({ name }) => name)).toEqual(["Original"]);
      expect(created.responsibles.map(({ userId }) => userId)).toEqual([
        owner.id,
      ]);
      expect(
        created.installments.map(({ dueDate, amountCents }) => ({
          dueDate,
          amountCents,
        })),
      ).toEqual([
        { dueDate: "2028-01-31", amountCents: 3_333 },
        { dueDate: "2028-02-29", amountCents: 3_333 },
        { dueDate: "2028-03-31", amountCents: 3_335 },
      ]);

      await updateWorkspaceService(
        database,
        ownerContext,
        source.id,
        serviceInput("Modelo alterado", [member.id], {
          defaultStatus: "concluido",
          defaultBriefing: "Novo briefing",
          tagLabels: ["Nova tag"],
          defaultAmountCents: 999,
        }),
      );
      const snapshot = await getWorkspaceProject(
        database,
        ownerContext,
        created.id,
      );
      expect(snapshot).toMatchObject({
        status: "execucao",
        briefing: "Snapshot original",
        amountCents: 10_001,
      });
      expect(snapshot.tags.map(({ name }) => name)).toEqual(["Original"]);
      expect(snapshot.responsibles.map(({ userId }) => userId)).toEqual([
        owner.id,
      ]);
    });
  });

  it("reverte tags e filhos quando servico ou projeto falha", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "RollbackOwner");
      const workspace = await insertWorkspace(
        database,
        owner.id,
        "Rollback integral",
      );
      const ownerContext = context(owner, workspace, "owner");
      const business = await insertBusiness(database, workspace.id, "Rollback");
      await createWorkspaceService(
        database,
        ownerContext,
        serviceInput("Nome unico", [owner.id]),
      );
      const beforeTags = await database
        .select({ value: count() })
        .from(tags)
        .where(eq(tags.workspaceId, workspace.id));
      await expect(
        createWorkspaceService(
          database,
          ownerContext,
          serviceInput("Nome unico", [owner.id], {
            tagLabels: ["Deve reverter"],
          }),
        ),
      ).rejects.toBeInstanceOf(ServiceNameConflictError);
      const afterServiceTags = await database
        .select({ value: count() })
        .from(tags)
        .where(eq(tags.workspaceId, workspace.id));
      expect(afterServiceTags[0]?.value).toBe(beforeTags[0]?.value);

      const invalid = projectInput(
        "Projeto deve reverter",
        business.id,
        [owner.id],
        [],
        {
          tagLabels: ["Projeto rollback"],
          installments: [
            {
              number: 1,
              dueDate: "2028-01-31",
              amountCents: 5_000,
              status: "pending",
            },
            {
              number: 1,
              dueDate: "2028-02-29",
              amountCents: 5_001,
              status: "pending",
            },
          ],
        },
      );
      await expect(
        createWorkspaceProject(database, ownerContext, invalid),
      ).rejects.toBeTruthy();
      expect(
        (
          await database
            .select({ value: count() })
            .from(projects)
            .where(
              and(
                eq(projects.workspaceId, workspace.id),
                eq(projects.name, "Projeto deve reverter"),
              ),
            )
        )[0]?.value,
      ).toBe(0);
      expect(
        (
          await database
            .select({ value: count() })
            .from(tags)
            .where(
              and(
                eq(tags.workspaceId, workspace.id),
                eq(tags.key, "projeto_rollback"),
              ),
            )
        )[0]?.value,
      ).toBe(0);
    });
  });

  it("retém pais arquivados existentes, rejeita novos e reautoriza membership", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "HistoryOwner");
      const member = await insertUser(database, "HistoryMember");
      const workspace = await insertWorkspace(
        database,
        owner.id,
        "Historico relacional",
      );
      await database.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: member.id,
        role: "member",
      });
      const ownerContext = context(owner, workspace, "owner");
      const memberContext = context(member, workspace, "member");
      const business = await insertBusiness(
        database,
        workspace.id,
        "Historico",
      );
      const retained = await createWorkspaceService(
        database,
        ownerContext,
        serviceInput("Retido", [owner.id]),
      );
      const newlyArchived = await createWorkspaceService(
        database,
        ownerContext,
        serviceInput("Novo arquivado", [owner.id]),
      );
      const project = await createWorkspaceProject(
        database,
        ownerContext,
        projectInput("Com historico", business.id, [owner.id], [retained.id], {
          tagLabels: ["Historica"],
        }),
      );
      const [historicalTag] = await database
        .select({ id: projectTags.tagId })
        .from(projectTags)
        .where(eq(projectTags.projectId, project.id));
      await database
        .update(businesses)
        .set({ archivedAt: new Date() })
        .where(eq(businesses.id, business.id));
      await database
        .update(services)
        .set({ archivedAt: new Date() })
        .where(eq(services.id, retained.id));
      await database
        .update(services)
        .set({ archivedAt: new Date() })
        .where(eq(services.id, newlyArchived.id));
      if (historicalTag) {
        await database
          .update(tags)
          .set({ archivedAt: new Date() })
          .where(eq(tags.id, historicalTag.id));
      }

      const retainedUpdate = await updateWorkspaceProject(
        database,
        ownerContext,
        project.id,
        projectInput(
          "Historico atualizado",
          business.id,
          [owner.id],
          [retained.id],
          {
            tagLabels: ["Historica"],
          },
        ),
      );
      expect(retainedUpdate.name).toBe("Historico atualizado");
      await expect(
        updateWorkspaceProject(
          database,
          ownerContext,
          project.id,
          projectInput(
            "Nao deve persistir",
            business.id,
            [owner.id],
            [retained.id, newlyArchived.id],
            { tagLabels: ["Historica"] },
          ),
        ),
      ).rejects.toBeInstanceOf(ProjectRelationsInvalidError);
      expect(
        (await getWorkspaceProject(database, ownerContext, project.id)).name,
      ).toBe("Historico atualizado");

      await database
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspace.id),
            eq(workspaceMembers.userId, member.id),
          ),
        );
      await expect(
        listWorkspaceProjects(
          database,
          memberContext,
          projectListQuerySchema.parse({}),
        ),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    });
  });

  it("sincroniza tarefas quando o projeto muda de negócio", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "ProjectTaskOwner");
      const workspace = await insertWorkspace(
        database,
        owner.id,
        "Projeto com tarefas",
      );
      const businessA = await insertBusiness(database, workspace.id, "A");
      const businessB = await insertBusiness(database, workspace.id, "B");
      const ownerContext = context(owner, workspace, "owner");
      const project = await createWorkspaceProject(
        database,
        ownerContext,
        projectInput("Projeto movível", businessA.id, [owner.id]),
      );
      const oldTaskTimestamp = new Date("2020-01-01T00:00:00.000Z");
      await database
        .insert(tasks)
        .values([
          {
            id: randomUUID(),
            workspaceId: workspace.id,
            projectId: project.id,
            businessId: businessA.id,
            name: "Tarefa ativa",
            priorityKey: "alta",
            statusKey: "producao",
            boardOrder: { status: 2, business: 5, project: 7 },
            version: 3,
            createdAt: oldTaskTimestamp,
            updatedAt: oldTaskTimestamp,
          },
          {
            id: randomUUID(),
            workspaceId: workspace.id,
            projectId: project.id,
            businessId: businessA.id,
            name: "Tarefa arquivada",
            priorityKey: "baixa",
            statusKey: "fila",
            boardOrder: { priority: 1, business: 8 },
            version: 9,
            createdAt: oldTaskTimestamp,
            updatedAt: oldTaskTimestamp,
            archivedAt: new Date(),
          },
        ]);

      const updatedProject = await updateWorkspaceProject(
        database,
        ownerContext,
        project.id,
        projectInput("Projeto movido", businessB.id, [owner.id]),
      );
      expect(updatedProject.business.id).toBe(businessB.id);

      const changedTasks = await database
        .select()
        .from(tasks)
        .where(eq(tasks.projectId, project.id))
        .orderBy(asc(tasks.name));
      expect(changedTasks).toHaveLength(2);
      const archivedTask = changedTasks[0]!;
      const activeTask = changedTasks[1]!;
      expect(activeTask).toMatchObject({
        businessId: businessB.id,
        version: 4,
      });
      expect(activeTask.boardOrder).toEqual({ status: 2, project: 7 });
      expect(archivedTask).toMatchObject({
        businessId: businessB.id,
        version: 10,
      });
      expect(archivedTask.boardOrder).toEqual({ priority: 1 });
      expect(activeTask.updatedAt.getTime()).toBeGreaterThan(
        oldTaskTimestamp.getTime(),
      );
      await expect(
        archiveWorkspaceTask(database, ownerContext, activeTask.id, 3),
      ).rejects.toBeInstanceOf(TaskVersionConflictError);

      await updateWorkspaceProject(
        database,
        ownerContext,
        project.id,
        projectInput("Mesmo negócio", businessB.id, [owner.id]),
      );
      const unchangedTasks = await database
        .select()
        .from(tasks)
        .where(eq(tasks.projectId, project.id))
        .orderBy(asc(tasks.name));
      expect(unchangedTasks).toEqual(changedTasks);
    });
  });

  it("permite negocio privado entre workspaces, expoe so o nome e restringe novos vinculos ao dono", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "PrivateBusinessOwner");
      const member = await insertUser(database, "PrivateBusinessMember");
      const sharedWorkspace = await insertWorkspace(
        database,
        owner.id,
        "Projetos com negocio privado",
      );
      const ownerWorkspace = await insertWorkspace(
        database,
        owner.id,
        "Registros privados do owner",
      );
      const memberWorkspace = await insertWorkspace(
        database,
        member.id,
        "Registros privados do membro",
      );
      await database.insert(workspaceMembers).values({
        workspaceId: sharedWorkspace.id,
        userId: member.id,
        role: "member",
      });
      const ownerContext = context(owner, sharedWorkspace, "owner");
      const memberContext = context(member, sharedWorkspace, "member");
      const ownerBusiness = await insertBusiness(
        database,
        ownerWorkspace.id,
        "Cliente privado do owner",
        owner.id,
      );
      const memberBusiness = await insertBusiness(
        database,
        memberWorkspace.id,
        "Cliente privado do membro",
        member.id,
      );

      const project = await createWorkspaceProject(
        database,
        ownerContext,
        projectInput("Projeto compartilhado", ownerBusiness.id, [owner.id]),
      );
      expect(project.business).toMatchObject({
        id: ownerBusiness.id,
        name: "Cliente privado do owner",
        archivedAt: null,
      });
      expect(
        (await getWorkspaceProject(database, memberContext, project.id))
          .business,
      ).toEqual({
        id: ownerBusiness.id,
        name: "Cliente privado do owner",
        archivedAt: null,
      });
      await expect(
        createWorkspaceProject(
          database,
          memberContext,
          projectInput("Vinculo sem ser dono", ownerBusiness.id, [member.id]),
        ),
      ).rejects.toBeInstanceOf(ProjectRelationsInvalidError);
      await expect(
        updateWorkspaceProject(
          database,
          ownerContext,
          project.id,
          projectInput("Troca sem ser dono", memberBusiness.id, [owner.id]),
        ),
      ).rejects.toBeInstanceOf(ProjectRelationsInvalidError);

      await database
        .update(businesses)
        .set({ archivedAt: new Date() })
        .where(eq(businesses.id, ownerBusiness.id));
      const retainedByMember = await updateWorkspaceProject(
        database,
        memberContext,
        project.id,
        projectInput("Mantem vinculo privado", ownerBusiness.id, [member.id]),
      );
      expect(retainedByMember.business.archivedAt).toBeNull();
      expect(
        (await getWorkspaceProject(database, ownerContext, project.id)).business
          .archivedAt,
      ).not.toBeNull();
    });
  });
});
