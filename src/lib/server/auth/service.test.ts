import { describe, expect, it, vi } from "vitest";
import type { Database } from "../db/database";
import { AccountAlreadyExistsError, registerAccount } from "./service";

vi.mock("./password", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./password")>()),
  hashPassword: vi.fn().mockResolvedValue("test-password-hash"),
}));

const account = {
  username: "test_account",
  email: "account@example.test",
  password: "Test2026!",
};

function rejectingDatabase(error: unknown): Database {
  return {
    transaction: vi.fn().mockRejectedValue(error),
  } as unknown as Database;
}

describe("registerAccount duplicate errors", () => {
  it.each([
    { code: "ER_DUP_ENTRY", errno: 1062 },
    { errno: 1062 },
    { code: "23505" },
  ])(
    "reports an account conflict for a wrapped unique violation: %j",
    async (cause) => {
      const error = new Error("Failed query", { cause });
      await expect(
        registerAccount(rejectingDatabase(error), account),
      ).rejects.toBeInstanceOf(AccountAlreadyExistsError);
    },
  );

  it("recognizes a direct MySQL duplicate error", async () => {
    await expect(
      registerAccount(rejectingDatabase({ code: "ER_DUP_ENTRY" }), account),
    ).rejects.toBeInstanceOf(AccountAlreadyExistsError);
  });

  it("preserves unrelated database failures, including cyclic causes", async () => {
    const error = new Error("Connection lost", {
      cause: { code: "ECONNRESET" },
    });
    await expect(
      registerAccount(rejectingDatabase(error), account),
    ).rejects.toBe(error);
    error.cause = error;
    await expect(
      registerAccount(rejectingDatabase(error), account),
    ).rejects.toBe(error);
  });
});
