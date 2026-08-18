import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import {
  deletePersonalTask,
  updatePersonalTask,
} from "$lib/server/personal-tasks/service";

const idSchema = z.string().uuid();
const inputSchema = z.object({ done: z.boolean() }).strict();

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = idSchema.safeParse(params.taskId);
  const input = inputSchema.safeParse(await readRequestInput(request));
  if (!id.success || !input.success)
    return json({ message: "Tarefa inválida." }, { status: 400 });
  const task = await updatePersonalTask(
    getDatabase(),
    context.user.id,
    id.data,
    input.data.done,
  );
  if (!task)
    return json({ message: "Tarefa não encontrada." }, { status: 404 });
  return json(task);
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = idSchema.safeParse(params.taskId);
  if (!id.success)
    return json({ message: "Tarefa inválida." }, { status: 400 });
  const removed = await deletePersonalTask(
    getDatabase(),
    context.user.id,
    id.data,
  );
  if (!removed)
    return json({ message: "Tarefa não encontrada." }, { status: 404 });
  return new Response(null, { status: 204 });
};
