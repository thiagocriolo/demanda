import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  INSTITUTIONAL_PROJECT_NAME,
  INSTITUTIONAL_PROJECT_STATUS,
} from "../../projects/institutional";
import {
  summarizeServicePackage,
  type ContractServicePackageSelection,
  type ServiceDeliveryRecurrenceType,
  type ServiceDeliveryRecurrenceUnit,
  type ServicePackage,
  type ServicePackageDelivery,
  type ServicePackageList,
  type ServicePackageMutationInput,
  type ServicePackageProject,
  type ServicePackageTask,
} from "../../service-packages/types";
import type { Database } from "../db/database";
import { escapeLikeMySql } from "../db/helpers";
import {
  deliveries,
  deliveryResponsibles,
  deliveryTasks,
  projectDeliveryRoutines,
  projectResponsibles,
  projects,
  servicePackageDeliveries,
  servicePackageProjects,
  servicePackages,
  servicePackageTasks,
  workspaceMembers,
} from "../db/schema";
import { materializeProjectRoutinesInTransaction } from "../projects/project-routines";
import { normalizeRecurrenceRule } from "./validation";

export class ServicePackageNotFoundError extends Error {
  constructor(message = "Serviço não encontrado.") {
    super(message);
    this.name = "ServicePackageNotFoundError";
  }
}

export class ServicePackageValidationError extends Error {
  constructor(message = "Dados do serviço inválidos.") {
    super(message);
    this.name = "ServicePackageValidationError";
  }
}

type ReadableDatabase = Pick<Database, "select">;
type WritableDatabase = Pick<Database, "select" | "insert" | "update" | "delete">;

function parseRecurrenceDays(raw: string): number[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is number => typeof value === "number");
  } catch {
    return [];
  }
}

function addDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function hydratePackages(
  database: ReadableDatabase,
  rows: (typeof servicePackages.$inferSelect)[],
): Promise<ServicePackage[]> {
  if (!rows.length) return [];
  const packageIds = rows.map((row) => row.id);
  const [projectRows, deliveryRows, taskRows] = await Promise.all([
    database
      .select()
      .from(servicePackageProjects)
      .where(inArray(servicePackageProjects.servicePackageId, packageIds))
      .orderBy(
        desc(servicePackageProjects.isInstitutional),
        asc(servicePackageProjects.sortOrder),
        asc(servicePackageProjects.id),
      ),
    database
      .select()
      .from(servicePackageDeliveries)
      .where(inArray(servicePackageDeliveries.servicePackageId, packageIds))
      .orderBy(
        asc(servicePackageDeliveries.sortOrder),
        asc(servicePackageDeliveries.id),
      ),
    database
      .select()
      .from(servicePackageTasks)
      .where(inArray(servicePackageTasks.servicePackageId, packageIds))
      .orderBy(asc(servicePackageTasks.sortOrder), asc(servicePackageTasks.id)),
  ]);

  const tasksByDelivery = new Map<string, ServicePackageTask[]>();
  for (const row of taskRows) {
    const list = tasksByDelivery.get(row.serviceDeliveryId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      durationMinutes: row.durationMinutes,
      sortOrder: row.sortOrder,
    });
    tasksByDelivery.set(row.serviceDeliveryId, list);
  }

  const deliveriesByProject = new Map<string, ServicePackageDelivery[]>();
  for (const row of deliveryRows) {
    const list = deliveriesByProject.get(row.serviceProjectId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      description: row.description,
      priority: row.priorityKey,
      recurrenceType: row.recurrenceType as ServiceDeliveryRecurrenceType,
      recurrenceUnit: (row.recurrenceUnit ?? null) as ServiceDeliveryRecurrenceUnit | null,
      recurrenceDays: parseRecurrenceDays(row.recurrenceDays),
      sortOrder: row.sortOrder,
      tasks: tasksByDelivery.get(row.id) ?? [],
    });
    deliveriesByProject.set(row.serviceProjectId, list);
  }

  const projectsByPackage = new Map<string, ServicePackageProject[]>();
  for (const row of projectRows) {
    const list = projectsByPackage.get(row.servicePackageId) ?? [];
    list.push({
      id: row.id,
      isInstitutional: row.isInstitutional,
      name: row.isInstitutional ? INSTITUTIONAL_PROJECT_NAME : row.name,
      briefing: row.briefing,
      projectType: row.projectType === "recurring" ? "recurring" : "one_off",
      durationDays: row.durationDays ?? null,
      sortOrder: row.sortOrder,
      deliveries: deliveriesByProject.get(row.id) ?? [],
    });
    projectsByPackage.set(row.servicePackageId, list);
  }

  return rows.map((row) => {
    const packageProjects = projectsByPackage.get(row.id) ?? [];
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      name: row.name,
      description: row.description,
      icon: row.icon,
      color: row.color,
      amountCents: row.amountCents,
      durationMonths: row.durationMonths ?? null,
      installmentCount: row.installmentCount,
      paymentMethod: row.paymentMethod ?? "",
      paymentTerms: row.paymentTerms ?? "",
      sortOrder: row.sortOrder,
      projects: packageProjects,
      metrics: summarizeServicePackage(packageProjects, row.amountCents),
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

async function writePackageChildren(
  database: WritableDatabase,
  packageId: string,
  projectsInput: ServicePackageMutationInput["projects"],
  now: Date,
): Promise<void> {
  await database
    .delete(servicePackageProjects)
    .where(eq(servicePackageProjects.servicePackageId, packageId));

  const projectRows: (typeof servicePackageProjects.$inferInsert)[] = [];
  const deliveryRows: (typeof servicePackageDeliveries.$inferInsert)[] = [];
  const taskRows: (typeof servicePackageTasks.$inferInsert)[] = [];

  for (const [projectIndex, project] of projectsInput.entries()) {
    const projectId = project.id || randomUUID();
    projectRows.push({
      id: projectId,
      servicePackageId: packageId,
      isInstitutional: project.isInstitutional,
      name: project.isInstitutional ? INSTITUTIONAL_PROJECT_NAME : project.name,
      briefing: project.briefing,
      projectType: project.projectType,
      durationDays: project.durationDays,
      sortOrder: projectIndex,
      createdAt: now,
      updatedAt: now,
    });

    for (const [deliveryIndex, delivery] of project.deliveries.entries()) {
      const deliveryId = delivery.id || randomUUID();
      deliveryRows.push({
        id: deliveryId,
        servicePackageId: packageId,
        serviceProjectId: projectId,
        name: delivery.name,
        description: delivery.description,
        priorityKey: delivery.priority,
        recurrenceType: delivery.recurrenceType,
        recurrenceUnit: delivery.recurrenceUnit,
        recurrenceDays: JSON.stringify(delivery.recurrenceDays),
        sortOrder: deliveryIndex,
        createdAt: now,
        updatedAt: now,
      });

      for (const [taskIndex, task] of delivery.tasks.entries()) {
        taskRows.push({
          id: task.id || randomUUID(),
          servicePackageId: packageId,
          serviceDeliveryId: deliveryId,
          name: task.name,
          durationMinutes: task.durationMinutes,
          sortOrder: taskIndex,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  if (projectRows.length) {
    await database.insert(servicePackageProjects).values(projectRows);
  }
  if (deliveryRows.length) {
    await database.insert(servicePackageDeliveries).values(deliveryRows);
  }
  if (taskRows.length) {
    await database.insert(servicePackageTasks).values(taskRows);
  }
}

export async function listUserServicePackages(
  database: Database,
  ownerUserId: string,
  options: { archived: "exclude" | "include" | "only"; query: string },
): Promise<ServicePackageList> {
  const conditions = [eq(servicePackages.ownerUserId, ownerUserId)];
  if (options.archived === "exclude") {
    conditions.push(isNull(servicePackages.archivedAt));
  } else if (options.archived === "only") {
    conditions.push(isNotNull(servicePackages.archivedAt));
  }
  if (options.query) {
    const pattern = `%${escapeLikeMySql(options.query)}%`;
    conditions.push(
      sql`(${servicePackages.name} like ${pattern} escape '!' or ${servicePackages.description} like ${pattern} escape '!')`,
    );
  }

  const [rows, allOwnerRows] = await Promise.all([
    database
      .select()
      .from(servicePackages)
      .where(and(...conditions))
      .orderBy(desc(servicePackages.updatedAt), desc(servicePackages.id)),
    database
      .select({ archivedAt: servicePackages.archivedAt })
      .from(servicePackages)
      .where(eq(servicePackages.ownerUserId, ownerUserId)),
  ]);

  const items = await hydratePackages(database, rows);
  const active = allOwnerRows.filter((row) => !row.archivedAt).length;
  const archived = allOwnerRows.length - active;

  return {
    items,
    facets: { active, archived },
  };
}

export async function getUserServicePackage(
  database: Database,
  ownerUserId: string,
  packageId: string,
): Promise<ServicePackage> {
  const [row] = await database
    .select()
    .from(servicePackages)
    .where(
      and(
        eq(servicePackages.id, packageId),
        eq(servicePackages.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);
  if (!row) throw new ServicePackageNotFoundError();
  const [hydrated] = await hydratePackages(database, [row]);
  if (!hydrated) throw new ServicePackageNotFoundError();
  return hydrated;
}

export async function createUserServicePackage(
  database: Database,
  ownerUserId: string,
  input: ServicePackageMutationInput,
): Promise<ServicePackage> {
  const packageId = randomUUID();
  const now = new Date();

  await database.transaction(async (transaction) => {
    await transaction.insert(servicePackages).values({
      id: packageId,
      ownerUserId,
      name: input.name,
      description: input.description,
      icon: input.icon,
      color: input.color,
      amountCents: input.amountCents,
      durationMonths: input.durationMonths,
      installmentCount: input.installmentCount,
      paymentMethod: input.paymentMethod || null,
      paymentTerms: input.paymentTerms || null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
    await writePackageChildren(transaction, packageId, input.projects, now);
  });

  return getUserServicePackage(database, ownerUserId, packageId);
}

export async function updateUserServicePackage(
  database: Database,
  ownerUserId: string,
  packageId: string,
  input: ServicePackageMutationInput,
): Promise<ServicePackage> {
  const now = new Date();

  await database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: servicePackages.id })
      .from(servicePackages)
      .where(
        and(
          eq(servicePackages.id, packageId),
          eq(servicePackages.ownerUserId, ownerUserId),
        ),
      )
      .limit(1)
      .for("update");
    if (!existing) throw new ServicePackageNotFoundError();

    await transaction
      .update(servicePackages)
      .set({
        name: input.name,
        description: input.description,
        icon: input.icon,
        color: input.color,
        amountCents: input.amountCents,
        durationMonths: input.durationMonths,
        installmentCount: input.installmentCount,
        paymentMethod: input.paymentMethod || null,
        paymentTerms: input.paymentTerms || null,
        updatedAt: now,
      })
      .where(eq(servicePackages.id, packageId));

    await writePackageChildren(transaction, packageId, input.projects, now);
  });

  return getUserServicePackage(database, ownerUserId, packageId);
}

export async function duplicateUserServicePackage(
  database: Database,
  ownerUserId: string,
  packageId: string,
): Promise<ServicePackage> {
  const source = await getUserServicePackage(database, ownerUserId, packageId);
  const copyName = `${source.name} (cópia)`.slice(0, 140);

  return createUserServicePackage(database, ownerUserId, {
    name: copyName,
    description: source.description,
    icon: source.icon,
    color: source.color,
    amountCents: source.amountCents,
    durationMonths: source.durationMonths,
    installmentCount: source.installmentCount,
    paymentMethod: source.paymentMethod,
    paymentTerms: source.paymentTerms,
    projects: source.projects.map((project) => ({
      isInstitutional: project.isInstitutional,
      name: project.name,
      briefing: project.briefing,
      projectType: project.projectType,
      durationDays: project.durationDays,
      deliveries: project.deliveries.map((delivery) => ({
        name: delivery.name,
        description: delivery.description,
        priority: delivery.priority,
        recurrenceType: delivery.recurrenceType,
        recurrenceUnit: delivery.recurrenceUnit,
        recurrenceDays: [...delivery.recurrenceDays],
        tasks: delivery.tasks.map((task) => ({
          name: task.name,
          durationMinutes: task.durationMinutes,
        })),
      })),
    })),
  });
}

export async function setUserServicePackageArchived(
  database: Database,
  ownerUserId: string,
  packageId: string,
  archived: boolean,
): Promise<ServicePackage> {
  const now = new Date();
  const [existing] = await database
    .select({ id: servicePackages.id })
    .from(servicePackages)
    .where(
      and(
        eq(servicePackages.id, packageId),
        eq(servicePackages.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);
  if (!existing) throw new ServicePackageNotFoundError();

  await database
    .update(servicePackages)
    .set({
      archivedAt: archived ? now : null,
      updatedAt: now,
    })
    .where(eq(servicePackages.id, packageId));

  return getUserServicePackage(database, ownerUserId, packageId);
}

export async function deleteUserServicePackage(
  database: Database,
  ownerUserId: string,
  packageId: string,
): Promise<void> {
  const [existing] = await database
    .select({ id: servicePackages.id })
    .from(servicePackages)
    .where(
      and(
        eq(servicePackages.id, packageId),
        eq(servicePackages.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);
  if (!existing) throw new ServicePackageNotFoundError();

  await database
    .delete(servicePackages)
    .where(
      and(
        eq(servicePackages.id, packageId),
        eq(servicePackages.ownerUserId, ownerUserId),
      ),
    );
}

/**
 * Instantiates a ServicePackage (projects, deliveries, routines, and tasks)
 * inside an active contract creation transaction.
 * Returns the number of created projects for the contract response payload.
 */
export async function instantiateServicePackageForContractInTransaction(
  transaction: WritableDatabase,
  params: {
    ownerUserId: string;
    workspaceId: string;
    contract: {
      id: string;
      businessId: string;
      startDate: string | null;
      endDate: string | null;
    };
    selection: ContractServicePackageSelection;
  },
): Promise<{ createdProjectCount: number }> {
  const { ownerUserId, workspaceId, contract, selection } = params;

  const [pkgRow] = await transaction
    .select()
    .from(servicePackages)
    .where(
      and(
        eq(servicePackages.id, selection.packageId),
        eq(servicePackages.ownerUserId, ownerUserId),
        isNull(servicePackages.archivedAt),
      ),
    )
    .limit(1);
  if (!pkgRow) {
    throw new ServicePackageNotFoundError(
      "Selecione um serviço ativo da sua biblioteca.",
    );
  }

  const [pkg] = await hydratePackages(transaction, [pkgRow]);
  if (!pkg) {
    throw new ServicePackageNotFoundError();
  }

  const responsibleIdsToVerify = new Set<string>([selection.responsibleUserId]);
  if (selection.projectResponsibleOverrides) {
    for (const userId of Object.values(selection.projectResponsibleOverrides)) {
      responsibleIdsToVerify.add(userId);
    }
  }
  if (selection.customProjects) {
    for (const project of selection.customProjects) {
      if (project.responsibleUserId) {
        responsibleIdsToVerify.add(project.responsibleUserId);
      }
    }
  }
  const responsibleList = Array.from(responsibleIdsToVerify);
  const memberRows = await transaction
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        inArray(workspaceMembers.userId, responsibleList),
      ),
    );
  if (memberRows.length !== responsibleList.length) {
    throw new ServicePackageValidationError(
      "O responsável selecionado precisa pertencer ao workspace do contrato.",
    );
  }

  type ResolvedTemplateProject = {
    id: string;
    isInstitutional: boolean;
    name: string;
    briefing: string;
    projectType: "one_off" | "recurring";
    durationDays: number | null;
    responsibleUserId: string;
    deliveries: Array<{
      name: string;
      description: string;
      priority: string;
      recurrenceType: ServiceDeliveryRecurrenceType;
      recurrenceUnit: ServiceDeliveryRecurrenceUnit | null;
      recurrenceDays: number[];
      tasks: Array<{ name: string; durationMinutes: number }>;
    }>;
  };

  let selectedProjects: ResolvedTemplateProject[];

  if (selection.customProjects) {
    selectedProjects = selection.customProjects
      .filter((project) => !(project.isInstitutional && project.deliveries.length === 0))
      .map((project) => ({
        id: project.id || randomUUID(),
        isInstitutional: project.isInstitutional,
        name: project.isInstitutional
          ? INSTITUTIONAL_PROJECT_NAME
          : project.name.trim(),
        briefing: project.briefing.trim(),
        projectType: project.projectType,
        durationDays: project.durationDays ?? null,
        responsibleUserId:
          project.responsibleUserId ?? selection.responsibleUserId,
        deliveries: project.deliveries.map((delivery) => {
          const rec = normalizeRecurrenceRule(
            project.projectType,
            delivery.recurrenceType,
            delivery.recurrenceUnit,
            delivery.recurrenceDays,
          );
          return {
            name: delivery.name.trim(),
            description: delivery.description.trim(),
            priority: delivery.priority || "normal",
            recurrenceType: rec.recurrenceType,
            recurrenceUnit: rec.recurrenceUnit,
            recurrenceDays: rec.recurrenceDays,
            tasks: delivery.tasks.map((task) => ({
              name: task.name.trim(),
              durationMinutes: task.durationMinutes,
            })),
          };
        }),
      }));
  } else {
    const includedSet = selection.includedProjectIds
      ? new Set(selection.includedProjectIds)
      : null;

    selectedProjects = pkg.projects
      .filter((project) => {
        if (includedSet && !includedSet.has(project.id)) return false;
        // Empty institutional project does not need to be materialized eagerly;
        // the system creates it on demand when a direct delivery is added later.
        if (project.isInstitutional && project.deliveries.length === 0) {
          return false;
        }
        return true;
      })
      .map((project) => ({
        id: project.id,
        isInstitutional: project.isInstitutional,
        name: project.name,
        briefing: project.briefing,
        projectType: project.projectType,
        durationDays: project.durationDays,
        responsibleUserId:
          selection.projectResponsibleOverrides?.[project.id] ??
          selection.responsibleUserId,
        deliveries: project.deliveries.map((delivery) => ({
          name: delivery.name,
          description: delivery.description,
          priority: delivery.priority,
          recurrenceType: delivery.recurrenceType,
          recurrenceUnit: delivery.recurrenceUnit,
          recurrenceDays: delivery.recurrenceDays,
          tasks: delivery.tasks.map((task) => ({
            name: task.name,
            durationMinutes: task.durationMinutes,
          })),
        })),
      }));
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const baseStartDate = contract.startDate ?? today;
  let createdProjectCount = 0;

  for (const templateProject of selectedProjects) {
    const projectId = randomUUID();
    const projectResponsibleId = templateProject.responsibleUserId;
    const isRecurringProject = templateProject.projectType === "recurring";
    const projectStartDate = contract.startDate ?? baseStartDate;
    const projectEndDate = templateProject.isInstitutional
      ? isRecurringProject
        ? null
        : contract.endDate
      : templateProject.durationDays
        ? addDays(projectStartDate, templateProject.durationDays)
        : contract.endDate;

    await transaction.insert(projects).values({
      id: projectId,
      workspaceId,
      businessId: contract.businessId,
      contractId: contract.id,
      isInstitutional: templateProject.isInstitutional,
      isActive: true,
      name: templateProject.isInstitutional
        ? INSTITUTIONAL_PROJECT_NAME
        : templateProject.name,
      statusKey: templateProject.isInstitutional
        ? INSTITUTIONAL_PROJECT_STATUS
        : "planejamento",
      briefing: templateProject.briefing,
      startDate: projectStartDate,
      endDate: projectEndDate,
      engagementType: "personal",
      contractType: templateProject.projectType,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
    createdProjectCount += 1;

    await transaction.insert(projectResponsibles).values({
      workspaceId,
      projectId,
      userId: projectResponsibleId,
      sortOrder: 0,
    });

    let hasRoutinesToMaterialize = false;

    for (const [deliveryIndex, templateDelivery] of templateProject.deliveries.entries()) {
      const shouldCreateRoutine =
        isRecurringProject && templateDelivery.recurrenceType !== "one_off";

      if (shouldCreateRoutine) {
        const routineId = randomUUID();
        const tasksSnapshot = templateDelivery.tasks.map((task) => ({
          name: task.name,
          durationMinutes: task.durationMinutes,
          status: "pendente",
        }));

        await transaction.insert(projectDeliveryRoutines).values({
          id: routineId,
          workspaceId,
          projectId,
          sourceServiceDeliveryTemplateId: null,
          name: templateDelivery.name,
          description: templateDelivery.description,
          categoryKey: null,
          priorityKey: templateDelivery.priority || "normal",
          statusKey: "planejamento",
          responsibleUserId: projectResponsibleId,
          tagIds: "[]",
          tasks: JSON.stringify(tasksSnapshot),
          recurrenceType: templateDelivery.recurrenceType,
          recurrenceUnit: templateDelivery.recurrenceUnit,
          recurrenceDays: JSON.stringify(templateDelivery.recurrenceDays),
          createdAt: now,
          updatedAt: now,
        });

        if (templateDelivery.recurrenceType === "daily") {
          const deliveryId = randomUUID();
          await transaction.insert(deliveries).values({
            id: deliveryId,
            workspaceId,
            projectId,
            businessId: contract.businessId,
            projectRoutineId: routineId,
            routineOccurrenceDate: projectStartDate,
            name: templateDelivery.name,
            description: templateDelivery.description,
            categoryKey: null,
            priorityKey: templateDelivery.priority || "normal",
            statusKey: "planejamento",
            dueDate: templateProject.isInstitutional ? null : projectStartDate,
            engagementType: "personal",
            sortOrder: deliveryIndex,
            boardOrder: {},
            createdAt: now,
            updatedAt: now,
          });
          await transaction.insert(deliveryResponsibles).values({
            workspaceId,
            deliveryId,
            userId: projectResponsibleId,
            sortOrder: 0,
          });
          const effectiveTasks = tasksSnapshot.length
            ? tasksSnapshot
            : [
                {
                  name: "Concluir entrega",
                  durationMinutes: 60,
                  status: "pendente",
                },
              ];
          await transaction.insert(deliveryTasks).values(
            effectiveTasks.map((task, taskIndex) => ({
              workspaceId,
              deliveryId,
              name: task.name,
              durationMinutes: task.durationMinutes,
              statusKey: task.status,
              sortOrder: taskIndex,
              createdAt: now,
              updatedAt: now,
            })),
          );
        } else {
          hasRoutinesToMaterialize = true;
        }
        continue;
      }

      const deliveryId = randomUUID();
      await transaction.insert(deliveries).values({
        id: deliveryId,
        workspaceId,
        projectId,
        businessId: contract.businessId,
        name: templateDelivery.name,
        description: templateDelivery.description,
        categoryKey: null,
        priorityKey: templateDelivery.priority || "normal",
        statusKey: "planejamento",
        dueDate: templateProject.isInstitutional
          ? contract.endDate
          : projectEndDate,
        engagementType: "personal",
        sortOrder: deliveryIndex,
        boardOrder: {},
        createdAt: now,
        updatedAt: now,
      });

      await transaction.insert(deliveryResponsibles).values({
        workspaceId,
        deliveryId,
        userId: projectResponsibleId,
        sortOrder: 0,
      });

      if (templateDelivery.tasks.length) {
        await transaction.insert(deliveryTasks).values(
          templateDelivery.tasks.map((task, taskIndex) => ({
            workspaceId,
            deliveryId,
            name: task.name,
            durationMinutes: task.durationMinutes,
            statusKey: "pendente",
            sortOrder: taskIndex,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }
    }

    if (hasRoutinesToMaterialize) {
      await materializeProjectRoutinesInTransaction(transaction, workspaceId, {
        id: projectId,
        businessId: contract.businessId,
        startDate: projectStartDate,
        endDate: projectEndDate,
      });
    }
  }

  return { createdProjectCount };
}
