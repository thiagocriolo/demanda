import { describe, expect, it, vi } from "vitest";
import {
  deleteCronogramaEntry,
  loadCronogramaSnapshot,
  saveCronogramaReorganization,
  saveCronogramaEntry,
  scheduleMapFromSnapshot,
} from "./client";
import type { CronogramaSnapshot } from "./api-types";

vi.mock("../workspaces/workspace-storage", () => ({
  GLOBAL_WORKSPACE_ID: "global",
  loadActiveWorkspaceId: () => "personal",
  loadScopedWorkspaceIds: () => [],
}));

const snapshot: CronogramaSnapshot = {
  workspaceId: "01dd1ab3-ed34-44fd-b100-8c371bf1bbad",
  items: [
    {
      id: "3fa3e1f2-3955-4c40-b93c-ed74761415d6",
      workspaceId: "01dd1ab3-ed34-44fd-b100-8c371bf1bbad",
      taskId: "4acb30bc-b993-41cb-beda-ecde061fbc76",
      subtaskId: "34a880a0-d3b4-467b-b8bd-026af1019505",
      date: "2026-07-15",
      startMinutes: 480,
      durationMinutes: 90,
      version: 2,
      responsibleUserIds: [],
      createdAt: "2026-07-14T12:00:00.000Z",
      updatedAt: "2026-07-14T13:00:00.000Z",
    },
  ],
};

const response = () =>
  new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("BE-11: cliente do Cronograma", () => {
  it("lê filtros e converte minutos para a grade visual", async () => {
    const fetcher = vi.fn(async () => response());
    await loadCronogramaSnapshot(
      {
        workspaceId: snapshot.workspaceId,
        from: "2026-07-14",
        to: "2026-07-20",
      },
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledWith(
      `/api/cronograma?workspaceId=${snapshot.workspaceId}&from=2026-07-14&to=2026-07-20`,
      undefined,
    );
    expect(scheduleMapFromSnapshot(snapshot)).toEqual({
      "34a880a0-d3b4-467b-b8bd-026af1019505": {
        date: "2026-07-15",
        startMinutes: 480,
        durationSlots: 3,
        version: 2,
      },
    });
  });

  it("envia gravação e exclusão com controle de versão", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push([input, init]);
      return response();
    };
    await saveCronogramaEntry(
      snapshot.items[0]!.subtaskId,
      {
        date: "2026-07-15",
        startMinutes: 480,
        durationMinutes: 90,
        version: 2,
      },
      fetcher,
    );
    await deleteCronogramaEntry(snapshot.items[0]!.subtaskId, 2, fetcher);
    expect(calls[0]?.[1]).toMatchObject({ method: "PUT" });
    expect(calls[1]?.[1]).toMatchObject({ method: "DELETE" });
    expect(calls[1]?.[1]?.body).toBe(JSON.stringify({ version: 2 }));
  });

  it("envia a reorganização da semana em lote", async () => {
    const fetcher = vi.fn(async () => response());
    const input = {
      workspaceId: snapshot.workspaceId,
      blocks: [
        {
          subtaskId: snapshot.items[0]!.subtaskId,
          date: "2026-07-16",
          startMinutes: 9 * 60,
          durationMinutes: 90,
          version: 2,
        },
      ],
    };
    await saveCronogramaReorganization(input, fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/cronograma/reorganize",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  });
});
