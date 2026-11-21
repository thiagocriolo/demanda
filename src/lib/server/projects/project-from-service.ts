import { and, asc, eq } from "drizzle-orm";
import type {
  Project,
  ProjectFromServiceInput,
} from "../../projects/types";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import { appendDataChangeAuditLog } from "../authorization/audit";
import type { Database } from "../db/database";
import { serviceResponsibles, serviceTags, tags } from "../db/schema";
import { ProjectRelationsInvalidError } from "./errors";
import {
  createProjectInTransaction,
  resolveContractForProjectCreate,
  translateProjectConstraint,
  validateAndLockServices,
} from "./project-commands";
import { projectMutationSchema } from "./validation";
import { createProjectRoutinesFromServices } from "./project-routines";

function addDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function createWorkspaceProjectFromService(
  database: Database,
  context: RequestAuthorizationContext,
  input: ProjectFromServiceInput,
): Promise<Project> {
  try {
    return await database.transaction(async (transaction) => {
      const contract = await resolveContractForProjectCreate(
        transaction,
        context.user.id,
        input.contractId,
      );
      const workspaceId = contract.workspaceId;
      const serviceIds = [
        input.serviceId,
        ...(input.additionalServiceIds ?? []),
      ];
      const serviceRows = await validateAndLockServices(
        transaction,
        workspaceId,
        serviceIds,
      );
      const source = serviceRows.find(({ id }) => id === input.serviceId);
      if (!source || source.archivedAt)
        throw new ProjectRelationsInvalidError();
      const sourceTagRows = await transaction
        .select({ id: tags.id, label: tags.label, archivedAt: tags.archivedAt })
        .from(serviceTags)
        .innerJoin(
          tags,
          and(
            eq(tags.workspaceId, serviceTags.workspaceId),
            eq(tags.id, serviceTags.tagId),
          ),
        )
        .where(
          and(
            eq(serviceTags.workspaceId, workspaceId),
            eq(serviceTags.serviceId, source.id),
          ),
        )
        .orderBy(asc(serviceTags.sortOrder));
      if (sourceTagRows.some(({ archivedAt }) => archivedAt)) {
        throw new ProjectRelationsInvalidError();
      }
      const sourceResponsibleRows = await transaction
        .select({ userId: serviceResponsibles.userId })
        .from(serviceResponsibles)
        .where(
          and(
            eq(serviceResponsibles.workspaceId, workspaceId),
            eq(serviceResponsibles.serviceId, source.id),
          ),
        )
        .orderBy(asc(serviceResponsibles.sortOrder));
      const parsedEffective = projectMutationSchema.safeParse({
        name: input.name,
        contractId: contract.id,
        businessId: contract.businessId,
        serviceIds,
        status: input.status ?? source.defaultStatusKey,
        startDate: input.startDate,
        endDate:
          input.endDate !== undefined
            ? input.endDate
            : source.defaultDurationDays
              ? addDays(input.startDate, source.defaultDurationDays)
              : null,
        briefing: input.briefing ?? source.defaultBriefing,
        tagLabels: input.tagLabels ?? sourceTagRows.map(({ label }) => label),
        responsibleUserIds: input.responsibleUserIds ?? [],
      });
      if (!parsedEffective.success) throw new ProjectRelationsInvalidError();
      const effective = parsedEffective.data;
      const project = await createProjectInTransaction(
        transaction,
        contract,
        context.user.id,
        effective,
        source.id,
      );
      await appendDataChangeAuditLog(transaction, {
        userId: context.user.id,
        workspaceId,
      }, {
        action: "project.created_from_service",
        targetType: "project",
        targetId: project.id,
        changes: [
          { field: "name", before: null, after: effective.name },
          { field: "status", before: null, after: effective.status },
          { field: "startDate", before: null, after: effective.startDate },
          { field: "endDate", before: null, after: effective.endDate },
        ],
        metadata: { serviceId: source.id },
      });
      const fallbackResponsibleUserId =
        effective.responsibleUserIds?.[0] ??
        sourceResponsibleRows[0]?.userId ??
        context.user.id;
      await createProjectRoutinesFromServices(
        transaction,
        workspaceId,
        {
          id: project.id,
          businessId: project.business.id,
          startDate: effective.startDate,
          endDate: effective.endDate,
        },
        serviceIds,
        fallbackResponsibleUserId,
      );
      return project;
    });
  } catch (error) {
    if (error instanceof ProjectRelationsInvalidError) throw error;
    translateProjectConstraint(error);
  }
}
