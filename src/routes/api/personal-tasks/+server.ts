import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import {
  createPersonalTask,
  listPersonalTasks,
} from "$lib/server/personal-tasks/service";

const inputSchema = z
  .object({ title: z.string().trim().min(1).max(80) })
  .strict();

export const GET: RequestHandler = async ({ locals }) => {
  const context = requireAuthenticatedRequest(locals);
  return json(await listPersonalTasks(getDatabase(), context.user.id));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const input = inputSchema.safeParse(await readRequestInput(request));
  if (!input.success)
    return json({ message: "Título inválido." }, { status: 400 });
  return json(
    await createPersonalTask(getDatabase(), context.user.id, input.data.title),
    { status: 201 },
  );
};
