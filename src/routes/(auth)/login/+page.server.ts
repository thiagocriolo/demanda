import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  clearSessionCookie,
  getSessionCookie,
  setSessionCookie,
} from "$lib/server/auth/cookies";
import { safeInternalRedirect } from "$lib/server/auth/redirect";
import {
  authenticateAccount,
  InvalidCredentialsError,
  revokeSessionByToken,
} from "$lib/server/auth/service";
import {
  firstValidationMessage,
  loginInputSchema,
} from "$lib/server/auth/validation";
import { getDatabase } from "$lib/server/db";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.auth) {
    redirect(303, safeInternalRedirect(url.searchParams.get("next")));
  }
  return {};
};

export const actions: Actions = {
  default: async ({ cookies, request, url }) => {
    const formData = await request.formData();
    const submitted = {
      identifier: String(formData.get("identifier") ?? ""),
      password: String(formData.get("password") ?? ""),
      remember: formData.get("remember") === "true",
    };
    const parsed = loginInputSchema.safeParse(submitted);

    if (!parsed.success) {
      return fail(400, {
        message: firstValidationMessage(parsed.error),
        values: {
          identifier: submitted.identifier,
          remember: submitted.remember,
        },
      });
    }

    const database = getDatabase();
    let issued;
    try {
      issued = await authenticateAccount(database, {
        ...parsed.data,
        remembered: parsed.data.remember,
        userAgent: request.headers.get("user-agent"),
      });
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return fail(400, {
          message: "Usuário/e-mail ou senha incorretos.",
          values: {
            identifier: parsed.data.identifier,
            remember: parsed.data.remember,
          },
        });
      }
      throw error;
    }

    const previousToken = getSessionCookie(cookies);
    if (previousToken) await revokeSessionByToken(database, previousToken);
    clearSessionCookie(cookies);
    setSessionCookie(cookies, {
      token: issued.token,
      expiresAt: issued.session.expiresAt,
      remembered: issued.session.remembered,
    });

    redirect(303, safeInternalRedirect(url.searchParams.get("next")));
  },
};
