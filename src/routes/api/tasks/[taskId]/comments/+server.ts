import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwTaskHttpError } from "$lib/server/tasks/http";
import {
  createWorkspaceTaskComment,
  listWorkspaceTaskComments,
} from "$lib/server/tasks/comments";

const idSchema = z.string().uuid();
const commentSchema = z
  .object({ body: z.string().trim().min(1).max(4_000) })
  .strict();

function taskId(value: string | undefined): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) error(404, "Tarefa não encontrada.");
  return parsed.data;
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(
      await listWorkspaceTaskComments(
        getDatabase(),
        context,
        taskId(params.taskId),
      ),
    );
  } catch (cause) {
    throwTaskHttpError(cause);
  }
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = commentSchema.safeParse(await readRequestInput(request));
  if (!parsed.success) error(400, "Comentário inválido.");
  try {
    return json(
      await createWorkspaceTaskComment(
        getDatabase(),
        context,
        taskId(params.taskId),
        parsed.data.body,
      ),
      { status: 201 },
    );
  } catch (cause) {
    throwTaskHttpError(cause);
  }
};
