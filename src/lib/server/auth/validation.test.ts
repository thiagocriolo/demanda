import { describe, expect, it } from "vitest";
import {
  loginInputSchema,
  normalizeEmail,
  normalizeUsername,
  registrationInputSchema,
} from "./validation";

describe("validação de autenticação", () => {
  it("normaliza identificadores públicos sem alterar senhas", () => {
    expect(normalizeUsername("  @Thiago.Silva ")).toBe("thiago.silva");
    expect(normalizeEmail("  Thiago@Example.COM ")).toBe("thiago@example.com");

    const login = loginInputSchema.parse({
      identifier: " THIAGO ",
      password: "  senha preservada  ",
      remember: false,
    });
    expect(login).toMatchObject({
      identifier: "thiago",
      password: "  senha preservada  ",
    });
  });

  it("rejeita username, senha curta e confirmação divergente", () => {
    const result = registrationInputSchema.safeParse({
      username: "A!",
      email: "email-invalido",
      password: "curta",
      passwordConfirmation: "outra",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(({ path }) => path[0])).toEqual(
        expect.arrayContaining([
          "username",
          "email",
          "password",
          "passwordConfirmation",
        ]),
      );
    }
  });
});
