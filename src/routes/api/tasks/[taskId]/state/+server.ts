import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwTaskHttpError } from "$lib/server/tasks/http";
import {
  setWorkspaceTaskState,
  TaskNotFoundError,
} from "$lib/server/tasks/service";
import { taskStateSchema } from "$lib/server/tasks/validation";

const identifierSchema = z.string().uuid();

function taskId(value: string | undefined): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throwTaskHttpError(new TaskNotFoundError());
  return parsed.data;
}

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = taskStateSchema.safeParse(await readRequestInput(request));
  if (!parsed.success) error(400, "Estado da tarefa inválido.");

  try {
    return json(
      await setWorkspaceTaskState(
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
