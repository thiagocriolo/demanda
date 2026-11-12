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
import { materializeWorkspaceProjectRoutines } from "$lib/server/projects/project-routines";
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
    const database = getDatabase();
    // A materialização é idempotente: ao abrir a operação, novas ocorrências
    // entram na janela futura sem duplicar o histórico.
    await materializeWorkspaceProjectRoutines(database, context);
    return json(await listWorkspaceTasks(database, context, parsed.data));
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
