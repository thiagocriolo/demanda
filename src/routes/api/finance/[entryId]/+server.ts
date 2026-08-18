import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwFinanceHttpError } from "$lib/server/finance/http";
import {
  deleteFinancialEntry,
  updateFinancialEntry,
} from "$lib/server/finance/service";
import {
  financialDeleteSchema,
  financialUpdateSchema,
} from "$lib/server/finance/validation";

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = financialUpdateSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Alteração financeira inválida.");
  try {
    return json(
      await updateFinancialEntry(
        getDatabase(),
        context,
        params.entryId,
        parsed.data,
      ),
    );
  } catch (cause) {
    throwFinanceHttpError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = financialDeleteSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Versão financeira inválida.");
  try {
    return json(
      await deleteFinancialEntry(
        getDatabase(),
        context,
        params.entryId,
        parsed.data,
      ),
    );
  } catch (cause) {
    throwFinanceHttpError(cause);
  }
};
