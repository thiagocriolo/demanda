import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwDeliveryHttpError } from "$lib/server/deliveries/http";
import {
  archiveWorkspaceDelivery,
  deleteWorkspaceDelivery,
  getWorkspaceDelivery,
  DeliveryNotFoundError,
  updateWorkspaceDelivery,
} from "$lib/server/deliveries/service";
import {
  deliveryArchiveQuerySchema,
  deliveryUpdateSchema,
} from "$lib/server/deliveries/validation";

const identifierSchema = z.string().uuid();

function deliveryId(value: string | undefined): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throwDeliveryHttpError(new DeliveryNotFoundError());
  return parsed.data;
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(
      await getWorkspaceDelivery(getDatabase(), context, deliveryId(params.deliveryId)),
    );
  } catch (cause) {
    throwDeliveryHttpError(cause);
  }
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = deliveryUpdateSchema.safeParse(await readRequestInput(request));
  if (!parsed.success) error(400, "Dados da tarefa inválidos.");

  try {
    return json(
      await updateWorkspaceDelivery(
        getDatabase(),
        context,
        deliveryId(params.deliveryId),
        parsed.data,
      ),
    );
  } catch (cause) {
    throwDeliveryHttpError(cause);
  }
};

export const PATCH: RequestHandler = async ({ locals, params, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = deliveryArchiveQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Versão da tarefa inválida.");

  try {
    return json(
      await archiveWorkspaceDelivery(
        getDatabase(),
        context,
        deliveryId(params.deliveryId),
        parsed.data.version,
      ),
    );
  } catch (cause) {
    throwDeliveryHttpError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = deliveryArchiveQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "VersÃ£o da tarefa invÃ¡lida.");

  try {
    await deleteWorkspaceDelivery(
      getDatabase(),
      context,
      deliveryId(params.deliveryId),
      parsed.data.version,
    );
    return json({ deleted: true as const });
  } catch (cause) {
    throwDeliveryHttpError(cause);
  }
};
