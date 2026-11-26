import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Project, ProjectMutationInput } from "../../projects/types";
import { DELIVERY_COMPLETED_STATUS } from "../../deliveries/completion";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireWorkspacePermissionForUpdate,
  WorkspaceNotFoundError,
} from "../authorization/workspace-context";
import { affectedRows, type Database } from "../db/database";
import {
  contracts,
  projectInstallments,
  projectResponsibles,
  projects,
  projectServices,
  projectTags,
  services,
  tags,
  deliveries,
} from "../db/schema";
import {
  InstitutionalProjectProtectedError,
  ProjectFrequencyLockedError,
  ProjectNotFoundError,
  ProjectRelationsInvalidError,
} from "./errors";
import { findProjectRowById, hydrateProjects } from "./project-read-model";
import { appendDataChangeAuditLog } from "../authorization/audit";
import {
  databaseConstraint,
  existingTagIds,
  resolveAndLockTags,
  validateAndLockMembers,
  type ProjectDatabase,
} from "./shared";

export type ResolvedProjectContract = {
  id: string;
  workspaceId: string;
  businessId: string;
};

export function translateProjectConstraint(error: unknown): never {
  const constraint = databaseConstraint(error);
  if (
    constraint?.includes("workspace_business_foreign_key") ||
    constraint?.includes("workspace_contract_business_foreign_key") ||
    constraint?.includes("workspace_service_foreign_key") ||
    constraint?.includes("workspace_tag_foreign_key") ||
    constraint?.includes("workspace_member_foreign_key") ||
    constraint?.includes("workspace_source_service_foreign_key")
  ) {
    throw new ProjectRelationsInvalidError();
  }
  throw error;
}

export async function resolveContractForProjectCreate(
  transaction: ProjectDatabase,
  actorUserId: string,
  contractId: string | undefined,
): Promise<ResolvedProjectContract> {
  if (!contractId) throw new ProjectRelationsInvalidError();
  const [contract] = await transaction
    .select({
      id: contracts.id,
      workspaceId: contracts.workspaceId,
      businessId: contracts.businessId,
      archivedAt: contracts.archivedAt,
    })
    .from(contracts)
    .where(eq(contracts.id, contractId))
    .limit(1)
    .for("update");
  if (!contract || contract.archivedAt !== null) {
    throw new ProjectRelationsInvalidError();
  }
  try {
    await requireWorkspacePermissionForUpdate(
      transaction,
      actorUserId,
      contract.workspaceId,
      "workspace:write",
    );
  } catch (cause) {
    if (cause instanceof WorkspaceNotFoundError) {
      throw new ProjectRelationsInvalidError();
    }
    throw cause;
  }
  return {
    id: contract.id,
    workspaceId: contract.workspaceId,
    businessId: contract.businessId,
  };
}

async function findAuthorizedProjectForWrite(
  transaction: ProjectDatabase,
  actorUserId: string,
  projectId: string,
): Promise<typeof projects.$inferSelect> {
  const existing = await findProjectRowById(transaction, projectId, true);
  if (!existing) throw new ProjectNotFoundError();
  try {
    await requireWorkspacePermissionForUpdate(
      transaction,
      actorUserId,
      existing.workspaceId,
      "workspace:write",
    );
  } catch (cause) {
    if (cause instanceof WorkspaceNotFoundError) {
      throw new ProjectNotFoundError();
    }
    throw cause;
  }
  return existing;
}

export async function validateAndLockServices(
  database: ProjectDatabase,
  workspaceId: string,
  serviceIds: string[],
  previouslyLinked = new Set<string>(),
): Promise<(typeof services.$inferSelect)[]> {
  if (
    serviceIds.length > 20 ||
    new Set(serviceIds).size !== serviceIds.length
  ) {
    throw new ProjectRelationsInvalidError();
  }
  if (!serviceIds.length) return [];
  const rows = await database
    .select()
    .from(services)
    .where(
      and(
        eq(services.workspaceId, workspaceId),
        inArray(services.id, [...serviceIds].sort()),
      ),
    )
    .orderBy(asc(services.id))
    .for("update");
  if (
    rows.length !== serviceIds.length ||
    rows.some((row) => row.archivedAt && !previouslyLinked.has(row.id))
  ) {
    throw new ProjectRelationsInvalidError();
  }
  return rows;
}

