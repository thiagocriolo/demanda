import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "./redirect";

describe("redirecionamento pós-login", () => {
  it("aceita somente caminhos internos", () => {
    expect(safeInternalRedirect("/tarefas?status=aberta")).toBe(
      "/tarefas?status=aberta",
    );
    expect(safeInternalRedirect("https://evil.example/roubo")).toBe(
      "/dashboard",
    );
    expect(safeInternalRedirect("//evil.example/roubo")).toBe("/dashboard");
    expect(safeInternalRedirect("/\\evil.example/roubo")).toBe("/dashboard");
  });
});
