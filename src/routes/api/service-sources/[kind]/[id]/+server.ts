import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import {
  copyRealDelivery,
  copyRealProject,
} from "$lib/server/service-packages/sources";
import { throwProjectHttpError } from "$lib/server/projects/http";
import { throwDeliveryHttpError } from "$lib/server/deliveries/http";

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  if (
    !z.string().uuid().safeParse(params.id).success ||
    !["projects", "deliveries"].includes(params.kind)
  )
    error(400, "Origem inválida.");
  try {
    return json(
      params.kind === "projects"
        ? await copyRealProject(getDatabase(), context, params.id)
        : await copyRealDelivery(getDatabase(), context, params.id),
    );
  } catch (cause) {
    if (params.kind === "projects") throwProjectHttpError(cause);
    throwDeliveryHttpError(cause);
  }
};
