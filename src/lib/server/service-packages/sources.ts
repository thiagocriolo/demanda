import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../db/database";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  deliveries,
  deliveryTasks,
  projectDeliveryRoutines,
} from "../db/schema";
import { getWorkspaceProject } from "../projects/service";
import { getWorkspaceDelivery } from "../deliveries/service";
import { realProjectBlueprint } from "../../service-packages/blueprints";
import type { ServicePackageDeliveryInput } from "../../service-packages/types";

function routineBlueprint(
  row: typeof projectDeliveryRoutines.$inferSelect,
): ServicePackageDeliveryInput {
  return {
    name: row.name,
    description: row.description,
    priority: row.priorityKey,
    recurrenceType:
      row.recurrenceType as ServicePackageDeliveryInput["recurrenceType"],
    recurrenceUnit:
      row.recurrenceUnit as ServicePackageDeliveryInput["recurrenceUnit"],
    recurrenceDays: JSON.parse(row.recurrenceDays),
    tasks: (
      JSON.parse(row.tasks) as Array<{ name: string; durationMinutes: number }>
    ).map(({ name, durationMinutes }) => ({ name, durationMinutes })),
  };
}

export async function copyRealProject(
  database: Database,
  context: RequestAuthorizationContext,
  id: string,
) {
  const project = await getWorkspaceProject(database, context, id);
  const scope = and(
    eq(deliveries.workspaceId, project.workspaceId),
    eq(deliveries.projectId, project.id),
  );
  // Recurring deliveries are represented once by their rule, rather than by every occurrence.
  const [direct, routines] = await Promise.all([
    database
      .select()
      .from(deliveries)
      .where(
        and(
          scope,
          isNull(deliveries.projectRoutineId),
          isNull(deliveries.archivedAt),
        ),
      )
      .orderBy(asc(deliveries.sortOrder), asc(deliveries.id)),
    database
      .select()
      .from(projectDeliveryRoutines)
      .where(
        and(
          eq(projectDeliveryRoutines.workspaceId, project.workspaceId),
          eq(projectDeliveryRoutines.projectId, project.id),
        ),
      )
      .orderBy(
        asc(projectDeliveryRoutines.createdAt),
        asc(projectDeliveryRoutines.id),
      ),
  ]);
  const tasks = direct.length
    ? await database
        .select()
        .from(deliveryTasks)
        .where(
          and(
            eq(deliveryTasks.workspaceId, project.workspaceId),
            inArray(
              deliveryTasks.deliveryId,
              direct.map(({ id }) => id),
            ),
          ),
        )
        .orderBy(asc(deliveryTasks.sortOrder), asc(deliveryTasks.id))
    : [];
  return realProjectBlueprint(project, [
    ...direct.map((row): ServicePackageDeliveryInput => ({
      name: row.name,
      description: row.description,
      priority: row.priorityKey,
      recurrenceType: "one_off",
      recurrenceUnit: null,
      recurrenceDays: [],
      tasks: tasks
        .filter(({ deliveryId }) => deliveryId === row.id)
        .map(({ name, durationMinutes }) => ({ name, durationMinutes })),
    })),
    ...routines.map(routineBlueprint),
  ]);
}

export async function copyRealDelivery(
  database: Database,
  context: RequestAuthorizationContext,
  id: string,
): Promise<ServicePackageDeliveryInput> {
  const delivery = await getWorkspaceDelivery(database, context, id);
  const [stored] = await database
    .select({ routineId: deliveries.projectRoutineId })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.workspaceId, delivery.workspaceId),
        eq(deliveries.id, id),
      ),
    );
  const [routine] = stored?.routineId
    ? await database
        .select()
        .from(projectDeliveryRoutines)
        .where(
          and(
            eq(projectDeliveryRoutines.workspaceId, delivery.workspaceId),
            eq(projectDeliveryRoutines.id, stored.routineId),
          ),
        )
    : [];
  const rule = routine ? routineBlueprint(routine) : undefined;
  return {
    name: delivery.name,
    description: delivery.briefing,
    priority: delivery.priority,
    recurrenceType: rule?.recurrenceType ?? "one_off",
    recurrenceUnit: rule?.recurrenceUnit ?? null,
    recurrenceDays: rule?.recurrenceDays ?? [],
    tasks: delivery.tasks.map(({ name, durationMinutes }) => ({
      name,
      durationMinutes,
    })),
  };
}
