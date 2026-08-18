import { describe, expect, it } from "vitest";
import {
  DUMMY_PASSWORD_HASH,
  PASSWORD_MAX_CHARACTERS,
  PASSWORD_MIN_CHARACTERS,
  hashPassword,
  passwordNeedsRehash,
  validatePassword,
  verifyPassword,
} from "./password";

describe("password policy", () => {
  it("exige tamanho, maiúscula, minúscula e número sem impedir especiais", () => {
    expect(
      validatePassword("Aa1".padEnd(PASSWORD_MIN_CHARACTERS - 1, "a")).valid,
    ).toBe(false);
    expect(validatePassword("Aa1!@#")).toEqual({ valid: true });
    expect(validatePassword("Árvore1")).toEqual({ valid: true });
    expect(validatePassword("abcdef1").valid).toBe(false);
    expect(validatePassword("ABCDEF1").valid).toBe(false);
    expect(validatePassword("Abcdef").valid).toBe(false);
    expect(
      validatePassword(`Aa1${"a".repeat(PASSWORD_MAX_CHARACTERS - 2)}`).valid,
    ).toBe(false);
  });
});

describe("password hashing", () => {
  it("round-trips a password and fails closed for wrong or malformed data", async () => {
    const password = " Segredo1! ";
    const encodedHash = await hashPassword(password);

    expect(encodedHash).not.toContain(password);
    expect(passwordNeedsRehash(encodedHash)).toBe(false);
    expect(await verifyPassword(password, encodedHash)).toBe(true);
    expect(await verifyPassword(password.trim(), encodedHash)).toBe(false);
    expect(await verifyPassword(password, "scrypt$invalid")).toBe(false);
    expect(passwordNeedsRehash("scrypt$invalid")).toBe(true);
    expect(
      passwordNeedsRehash(encodedHash.replace("$131072$", "$65536$")),
    ).toBe(true);
  });

  it("mantém o hash fixo válido para equalizar o tempo de usuário inexistente", async () => {
    expect(
      await verifyPassword(
        "demanda-invalid-user-password-v1",
        DUMMY_PASSWORD_HASH,
      ),
    ).toBe(true);
    expect(
      await verifyPassword("senha real de outro usuário", DUMMY_PASSWORD_HASH),
    ).toBe(false);
    expect(passwordNeedsRehash(DUMMY_PASSWORD_HASH)).toBe(false);
  });
});
