import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwTaskHttpError } from "$lib/server/tasks/http";
import {
  createWorkspaceTask,
  listWorkspaceTasks,
} from "$lib/server/tasks/service";
import {
  taskCreateSchema,
  taskListQuerySchema,
} from "$lib/server/tasks/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = taskListQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Filtros de tarefas inválidos.");

  try {
    return json(await listWorkspaceTasks(getDatabase(), context, parsed.data));
  } catch (cause) {
    throwTaskHttpError(cause);
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = taskCreateSchema.safeParse(await readRequestInput(request));
  if (!parsed.success) error(400, "Dados da tarefa inválidos.");

  try {
    return json(
      await createWorkspaceTask(getDatabase(), context, parsed.data),
      { status: 201 },
    );
  } catch (cause) {
    throwTaskHttpError(cause);
  }
};
