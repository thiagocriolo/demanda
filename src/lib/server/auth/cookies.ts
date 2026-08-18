import type { Cookies } from "@sveltejs/kit";

export const SESSION_COOKIE_NAME = "demanda_session";
export const SESSION_COOKIE_PATH = "/";

export type SessionCookie = {
  token: string;
  expiresAt: Date;
  remembered: boolean;
};

function baseCookieOptions(production: boolean) {
  return {
    path: SESSION_COOKIE_PATH,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: production,
  };
}

export function setSessionCookie(
  cookies: Cookies,
  session: SessionCookie,
  production = process.env.NODE_ENV === "production",
): void {
  cookies.set(SESSION_COOKIE_NAME, session.token, {
    ...baseCookieOptions(production),
    ...(session.remembered ? { expires: session.expiresAt } : {}),
  });
}

export function clearSessionCookie(
  cookies: Cookies,
  production = process.env.NODE_ENV === "production",
): void {
  cookies.delete(SESSION_COOKIE_NAME, baseCookieOptions(production));
}

export function getSessionCookie(cookies: Cookies): string | undefined {
  return cookies.get(SESSION_COOKIE_NAME);
}
