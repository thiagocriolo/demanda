import { describe, expect, it } from "vitest";
import { describeServerError } from "./server-errors";

describe("describeServerError", () => {
  it("reports the database cause and stack frames without Drizzle query parameters", () => {
    const error = new Error(
      "Failed query: select * from auth_sessions where token_hash = ?\nparams: secret-token",
      {
        cause: Object.assign(
          new Error("Unknown column 'users.avatar_url' in 'field list'"),
          {
            code: "ER_BAD_FIELD_ERROR",
            errno: 1054,
            sqlState: "42S22",
            sqlMessage: "Unknown column 'users.avatar_url' in 'field list'",
            sql: "select secret-token",
          },
        ),
      },
    );

    const details = describeServerError(error);
    expect(details[1]).toMatchObject({
      code: "ER_BAD_FIELD_ERROR",
      errno: 1054,
      sqlState: "42S22",
    });
    expect(details[0].frames).not.toHaveLength(0);
    expect(JSON.stringify(details)).not.toContain("secret-token");
  });

  it("handles cyclic causes and errors thrown as primitive values", () => {
    const error = new Error("Failure") as Error & { cause: unknown };
    error.cause = error;
    expect(describeServerError(error)).toHaveLength(1);
    expect(describeServerError("Failure")).toEqual([{ message: "Failure" }]);
  });
});