async function insertProjectDetails(
  database: ProjectDatabase,
  workspaceId: string,
  projectId: string,
  input: ProjectMutationInput,
  tagRows: (typeof tags.$inferSelect)[],
): Promise<void> {
  if (input.serviceIds.length) {
    await database.insert(projectServices).values(
      input.serviceIds.map((serviceId, sortOrder) => ({
        workspaceId,
        projectId,
        serviceId,
        sortOrder,
      })),
    );
  }
  if (tagRows.length) {
    await database.insert(projectTags).values(
      tagRows.map((tag, sortOrder) => ({
        workspaceId,
        projectId,
        tagId: tag.id,
        sortOrder,
      })),
    );
  }
  const responsibleUserIds = input.responsibleUserIds ?? [];
  if (responsibleUserIds.length) {
    await database.insert(projectResponsibles).values(
      responsibleUserIds.map((userId, sortOrder) => ({
        workspaceId,
        projectId,
        userId,
        sortOrder,
      })),
    );
  }
  // Financial schedules belong to contracts. Projects never materialize their
  // own installments, preventing duplicate revenue in the owner's finance.
}

export async function createProjectInTransaction(
  transaction: ProjectDatabase,
  contract: ResolvedProjectContract,
  actorUserId: string,
  input: ProjectMutationInput,
  sourceServiceId: string | null,
): Promise<Project> {
  const workspaceId = contract.workspaceId;
  await validateAndLockServices(transaction, workspaceId, input.serviceIds);
  await validateAndLockMembers(
    transaction,
    workspaceId,
    input.responsibleUserIds ?? [],
    () => new ProjectRelationsInvalidError(),
    { min: 0 },
  );
  const tagRows = await resolveAndLockTags(
    transaction,
    workspaceId,
    input.tagLabels,
    new Set(),
    () => new ProjectRelationsInvalidError(),
  );
  const contractType = input.contractType ?? "one_off";
  const id = randomUUID();
  await transaction.insert(projects).values({
    id,
    workspaceId,
    businessId: contract.businessId,
    contractId: contract.id,
    sourceServiceId,
    name: input.name,
    statusKey: input.status,
    briefing: input.briefing,
    startDate: input.startDate,
    endDate: input.endDate,
    engagementType: input.engagementType ?? "personal",
    contractType,
    amountCents: 0,
    firstDueDate: null,
    paymentMethod: null,
    paymentTerms: null,
    financeNotes: null,
  });
  const [created] = await transaction
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!created) throw new Error("O projeto nao pode ser criado.");
  await insertProjectDetails(
    transaction,
    workspaceId,
    created.id,
    input,
    tagRows,
  );
  const [project] = await hydrateProjects(transaction, [created], actorUserId);
  if (!project) throw new Error("O projeto nao pode ser carregado.");
  return project;
}

export async function createWorkspaceProject(
  database: Database,
  context: RequestAuthorizationContext,
  input: ProjectMutationInput,
): Promise<Project> {
  try {
    return await database.transaction(async (transaction) => {
      const contract = await resolveContractForProjectCreate(
        transaction,
        context.user.id,
        input.contractId,
      );
      const project = await createProjectInTransaction(
        transaction,
        contract,
        context.user.id,
        input,
        null,
      );
      await appendDataChangeAuditLog(transaction, {
        userId: context.user.id,
        workspaceId: contract.workspaceId,
      }, {
        action: "project.created",
        targetType: "project",
        targetId: project.id,
        changes: [
          { field: "name", before: null, after: input.name },
          { field: "status", before: null, after: input.status },
          { field: "startDate", before: null, after: input.startDate },
          { field: "endDate", before: null, after: input.endDate },
          { field: "contractType", before: null, after: project.contractType },
        ],
      });
      return project;
    });
  } catch (error) {
    if (error instanceof ProjectRelationsInvalidError) throw error;
    translateProjectConstraint(error);
  }
}

