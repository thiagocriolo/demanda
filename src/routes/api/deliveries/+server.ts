import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwDeliveryHttpError } from "$lib/server/deliveries/http";
import {
  createWorkspaceDelivery,
  listWorkspaceDeliveries,
} from "$lib/server/deliveries/service";
import { materializeWorkspaceProjectRoutines } from "$lib/server/projects/project-routines";
import {
  deliveryCreateSchema,
  deliveryListQuerySchema,
} from "$lib/server/deliveries/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = deliveryListQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Filtros de entregas inválidos.");

  try {
    const database = getDatabase();
    // A materialização é idempotente: ao abrir a operação, novas ocorrências
    // entram na janela futura sem duplicar o histórico.
    await materializeWorkspaceProjectRoutines(database, context);
    return json(await listWorkspaceDeliveries(database, context, parsed.data));
  } catch (cause) {
    throwDeliveryHttpError(cause);
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = deliveryCreateSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Dados da entrega inválidos.");

  try {
    return json(
      await createWorkspaceDelivery(getDatabase(), context, parsed.data),
      { status: 201 },
    );
  } catch (cause) {
    throwDeliveryHttpError(cause);
  }
};
