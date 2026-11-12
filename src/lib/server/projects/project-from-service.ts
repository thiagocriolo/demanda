import { and, asc, eq } from "drizzle-orm";
import type {
  Project,
  ProjectFromServiceInput,
  ProjectInstallmentInput,
} from "../../projects/types";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import { requireWorkspacePermissionForUpdate } from "../authorization/workspace-context";
import type { Database } from "../db/database";
import { serviceResponsibles, serviceTags, tags } from "../db/schema";
import { ProjectRelationsInvalidError } from "./errors";
import {
  createProjectInTransaction,
  translateProjectConstraint,
  validateAndLockServices,
} from "./project-commands";
import { workspaceIdFromContext } from "./shared";
import { projectMutationSchema } from "./validation";
import { createProjectRoutinesFromServices } from "./project-routines";

function addDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addCalendarMonths(dateValue: string, months: number): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const first = new Date(Date.UTC(year!, month! - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(day!, lastDay));
  return first.toISOString().slice(0, 10);
}

function generateInstallments(
  amountCents: number,
  count: number,
  firstDueDate: string,
): ProjectInstallmentInput[] {
  if (amountCents <= 0) return [];
  const base = Math.trunc(amountCents / count);
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    dueDate: addCalendarMonths(firstDueDate, index),
    amountCents: index === count - 1 ? amountCents - base * (count - 1) : base,
    status: "pending",
  }));
}

export async function createWorkspaceProjectFromService(
  database: Database,
  context: RequestAuthorizationContext,
  input: ProjectFromServiceInput,
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
      const contractType =
        input.contractType ??
        (source.defaultContractType as "one_off" | "recurring");
      const amountCents = input.amountCents ?? source.defaultAmountCents ?? 0;
      const firstDueDate =
        input.firstDueDate === undefined
          ? contractType === "one_off" && amountCents > 0
            ? input.startDate
            : null
          : input.firstDueDate;
      const installments =
        input.installments ??
        (contractType === "one_off" && amountCents > 0
          ? generateInstallments(
              amountCents,
              source.defaultInstallmentCount,
              firstDueDate ?? input.startDate,
            )
          : []);
      const parsedEffective = projectMutationSchema.safeParse({
        name: input.name,
        businessId: input.businessId,
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
        responsibleUserIds:
          input.responsibleUserIds ??
          sourceResponsibleRows.map(({ userId }) => userId),
        contractType,
        amountCents,
        firstDueDate,
        paymentMethod: input.paymentMethod ?? source.defaultPaymentMethod ?? "",
        paymentTerms: input.paymentTerms ?? source.defaultPaymentTerms ?? "",
        financeNotes: input.financeNotes ?? source.defaultFinanceNotes ?? "",
        installments,
      });
      if (!parsedEffective.success) throw new ProjectRelationsInvalidError();
      const effective = parsedEffective.data;
      const project = await createProjectInTransaction(
        transaction,
        workspaceId,
        context.user.id,
        effective,
        source.id,
      );
      await createProjectRoutinesFromServices(
        transaction,
        workspaceId,
        {
          id: project.id,
          businessId: effective.businessId,
          startDate: effective.startDate,
          endDate: effective.endDate,
        },
        serviceIds,
        effective.responsibleUserIds[0]!,
      );
      return project;
    });
  } catch (error) {
    if (error instanceof ProjectRelationsInvalidError) throw error;
    translateProjectConstraint(error);
  }
}
