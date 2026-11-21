import { and, eq, inArray, isNull } from "drizzle-orm";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermissionForUpdate,
} from "../authorization/workspace-context";
import type { Database } from "../db/database";
import { legacyImportRecords, projects } from "../db/schema";
import { createWorkspaceTaskInTransaction } from "../tasks/service";
import {
  legacyRecordToTaskInput,
  type LegacyDeliveriesImport,
} from "./validation";

export class LegacyImportValidationError extends Error {
  readonly status = 400;

  constructor(readonly issues: string[]) {
    super(issues.join(" "));
  }
}

function nameKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("pt-BR");
}

export type LegacyImportReport = {
  imported: number;
  ignored: number;
  invalid: number;
};

/** Imports a validated legacy snapshot atomically and records every source ID. */
export async function importLegacyDeliveries(
  database: Database,
  context: RequestAuthorizationContext,
  input: LegacyDeliveriesImport,
): Promise<LegacyImportReport> {
  const workspaceId = requireActiveWorkspacePermission(
    context,
    "workspace:read",
  ).workspace.id;

  return database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const existing = input.records.length
      ? await transaction
          .select({ sourceRecordId: legacyImportRecords.sourceRecordId })
          .from(legacyImportRecords)
          .where(
            and(
              eq(legacyImportRecords.workspaceId, workspaceId),
              eq(legacyImportRecords.sourceKey, input.sourceKey),
              inArray(
                legacyImportRecords.sourceRecordId,
                input.records.map(({ sourceRecordId }) => sourceRecordId),
              ),
            ),
          )
      : [];
    const existingIds = new Set(
      existing.map(({ sourceRecordId }) => sourceRecordId),
    );
    const pending = input.records.filter(
      ({ sourceRecordId }) => !existingIds.has(sourceRecordId),
    );
    if (!pending.length) {
      return { imported: 0, ignored: input.records.length, invalid: 0 };
    }

    const projectRows = await transaction
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(
        and(eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt)),
      )
      .for("update");
    const projectsByName = new Map<string, string | null>();
    for (const project of projectRows) {
      const key = nameKey(project.name);
      projectsByName.set(key, projectsByName.has(key) ? null : project.id);
    }
    const issues = pending.flatMap((record) => {
      const projectId = projectsByName.get(nameKey(record.projectName));
      if (projectId) return [];
      return [
        projectId === null
          ? `A tarefa “${record.name}” referencia mais de um projeto “${record.projectName}”.`
          : `A tarefa “${record.name}” referencia o projeto inexistente “${record.projectName}”.`,
      ];
    });
    if (issues.length) throw new LegacyImportValidationError(issues);

    for (const record of pending) {
      const projectId = projectsByName.get(nameKey(record.projectName));
      if (!projectId)
        throw new LegacyImportValidationError(["Projeto inválido."]);
      const task = await createWorkspaceTaskInTransaction(
        transaction,
        workspaceId,
        context.user.id,
        legacyRecordToTaskInput(record, projectId, context.user.id),
      );
      await transaction.insert(legacyImportRecords).values({
        workspaceId,
        sourceKey: input.sourceKey,
        sourceRecordId: record.sourceRecordId,
        importedTaskId: task.id,
      });
    }
    return { imported: pending.length, ignored: existing.length, invalid: 0 };
  });
}
