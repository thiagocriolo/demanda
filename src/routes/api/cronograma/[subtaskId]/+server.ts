import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwCronogramaHttpError } from "$lib/server/cronograma/http";
import {
  deleteCronogramaBlock,
  saveCronogramaBlock,
} from "$lib/server/cronograma/service";
import {
  cronogramaBlockSchema,
  cronogramaDeleteSchema,
} from "$lib/server/cronograma/validation";

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = cronogramaBlockSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Bloco do Cronograma inválido.");
  try {
    return json(
      await saveCronogramaBlock(
        getDatabase(),
        context,
        params.subtaskId,
        parsed.data,
      ),
    );
  } catch (cause) {
    throwCronogramaHttpError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = cronogramaDeleteSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Versão do bloco inválida.");
  try {
    return json(
      await deleteCronogramaBlock(
        getDatabase(),
        context,
        params.subtaskId,
        parsed.data,
      ),
    );
  } catch (cause) {
    throwCronogramaHttpError(cause);
  }
};
