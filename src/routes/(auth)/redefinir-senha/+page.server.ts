import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import {
  InvalidPasswordResetTokenError,
  resetPassword,
} from "$lib/server/auth/service";
import {
  firstValidationMessage,
  passwordResetSchema,
} from "$lib/server/auth/validation";
import { getDatabase } from "$lib/server/db";

export const load: PageServerLoad = async ({ setHeaders, url }) => {
  setHeaders({
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  return { token: url.searchParams.get("token") ?? "" };
};

export const actions: Actions = {
  default: async ({ request, setHeaders }) => {
    setHeaders({
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    });
    const formData = await request.formData();
    const parsed = passwordResetSchema.safeParse({
      token: String(formData.get("token") ?? ""),
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
      await resetPassword(
        getDatabase(),
        parsed.data.token,
        parsed.data.password,
      );
    } catch (error) {
      if (error instanceof InvalidPasswordResetTokenError) {
        return fail(400, { message: error.message, success: false });
      }
      throw error;
    }

    return {
      message: "Senha redefinida. Você já pode voltar e entrar novamente.",
      success: true,
    };
  },
};
