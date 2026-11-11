import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { throwBusinessHttpError } from "$lib/server/businesses/http";
import {
  archiveWorkspaceBusiness,
  BusinessNotFoundError,
  deleteWorkspaceBusiness,
  getWorkspaceBusiness,
  updateWorkspaceBusiness,
} from "$lib/server/businesses/service";
import { businessMutationSchema } from "$lib/server/businesses/validation";
import { getDatabase } from "$lib/server/db";

const identifierSchema = z.string().uuid();

function businessId(value: string | undefined): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throwBusinessHttpError(new BusinessNotFoundError());
  return parsed.data;
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(
      await getWorkspaceBusiness(
        getDatabase(),
        context,
        businessId(params.businessId),
      ),
    );
  } catch (cause) {
    throwBusinessHttpError(cause);
  }
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = businessMutationSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Dados do negocio invalidos.");

  try {
    return json(
      await updateWorkspaceBusiness(
        getDatabase(),
        context,
        businessId(params.businessId),
        parsed.data,
      ),
    );
  } catch (cause) {
    throwBusinessHttpError(cause);
  }
};

export const PATCH: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    await archiveWorkspaceBusiness(
      getDatabase(),
      context,
      businessId(params.businessId),
    );
    return json({ archived: true as const });
  } catch (cause) {
    throwBusinessHttpError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    await deleteWorkspaceBusiness(
      getDatabase(),
      context,
      businessId(params.businessId),
    );
    return json({ deleted: true as const });
  } catch (cause) {
    throwBusinessHttpError(cause);
  }
};
