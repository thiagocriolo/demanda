import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwContactHttpError } from "$lib/server/contacts/http";
import {
  archiveWorkspaceContact,
  ContactNotFoundError,
  getWorkspaceContact,
  updateWorkspaceContact,
} from "$lib/server/contacts/service";
import { contactMutationSchema } from "$lib/server/contacts/validation";

const identifierSchema = z.string().uuid();

function contactId(value: string | undefined): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throwContactHttpError(new ContactNotFoundError());
  return parsed.data;
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(
      await getWorkspaceContact(
        getDatabase(),
        context,
        contactId(params.contactId),
      ),
    );
  } catch (cause) {
    throwContactHttpError(cause);
  }
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = contactMutationSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Dados do contato inválidos.");

  try {
    return json(
      await updateWorkspaceContact(
        getDatabase(),
        context,
        contactId(params.contactId),
        parsed.data,
      ),
    );
  } catch (cause) {
    throwContactHttpError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    await archiveWorkspaceContact(
      getDatabase(),
      context,
      contactId(params.contactId),
    );
    return json({ archived: true as const });
  } catch (cause) {
    throwContactHttpError(cause);
  }
};
