import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAgendaSnapshot, saveAgendaOrder } from "./client";
import type { AgendaItem, AgendaSnapshot } from "./types";
import { setWorkspaceRequestScope } from "../workspaces/workspace-scope";

const snapshot: AgendaSnapshot = {
  workspaceId: "078ef345-0bdf-4ddb-9135-13a824ec4f6d",
  projects: [],
  tasks: [],
};

describe("agenda client", () => {
  afterEach(() => setWorkspaceRequestScope("", []));

  it("une os posicionamentos de todos os workspaces no escopo global", async () => {
    const workspaceIds = [snapshot.workspaceId, crypto.randomUUID()];
    setWorkspaceRequestScope("global", workspaceIds);
    const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const requestedId = new URL(
        String(input),
        "https://demanda.local",
      ).searchParams.get("workspaceId")!;
      return new Response(
        JSON.stringify({
          workspaceId: requestedId,
          projects: [
            {
              id: crypto.randomUUID(),
              date: null,
              order: 0,
              durationMinutes: 60,
              version: 1,
            },
          ],
          tasks: [],
        }),
      );
    });

    const result = await loadAgendaSnapshot({}, fetcher as typeof fetch);

    expect(result.workspaceId).toBe("global");
    expect(result.projects).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("carrega a projecao autenticada", async () => {
    const fetcher = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) =>
        new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      loadAgendaSnapshot({}, fetcher as typeof fetch),
    ).resolves.toEqual(snapshot);
    expect(fetcher).toHaveBeenCalledWith("/api/agenda", undefined);
  });

  it("envia o workspace solicitado somente na leitura", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await loadAgendaSnapshot(
      { workspaceId: snapshot.workspaceId },
      fetcher as typeof fetch,
    );
    expect(fetcher).toHaveBeenCalledWith(
      `/api/agenda?workspaceId=${snapshot.workspaceId}`,
      undefined,
    );
  });

  it("envia apenas posicionamento, duracao e versao", async () => {
    const fetcher = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) =>
        new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const item = {
      id: "4a3ef139-7963-4499-b9bb-fb597580877c",
      date: "2026-07-14",
      order: 0,
      durationMinutes: 60,
      version: 3,
    } as AgendaItem;
    await saveAgendaOrder("projects", [item], fetcher as typeof fetch);
    const [, init] = fetcher.mock.calls[0]!;
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      mode: "projects",
      items: [
        {
          id: item.id,
          date: item.date,
          order: item.order,
          durationMinutes: item.durationMinutes,
          version: item.version,
        },
      ],
    });
  });
});