export async function updateWorkspaceProject(
  database: Database,
  context: RequestAuthorizationContext,
  projectId: string,
  input: ProjectMutationInput,
): Promise<Project> {
  try {
    return await database.transaction(async (transaction) => {
      const existing = await findAuthorizedProjectForWrite(
        transaction,
        context.user.id,
        projectId,
      );
      const workspaceId = existing.workspaceId;
      if (existing.isInstitutional) {
        throw new InstitutionalProjectProtectedError();
      }
      const previousServices = new Set(
        (
          await transaction
            .select({ serviceId: projectServices.serviceId })
            .from(projectServices)
            .where(
              and(
                eq(projectServices.workspaceId, workspaceId),
                eq(projectServices.projectId, projectId),
              ),
            )
        ).map(({ serviceId }) => serviceId),
      );
      await validateAndLockServices(
        transaction,
        workspaceId,
        input.serviceIds,
        previousServices,
      );
      await validateAndLockMembers(
        transaction,
        workspaceId,
        input.responsibleUserIds ?? [],
        () => new ProjectRelationsInvalidError(),
        { min: 0 },
      );
      const previousTags = await existingTagIds(
        transaction,
        projectTags,
        workspaceId,
        projectId,
      );
      const tagRows = await resolveAndLockTags(
        transaction,
        workspaceId,
        input.tagLabels,
        previousTags,
        () => new ProjectRelationsInvalidError(),
      );
      // Contract, workspace and business are immutable once a project exists.
      const nextContractType = input.contractType ?? existing.contractType;
      if (nextContractType !== existing.contractType) {
        const [openDelivery] = await transaction
          .select({ id: deliveries.id })
          .from(deliveries)
          .where(
            and(
              eq(deliveries.workspaceId, workspaceId),
              eq(deliveries.projectId, projectId),
              isNull(deliveries.archivedAt),
              ne(deliveries.statusKey, DELIVERY_COMPLETED_STATUS),
            ),
          )
          .limit(1)
          .for("update");
        if (openDelivery) {
          throw new ProjectFrequencyLockedError();
        }
      }
      const now = new Date();
      const updatedRows = await transaction
        .update(projects)
        .set({
          businessId: existing.businessId,
          name: input.name,
          statusKey: input.status,
          briefing: input.briefing,
          startDate: input.startDate,
          endDate: input.endDate,
          engagementType: input.engagementType ?? "personal",
          contractType: nextContractType,
          amountCents: 0,
          firstDueDate: null,
          paymentMethod: null,
          paymentTerms: null,
          financeNotes: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            eq(projects.id, projectId),
          ),
        );
      if (affectedRows(updatedRows) !== 1) throw new ProjectNotFoundError();
      await appendDataChangeAuditLog(transaction, {
        userId: context.user.id,
        workspaceId,
      }, {
        action: "project.updated",
        targetType: "project",
        targetId: projectId,
        changes: [
          { field: "name", before: existing.name, after: input.name },
          { field: "status", before: existing.statusKey, after: input.status },
          { field: "briefing", before: existing.briefing, after: input.briefing },
          { field: "startDate", before: existing.startDate, after: input.startDate },
          { field: "endDate", before: existing.endDate, after: input.endDate },
          { field: "contractType", before: existing.contractType, after: nextContractType },
        ].filter((change) => change.before !== change.after),
      });
      const updated = {
        ...existing,
        name: input.name,
        statusKey: input.status,
        briefing: input.briefing,
        startDate: input.startDate,
        endDate: input.endDate,
        engagementType: input.engagementType ?? "personal",
        contractType: nextContractType,
        amountCents: 0,
        firstDueDate: null,
        paymentMethod: null,
        paymentTerms: null,
        financeNotes: null,
        updatedAt: now,
      };
      await transaction
        .delete(projectServices)
        .where(
          and(
            eq(projectServices.workspaceId, workspaceId),
            eq(projectServices.projectId, projectId),
          ),
        );
      await transaction
        .delete(projectTags)
        .where(
          and(
            eq(projectTags.workspaceId, workspaceId),
            eq(projectTags.projectId, projectId),
          ),
        );
      await transaction
        .delete(projectResponsibles)
        .where(
          and(
            eq(projectResponsibles.workspaceId, workspaceId),
            eq(projectResponsibles.projectId, projectId),
          ),
        );
      await transaction
        .delete(projectInstallments)
        .where(
          and(
            eq(projectInstallments.workspaceId, workspaceId),
            eq(projectInstallments.projectId, projectId),
          ),
        );
      await insertProjectDetails(
        transaction,
        workspaceId,
        projectId,
        input,
        tagRows,
      );
      const [project] = await hydrateProjects(
        transaction,
        [updated],
        context.user.id,
      );
      if (!project) throw new ProjectNotFoundError();
      return project;
    });
  } catch (error) {
    if (
      error instanceof InstitutionalProjectProtectedError ||
      error instanceof ProjectFrequencyLockedError ||
      error instanceof ProjectNotFoundError ||
      error instanceof ProjectRelationsInvalidError
    ) {
      throw error;
    }
    translateProjectConstraint(error);
  }
}

