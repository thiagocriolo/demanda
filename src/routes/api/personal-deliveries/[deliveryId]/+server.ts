import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import {
  deletePersonalDelivery,
  updatePersonalDelivery,
} from "$lib/server/personal-deliveries/service";

const idSchema = z.string().uuid();
const inputSchema = z.object({ done: z.boolean() }).strict();

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = idSchema.safeParse(params.deliveryId);
  const input = inputSchema.safeParse(await readRequestInput(request));
  if (!id.success || !input.success)
    return json({ message: "Tarefa inválida." }, { status: 400 });
  const delivery = await updatePersonalDelivery(
    getDatabase(),
    context.user.id,
    id.data,
    input.data.done,
  );
  if (!delivery)
    return json({ message: "Tarefa não encontrada." }, { status: 404 });
  return json(delivery);
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = idSchema.safeParse(params.deliveryId);
  if (!id.success)
    return json({ message: "Tarefa inválida." }, { status: 400 });
  const removed = await deletePersonalDelivery(
    getDatabase(),
    context.user.id,
    id.data,
  );
  if (!removed)
    return json({ message: "Tarefa não encontrada." }, { status: 404 });
  return new Response(null, { status: 204 });
};
