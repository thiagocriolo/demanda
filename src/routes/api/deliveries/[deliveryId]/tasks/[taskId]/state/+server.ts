import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwDeliveryHttpError } from "$lib/server/deliveries/http";
import {
  setWorkspaceTaskState,
  DeliveryNotFoundError,
  DeliveryTaskNotFoundError,
} from "$lib/server/deliveries/service";
import { deliveryTaskStateSchema } from "$lib/server/deliveries/validation";

const identifierSchema = z.string().uuid();

function deliveryId(value: string | undefined): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throwDeliveryHttpError(new DeliveryNotFoundError());
  return parsed.data;
}

function taskId(value: string | undefined): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throwDeliveryHttpError(new DeliveryTaskNotFoundError());
  return parsed.data;
}

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = deliveryTaskStateSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Estado da tarefa inválido.");

  try {
    return json(
      await setWorkspaceTaskState(
        getDatabase(),
        context,
        deliveryId(params.deliveryId),
        taskId(params.taskId),
        parsed.data,
      ),
    );
  } catch (cause) {
    throwDeliveryHttpError(cause);
  }
};
