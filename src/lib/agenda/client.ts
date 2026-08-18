import type {
  AgendaItem,
  AgendaMode,
  AgendaMoveInput,
  AgendaQuery,
  AgendaSnapshot,
} from "./types";
import {
  GLOBAL_WORKSPACE_SCOPE_ID,
  isGlobalWorkspaceScope,
  workspaceIdsForRequestScope,
} from "../workspaces/workspace-scope";

type FetchLike = typeof fetch;

export class AgendaApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AgendaApiError";
  }
}

async function request(
  fetcher: FetchLike,
  init?: RequestInit,
  path = "/api/agenda",
): Promise<AgendaSnapshot> {
  const response = await fetcher(path, init);
  if (!response.ok) {
    let message = "Nao foi possivel atualizar a Agenda.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // Respostas sem JSON usam a mensagem segura acima.
    }
    throw new AgendaApiError(response.status, message);
  }
  return (await response.json()) as AgendaSnapshot;
}

export async function loadAgendaSnapshot(
  query: AgendaQuery = {},
  fetcher: FetchLike = fetch,
): Promise<AgendaSnapshot> {
  if (!query.workspaceId && isGlobalWorkspaceScope()) {
    const snapshots = await Promise.all(
      workspaceIdsForRequestScope().map((workspaceId) =>
        loadAgendaSnapshot({ workspaceId }, fetcher),
      ),
    );
    return {
      workspaceId: GLOBAL_WORKSPACE_SCOPE_ID,
      projects: snapshots.flatMap(({ projects }) => projects),
      tasks: snapshots.flatMap(({ tasks }) => tasks),
    };
  }
  const params = new URLSearchParams();
  if (query.workspaceId) params.set("workspaceId", query.workspaceId);
  const suffix = params.size ? `?${params.toString()}` : "";
  return request(fetcher, undefined, `/api/agenda${suffix}`);
}

export function saveAgendaOrder(
  mode: AgendaMode,
  items: AgendaItem[],
  fetcher: FetchLike = fetch,
): Promise<AgendaSnapshot> {
  const input: AgendaMoveInput = {
    mode,
    items: items.map(({ id, date, order, durationMinutes, version }) => ({
      id,
      date,
      order,
      durationMinutes,
      version,
    })),
  };
  return request(fetcher, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).then((snapshot) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("demanda:tasks-changed"));
    }
    return snapshot;
  });
}
