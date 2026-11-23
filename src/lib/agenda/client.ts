import type {
  AgendaItem,
  AgendaMode,
  AgendaMoveInput,
  AgendaQuery,
  AgendaSnapshot,
} from "./types";
import {
  jsonRequest,
  requestJson,
  type FetchLike,
} from "../http/client";
import {
  GLOBAL_WORKSPACE_SCOPE_ID,
  isGlobalWorkspaceScope,
  workspaceIdsForRequestScope,
} from "../workspaces/workspace-scope";

export class AgendaApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AgendaApiError";
  }
}

function request(
  fetcher: FetchLike,
  init?: RequestInit,
  path = "/api/agenda",
): Promise<AgendaSnapshot> {
  return requestJson<AgendaSnapshot>(fetcher, path, init, {
    fallbackMessage: "Nao foi possivel atualizar a Agenda.",
    createError: (status, message) => new AgendaApiError(status, message),
  });
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
      deliveries: snapshots.flatMap(({ deliveries }) => deliveries),
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
  return request(fetcher, jsonRequest("PUT", input)).then((snapshot) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("demanda:deliveries-changed"));
    }
    return snapshot;
  });
}
