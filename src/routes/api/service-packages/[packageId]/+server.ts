import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import {
  requireAuthenticatedRequest,
  throwAuthorizationHttpError,
} from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { ensureRuntimeSchema } from "$lib/server/db/runtime-schema";
import {
  deleteUserServicePackage,
  duplicateUserServicePackage,
  getUserServicePackage,
  ServicePackageNotFoundError,
  ServicePackageValidationError,
  setUserServicePackageArchived,
  updateUserServicePackage,
} from "$lib/server/service-packages/service";
import {
  normalizeServicePackageInput,
  servicePackageMutationSchema,
  servicePackagePatchSchema,
} from "$lib/server/service-packages/validation";

const idSchema = z.string().uuid();

function handleServicePackageError(cause: unknown): never {
  if (cause instanceof ServicePackageNotFoundError) {
    error(404, cause.message);
  }
  if (cause instanceof ServicePackageValidationError) {
    error(400, cause.message);
  }
  throwAuthorizationHttpError(cause);
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = idSchema.safeParse(params.packageId);
  if (!id.success) error(404, "Serviço não encontrado.");

  try {
    const database = getDatabase();
    await ensureRuntimeSchema(database);
    return json(
      await getUserServicePackage(database, context.user.id, id.data),
    );
  } catch (cause) {
    handleServicePackageError(cause);
  }
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = idSchema.safeParse(params.packageId);
  if (!id.success) error(404, "Serviço não encontrado.");

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
      await updateUserServicePackage(
        database,
        context.user.id,
        id.data,
        normalized,
      ),
    );
  } catch (cause) {
    handleServicePackageError(cause);
  }
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = idSchema.safeParse(params.packageId);
  if (!id.success) error(404, "Serviço não encontrado.");

  const parsed = servicePackagePatchSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Ação inválida para o serviço.");

  try {
    const database = getDatabase();
    await ensureRuntimeSchema(database);
    if (parsed.data.action === "duplicate") {
      return json(
        await duplicateUserServicePackage(database, context.user.id, id.data),
        { status: 201 },
      );
    }
    return json(
      await setUserServicePackageArchived(
        database,
        context.user.id,
        id.data,
        parsed.data.action === "archive",
      ),
    );
  } catch (cause) {
    handleServicePackageError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = idSchema.safeParse(params.packageId);
  if (!id.success) error(404, "Serviço não encontrado.");

  try {
    const database = getDatabase();
    await ensureRuntimeSchema(database);
    await deleteUserServicePackage(database, context.user.id, id.data);
    return json({ deleted: true });
  } catch (cause) {
    handleServicePackageError(cause);
  }
};
