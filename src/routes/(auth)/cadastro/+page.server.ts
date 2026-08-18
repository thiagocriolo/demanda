import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import type { Actions, PageServerLoad } from "./$types";
import {
  clearSessionCookie,
  getSessionCookie,
  setSessionCookie,
} from "$lib/server/auth/cookies";
import {
  AccountAlreadyExistsError,
  registerAccount,
  revokeSessionByToken,
} from "$lib/server/auth/service";
import {
  firstValidationMessage,
  registrationInputSchema,
} from "$lib/server/auth/validation";
import { getDatabase } from "$lib/server/db";
import {
  avatarProfileUrl,
  isAvatarColor,
  isAvatarId,
  randomAvatar,
} from "$lib/avatar/avatar-options";

const invitedEmailSchema = z.string().trim().toLowerCase().email().max(320);

export const load: PageServerLoad = async ({ locals, url }) => {
  if (locals.auth) redirect(303, "/dashboard");
  const invitedEmail = invitedEmailSchema.safeParse(
    url.searchParams.get("email") ?? "",
  );
  return {
    generatedAvatar: randomAvatar(),
    invitedEmail: invitedEmail.success ? invitedEmail.data : "",
  };
};

export const actions: Actions = {
  default: async ({ cookies, request }) => {
    const formData = await request.formData();
    const submitted = {
      username: String(formData.get("username") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      passwordConfirmation: String(formData.get("passwordConfirmation") ?? ""),
      avatarImage: String(formData.get("avatarImage") ?? ""),
      avatarColor: String(formData.get("avatarColor") ?? ""),
    };
    const parsed = registrationInputSchema.safeParse(submitted);

    if (!parsed.success) {
      return fail(400, {
        message: firstValidationMessage(parsed.error),
        values: {
          username: submitted.username,
          email: submitted.email,
        },
      });
    }

    const database = getDatabase();
    const generatedAvatar =
      isAvatarId(submitted.avatarImage) && isAvatarColor(submitted.avatarColor)
        ? {
            avatarImage: submitted.avatarImage,
            avatarColor: submitted.avatarColor,
          }
        : randomAvatar();
    let issued;
    try {
      issued = await registerAccount(database, {
        username: parsed.data.username,
        email: parsed.data.email,
        password: parsed.data.password,
        userAgent: request.headers.get("user-agent"),
        remembered: true,
        avatarUrl: avatarProfileUrl(
          generatedAvatar.avatarImage,
          generatedAvatar.avatarColor,
        ),
      });
    } catch (error) {
      if (error instanceof AccountAlreadyExistsError) {
        return fail(409, {
          message: error.message,
          values: {
            username: parsed.data.username,
            email: parsed.data.email,
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
    redirect(303, "/dashboard");
  },
};
