import { describe, expect, it, vi } from "vitest";
import { loadFinancialSnapshot } from "./client";
import type { FinancialSnapshot } from "./api-types";

vi.mock("../workspaces/workspace-storage", () => ({
  GLOBAL_WORKSPACE_ID: "global",
  loadActiveWorkspaceId: () => "personal",
  loadScopedWorkspaceIds: () => [],
}));

describe("cliente do Financeiro", () => {
  it("envia o workspace solicitado na leitura", async () => {
    const workspaceId = "078ef345-0bdf-4ddb-9135-13a824ec4f6d";
    const snapshot: FinancialSnapshot = {
      workspaceId,
      entries: [],
      totals: {
        revenueCents: 0,
        expenseCents: 0,
        settledRevenueCents: 0,
        settledExpenseCents: 0,
        openRevenueCents: 0,
        openExpenseCents: 0,
        balanceCents: 0,
        expectedBalanceCents: 0,
      },
    };
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await loadFinancialSnapshot(
      { workspaceId, basis: "competence" },
      fetcher as typeof fetch,
    );

    expect(fetcher).toHaveBeenCalledWith(
      `/api/finance?workspaceId=${workspaceId}&basis=competence`,
      undefined,
    );
  });
});
