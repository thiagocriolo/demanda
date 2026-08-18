import { describe, expect, it } from "vitest";
import { dashboardQuerySchema, globalSearchQuerySchema } from "./validation";

describe("BE-14 dashboard validation", () => {
  it("aceita período e data civil válidos", () => {
    expect(
      dashboardQuerySchema.parse({ date: "2026-07-14", period: "month" }),
    ).toEqual({ date: "2026-07-14", period: "month" });
    expect(dashboardQuerySchema.safeParse({ date: "2026-02-30" }).success).toBe(
      false,
    );
  });

  it("normaliza busca paginada e rejeita termos curtos", () => {
    expect(
      globalSearchQuerySchema.parse({
        q: "  projeto ",
        scope: "task",
        page: "2",
        pageSize: "10",
      }),
    ).toEqual({ q: "projeto", scope: "task", page: 2, pageSize: 10 });
    expect(globalSearchQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(
      globalSearchQuerySchema.safeParse({ q: "válido", scope: "workspace" })
        .success,
    ).toBe(false);
  });
});
