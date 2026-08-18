import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwFinanceHttpError } from "$lib/server/finance/http";
import { changeFinancialEntryState } from "$lib/server/finance/service";
import { financialStateSchema } from "$lib/server/finance/validation";

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = financialStateSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Transição financeira inválida.");
  try {
    return json(
      await changeFinancialEntryState(
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
