import type { Cookies } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";
import {
  clearSessionCookie,
  SESSION_COOKIE_NAME,
  setSessionCookie,
} from "./cookies";

function cookieMock() {
  return {
    set: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  } as unknown as Cookies;
}

describe("cookie de sessão", () => {
  it("usa HttpOnly, SameSite e Secure em produção", () => {
    const cookies = cookieMock();
    const expiresAt = new Date("2026-08-12T12:00:00.000Z");

    setSessionCookie(
      cookies,
      { token: "token", expiresAt, remembered: true },
      true,
    );

    expect(cookies.set).toHaveBeenCalledWith(SESSION_COOKIE_NAME, "token", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      expires: expiresAt,
    });
  });

  it("mantém cookie transitório sem expiração e apaga no mesmo caminho", () => {
    const cookies = cookieMock();
    setSessionCookie(
      cookies,
      {
        token: "token",
        expiresAt: new Date("2026-07-14T12:00:00.000Z"),
        remembered: false,
      },
      false,
    );
    clearSessionCookie(cookies, false);

    expect(cookies.set).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      "token",
      expect.not.objectContaining({ expires: expect.anything() }),
    );
    expect(cookies.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });
  });
});
