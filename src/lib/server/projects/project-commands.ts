import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Project, ProjectMutationInput } from "../../projects/types";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import { requireWorkspacePermissionForUpdate } from "../authorization/workspace-context";
import { affectedRows, type Database } from "../db/database";
import {
  businesses,
  projectInstallments,
  projectResponsibles,
  projects,
  projectServices,
  projectTags,
  services,
  tags,
  tasks,
} from "../db/schema";
import {
  InstitutionalProjectProtectedError,
  ProjectNotFoundError,
  ProjectRelationsInvalidError,
} from "./errors";
import { findScopedProjectRow, hydrateProjects } from "./project-read-model";
import {
  databaseConstraint,
  existingTagIds,
  resolveAndLockTags,
  validateAndLockMembers,
  workspaceIdFromContext,
  type ProjectDatabase,
} from "./shared";

export function translateProjectConstraint(error: unknown): never {
  const constraint = databaseConstraint(error);
  if (
    constraint?.includes("workspace_business_foreign_key") ||
    constraint?.includes("workspace_service_foreign_key") ||
    constraint?.includes("workspace_tag_foreign_key") ||
    constraint?.includes("workspace_member_foreign_key") ||
    constraint?.includes("workspace_source_service_foreign_key")
  ) {
    throw new ProjectRelationsInvalidError();
  }
  throw error;
}

async function validateAndLockBusiness(
  database: ProjectDatabase,
  businessId: string,
  actorUserId: string,
  previouslyLinkedId?: string,
): Promise<void> {
  const [row] = await database
    .select({
      id: businesses.id,
      ownerUserId: businesses.ownerUserId,
      archivedAt: businesses.archivedAt,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1)
    .for("update");
  const retainingExistingLink = row?.id === previouslyLinkedId;
  if (
    !row ||
    (!retainingExistingLink &&
      (row.ownerUserId !== actorUserId || row.archivedAt !== null))
  ) {
    throw new ProjectRelationsInvalidError();
  }
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
  await database.insert(projectResponsibles).values(
    input.responsibleUserIds.map((userId, sortOrder) => ({
      workspaceId,
      projectId,
      userId,
      sortOrder,
    })),
  );
  if (input.installments.length) {
    await database.insert(projectInstallments).values(
      input.installments.map((installment) => ({
        workspaceId,
        projectId,
        number: installment.number,
        dueDate: installment.dueDate,
        amountCents: installment.amountCents,
        statusKey: installment.status,
      })),
    );
  }
}

export async function createProjectInTransaction(
  transaction: ProjectDatabase,
  workspaceId: string,
  actorUserId: string,
  input: ProjectMutationInput,
  sourceServiceId: string | null,
): Promise<Project> {
  await validateAndLockBusiness(transaction, input.businessId, actorUserId);
  await validateAndLockServices(transaction, workspaceId, input.serviceIds);
  await validateAndLockMembers(
    transaction,
    workspaceId,
    input.responsibleUserIds,
    () => new ProjectRelationsInvalidError(),
  );
  const tagRows = await resolveAndLockTags(
    transaction,
    workspaceId,
    input.tagLabels,
    new Set(),
    () => new ProjectRelationsInvalidError(),
  );
  const id = randomUUID();
  await transaction.insert(projects).values({
    id,
    workspaceId,
    businessId: input.businessId,
    sourceServiceId,
    name: input.name,
    statusKey: input.status,
    briefing: input.briefing,
    startDate: input.startDate,
    endDate: input.endDate,
    contractType: input.contractType,
    amountCents: input.amountCents,
    firstDueDate: input.firstDueDate,
    paymentMethod: input.paymentMethod || null,
    paymentTerms: input.paymentTerms || null,
    financeNotes: input.financeNotes || null,
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
  const workspaceId = workspaceIdFromContext(context);
  try {
    return await database.transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:write",
      );
      return createProjectInTransaction(
        transaction,
        workspaceId,
        context.user.id,
        input,
        null,
      );
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
  const workspaceId = workspaceIdFromContext(context);
  try {
    return await database.transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:write",
      );
      const existing = await findScopedProjectRow(
        transaction,
        workspaceId,
        projectId,
        true,
      );
      if (!existing) throw new ProjectNotFoundError();
      if (existing.isInstitutional) {
        throw new InstitutionalProjectProtectedError();
      }
      await validateAndLockBusiness(
        transaction,
        input.businessId,
        context.user.id,
        existing.businessId,
      );
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
        input.responsibleUserIds,
        () => new ProjectRelationsInvalidError(),
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
      const businessChanged = existing.businessId !== input.businessId;
      const now = new Date();
      const updatedRows = await transaction
        .update(projects)
        .set({
          businessId: input.businessId,
          name: input.name,
          statusKey: input.status,
          briefing: input.briefing,
          startDate: input.startDate,
          endDate: input.endDate,
          contractType: input.contractType,
          amountCents: input.amountCents,
          firstDueDate: input.firstDueDate,
          paymentMethod: input.paymentMethod || null,
          paymentTerms: input.paymentTerms || null,
          financeNotes: input.financeNotes || null,
          updatedAt: now,
        })
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            eq(projects.id, projectId),
          ),
        );
      if (affectedRows(updatedRows) !== 1) throw new ProjectNotFoundError();
      const updated = {
        ...existing,
        businessId: input.businessId,
        name: input.name,
        statusKey: input.status,
        briefing: input.briefing,
        startDate: input.startDate,
        endDate: input.endDate,
        contractType: input.contractType,
        amountCents: input.amountCents,
        firstDueDate: input.firstDueDate,
        paymentMethod: input.paymentMethod || null,
        paymentTerms: input.paymentTerms || null,
        financeNotes: input.financeNotes || null,
        updatedAt: now,
      };
      if (businessChanged) {
        await transaction
          .update(tasks)
          .set({
            boardOrder: sql`json_remove(${tasks.boardOrder}, '$.business')`,
            version: sql`${tasks.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(tasks.workspaceId, workspaceId),
              eq(tasks.projectId, projectId),
            ),
          );
      }
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
  const workspaceId = workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const existing = await findScopedProjectRow(
      transaction,
      workspaceId,
      projectId,
      true,
    );
    if (!existing) throw new ProjectNotFoundError();
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
  const workspaceId = workspaceIdFromContext(context);
  await database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const existing = await findScopedProjectRow(
      transaction,
      workspaceId,
      projectId,
      true,
    );
    if (!existing) throw new ProjectNotFoundError();
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
  });
}

export async function deleteWorkspaceProject(
  database: Database,
  context: RequestAuthorizationContext,
  projectId: string,
): Promise<void> {
  const workspaceId = workspaceIdFromContext(context);
  await database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const existing = await findScopedProjectRow(
      transaction,
      workspaceId,
      projectId,
      true,
    );
    if (!existing) throw new ProjectNotFoundError();
    if (existing.isInstitutional) {
      throw new InstitutionalProjectProtectedError();
    }
    const deleted = await transaction
      .delete(projects)
      .where(
        and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)),
      );
    if (affectedRows(deleted) !== 1) throw new ProjectNotFoundError();
  });
}
