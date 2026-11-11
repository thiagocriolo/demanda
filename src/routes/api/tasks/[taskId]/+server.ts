import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwTaskHttpError } from "$lib/server/tasks/http";
import {
  archiveWorkspaceTask,
  deleteWorkspaceTask,
  getWorkspaceTask,
  TaskNotFoundError,
  updateWorkspaceTask,
} from "$lib/server/tasks/service";
import {
  taskArchiveQuerySchema,
  taskUpdateSchema,
} from "$lib/server/tasks/validation";

const identifierSchema = z.string().uuid();

function taskId(value: string | undefined): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throwTaskHttpError(new TaskNotFoundError());
  return parsed.data;
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(
      await getWorkspaceTask(getDatabase(), context, taskId(params.taskId)),
    );
  } catch (cause) {
    throwTaskHttpError(cause);
  }
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = taskUpdateSchema.safeParse(await readRequestInput(request));
  if (!parsed.success) error(400, "Dados da tarefa inválidos.");

  try {
    return json(
      await updateWorkspaceTask(
        getDatabase(),
        context,
        taskId(params.taskId),
        parsed.data,
      ),
    );
  } catch (cause) {
    throwTaskHttpError(cause);
  }
};

export const PATCH: RequestHandler = async ({ locals, params, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = taskArchiveQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Versão da tarefa inválida.");

  try {
    return json(
      await archiveWorkspaceTask(
        getDatabase(),
        context,
        taskId(params.taskId),
        parsed.data.version,
      ),
    );
  } catch (cause) {
    throwTaskHttpError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = taskArchiveQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "VersÃ£o da tarefa invÃ¡lida.");

  try {
    await deleteWorkspaceTask(
      getDatabase(),
      context,
      taskId(params.taskId),
      parsed.data.version,
    );
    return json({ deleted: true as const });
  } catch (cause) {
    throwTaskHttpError(cause);
  }
};
