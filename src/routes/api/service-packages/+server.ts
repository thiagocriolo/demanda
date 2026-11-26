import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  requireAuthenticatedRequest,
  throwAuthorizationHttpError,
} from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { ensureRuntimeSchema } from "$lib/server/db/runtime-schema";
import {
  createUserServicePackage,
  listUserServicePackages,
  ServicePackageValidationError,
} from "$lib/server/service-packages/service";
import {
  normalizeServicePackageInput,
  servicePackageListQuerySchema,
  servicePackageMutationSchema,
} from "$lib/server/service-packages/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = servicePackageListQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Filtros de serviços inválidos.");

  try {
    const database = getDatabase();
    await ensureRuntimeSchema(database);
    return json(
      await listUserServicePackages(
        database,
        context.user.id,
        parsed.data,
      ),
    );
  } catch (cause) {
    console.error("[api/service-packages] GET failed:", cause);
    throwAuthorizationHttpError(cause);
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = servicePackageMutationSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) {
    error(400, parsed.error.issues[0]?.message ?? "Dados do serviço inválidos.");
  }

  try {
    const database = getDatabase();
    await ensureRuntimeSchema(database);
    const normalized = normalizeServicePackageInput(parsed.data);
    return json(
      await createUserServicePackage(database, context.user.id, normalized),
      { status: 201 },
    );
  } catch (cause) {
    if (cause instanceof ServicePackageValidationError) {
      error(400, cause.message);
    }
    console.error("[api/service-packages] POST failed:", cause);
    throwAuthorizationHttpError(cause);
  }
};
