import { describe, expect, it, vi } from "vitest";
import { loadDashboardSnapshot, searchGlobally } from "./client";

describe("BE-14 dashboard client", () => {
  it("envia período, data e AbortSignal ao dashboard", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ workspaceId: "workspace" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await loadDashboardSnapshot({
      date: "2026-07-14",
      period: "month",
      signal: controller.signal,
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/dashboard?date=2026-07-14&period=month",
      { signal: controller.signal },
    );
  });

  it("codifica termo, escopo e paginação da busca", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
    await searchGlobally("A&B", {
      scope: "project",
      page: 3,
      pageSize: 20,
      fetcher,
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "/api/search?q=A%26B&scope=project&page=3&pageSize=20",
    );
  });
});
