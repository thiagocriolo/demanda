import { describe, expect, it, vi } from "vitest";
import { searchPeople } from "./client";

describe("cliente de conexões", () => {
  it("extrai a lista retornada pela API ao buscar um @ global", async () => {
    const user = {
      kind: "user" as const,
      id: "815126fb-f8cc-4f55-837f-43207c520660",
      username: "fulanodetal",
      name: "Fulano de Tal",
      email: "fulanodetal@gmail.com",
      avatarUrl: null,
      exact: true,
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ results: [user] }),
    );

    await expect(searchPeople("@fulanodetal", fetcher)).resolves.toEqual([
      user,
    ]);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "/api/connections/search?q=%40fulanodetal",
    );
  });
});
