import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwProjectHttpError } from "$lib/server/projects/http";
import {
  archiveWorkspaceService,
  getWorkspaceService,
  ServiceNotFoundError,
  updateWorkspaceService,
} from "$lib/server/projects/service";
import { serviceMutationSchema } from "$lib/server/projects/validation";

const identifierSchema = z.string().uuid();

function serviceId(value: string | undefined): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throwProjectHttpError(new ServiceNotFoundError());
  return parsed.data;
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(
      await getWorkspaceService(
        getDatabase(),
        context,
        serviceId(params.serviceId),
      ),
    );
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = serviceMutationSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Dados do servico invalidos.");

  try {
    return json(
      await updateWorkspaceService(
        getDatabase(),
        context,
        serviceId(params.serviceId),
        parsed.data,
      ),
    );
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    await archiveWorkspaceService(
      getDatabase(),
      context,
      serviceId(params.serviceId),
    );
    return json({ archived: true as const });
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};
