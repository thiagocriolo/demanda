import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwDeliveryHttpError } from "$lib/server/deliveries/http";
import { updateWorkspaceDeliveryBoard } from "$lib/server/deliveries/service";
import { deliveryBoardSchema } from "$lib/server/deliveries/validation";

export const PUT: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = deliveryBoardSchema.safeParse(await readRequestInput(request));
  if (!parsed.success) error(400, "Reordenação da pauta inválida.");

  try {
    return json(
      await updateWorkspaceDeliveryBoard(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    throwDeliveryHttpError(cause);
  }
};
