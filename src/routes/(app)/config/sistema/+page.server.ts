import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { clearSessionCookie } from "$lib/server/auth/cookies";
import { requireAuthenticatedPageRequest } from "$lib/server/authorization/http";
import {
  changePassword,
  InvalidCredentialsError,
  listActiveSessions,
  revokeAllSessions,
} from "$lib/server/auth/service";
import {
  firstValidationMessage,
  passwordChangeSchema,
} from "$lib/server/auth/validation";
import { getDatabase } from "$lib/server/db";

export const load: PageServerLoad = async ({ locals, url }) => {
  const principal = requireAuthenticatedPageRequest(
    locals,
    `${url.pathname}${url.search}`,
  );
  const sessions = await listActiveSessions(getDatabase(), principal.user.id);
  return {
    security: {
      currentSessionId: principal.session.id,
      sessions,
    },
  };
};

export const actions: Actions = {
  changePassword: async ({ locals, request, url }) => {
    const principal = requireAuthenticatedPageRequest(
      locals,
      `${url.pathname}${url.search}`,
    );
    const formData = await request.formData();
    const parsed = passwordChangeSchema.safeParse({
      currentPassword: String(formData.get("currentPassword") ?? ""),
      password: String(formData.get("password") ?? ""),
      passwordConfirmation: String(formData.get("passwordConfirmation") ?? ""),
    });

    if (!parsed.success) {
      return fail(400, {
        message: firstValidationMessage(parsed.error),
        success: false,
      });
    }

    try {
      await changePassword(getDatabase(), {
        userId: principal.user.id,
        currentPassword: parsed.data.currentPassword,
        password: parsed.data.password,
        keepSessionId: principal.session.id,
      });
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return fail(400, {
          message: "A senha atual está incorreta.",
          success: false,
        });
      }
      throw error;
    }

    return {
      message: "Senha alterada e demais sessões encerradas.",
      success: true,
    };
  },

  revokeOtherSessions: async ({ locals, url }) => {
    const principal = requireAuthenticatedPageRequest(
      locals,
      `${url.pathname}${url.search}`,
    );
    await revokeAllSessions(getDatabase(), principal.user.id, {
      exceptSessionId: principal.session.id,
    });
    return {
      message: "As outras sessões foram encerradas.",
      success: true,
    };
  },

  revokeAllSessions: async ({ cookies, locals, url }) => {
    const principal = requireAuthenticatedPageRequest(
      locals,
      `${url.pathname}${url.search}`,
    );
    await revokeAllSessions(getDatabase(), principal.user.id);
    clearSessionCookie(cookies);
    redirect(303, "/login");
  },
};
