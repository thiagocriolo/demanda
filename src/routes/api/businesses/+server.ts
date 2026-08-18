import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { throwBusinessHttpError } from "$lib/server/businesses/http";
import {
  createWorkspaceBusiness,
  listWorkspaceBusinesses,
} from "$lib/server/businesses/service";
import {
  businessListQuerySchema,
  businessMutationSchema,
} from "$lib/server/businesses/validation";
import { getDatabase } from "$lib/server/db";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = businessListQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Filtros de negocios invalidos.");

  try {
    return json(
      await listWorkspaceBusinesses(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    throwBusinessHttpError(cause);
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = businessMutationSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Dados do negocio invalidos.");

  try {
    const business = await createWorkspaceBusiness(
      getDatabase(),
      context,
      parsed.data,
    );
    return json(business, { status: 201 });
  } catch (cause) {
    throwBusinessHttpError(cause);
  }
};