export async function setWorkspaceProjectActive(
  database: Database,
  context: RequestAuthorizationContext,
  projectId: string,
  isActive: boolean,
): Promise<Project> {
  return database.transaction(async (transaction) => {
    const existing = await findAuthorizedProjectForWrite(
      transaction,
      context.user.id,
      projectId,
    );
    const workspaceId = existing.workspaceId;
    if (existing.isInstitutional) {
      throw new InstitutionalProjectProtectedError();
    }
    const now = new Date();
    const result = await transaction
      .update(projects)
      .set({ isActive, updatedAt: now })
      .where(
        and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)),
      );
    if (affectedRows(result) !== 1) throw new ProjectNotFoundError();
    if (existing.isActive !== isActive) {
      await appendDataChangeAuditLog(transaction, {
        userId: context.user.id,
        workspaceId,
      }, {
        action: "project.activity_changed",
        targetType: "project",
        targetId: projectId,
        changes: [{ field: "isActive", before: existing.isActive, after: isActive }],
      });
    }
    const [updated] = await transaction
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!updated) throw new ProjectNotFoundError();
    const [project] = await hydrateProjects(
      transaction,
      [updated],
      context.user.id,
    );
    if (!project) throw new ProjectNotFoundError();
    return project;
  });
}

export async function archiveWorkspaceProject(
  database: Database,
  context: RequestAuthorizationContext,
  projectId: string,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const existing = await findAuthorizedProjectForWrite(
      transaction,
      context.user.id,
      projectId,
    );
    const workspaceId = existing.workspaceId;
    if (existing.isInstitutional) {
      throw new InstitutionalProjectProtectedError();
    }
    if (existing.archivedAt) return;
    const updated = await transaction
      .update(projects)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)),
      );
    if (affectedRows(updated) !== 1) throw new ProjectNotFoundError();
    await appendDataChangeAuditLog(transaction, {
      userId: context.user.id,
      workspaceId,
    }, {
      action: "project.archived",
      targetType: "project",
      targetId: projectId,
      changes: [{ field: "archivedAt", before: null, after: new Date().toISOString() }],
    });
  });
}

export async function deleteWorkspaceProject(
  database: Database,
  context: RequestAuthorizationContext,
  projectId: string,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const existing = await findAuthorizedProjectForWrite(
      transaction,
      context.user.id,
      projectId,
    );
    const workspaceId = existing.workspaceId;
    if (existing.isInstitutional) {
      throw new InstitutionalProjectProtectedError();
    }
    const deleted = await transaction
      .delete(projects)
      .where(
        and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)),
      );
    if (affectedRows(deleted) !== 1) throw new ProjectNotFoundError();
    await appendDataChangeAuditLog(transaction, {
      userId: context.user.id,
      workspaceId,
    }, {
      action: "project.deleted",
      targetType: "project",
      targetId: projectId,
      changes: [{ field: "deleted", before: false, after: true }],
    });
  });
}
