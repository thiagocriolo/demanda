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
  options: { propagateRoutineDeliveryIds?: string[] } = {},
): Promise<AgendaSnapshot> {
  const propagateIds = new Set(options.propagateRoutineDeliveryIds ?? []);
  const byWorkspace = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const key = item.workspaceId ?? "";
    byWorkspace.set(key, [...(byWorkspace.get(key) ?? []), item]);
  }

  const saves = [...byWorkspace.entries()].map(([workspaceId, entries]) => {
    const ordered = [...entries].sort(
      (left, right) =>
        (left.date ?? "9999-12-31").localeCompare(right.date ?? "9999-12-31") ||
        left.order - right.order ||
        left.id.localeCompare(right.id),
    );
    const positionById = new Map<string, number>();
    let currentDate: string | null | undefined;
    let position = 0;
    for (const item of ordered) {
      if (item.date !== currentDate) {
        currentDate = item.date;
        position = 0;
      }
      positionById.set(item.id, position++);
    }
    const workspacePropagateIds = entries
      .map(({ id }) => id)
      .filter((id) => propagateIds.has(id));
    const input: AgendaMoveInput = {
      mode,
      items: entries.map(({ id, date, durationMinutes, version }) => ({
        id,
        date,
        order: positionById.get(id) ?? 0,
        durationMinutes,
        version,
      })),
      ...(workspacePropagateIds.length
        ? { propagateRoutineDeliveryIds: workspacePropagateIds }
        : {}),
    };
    const path = workspaceId
      ? `/api/agenda?workspaceId=${encodeURIComponent(workspaceId)}`
      : "/api/agenda";
    return request(fetcher, jsonRequest("PUT", input), path);
  });

  return Promise.all(saves).then((snapshots) => {
    const snapshot =
      snapshots.length === 1
        ? snapshots[0]!
        : {
            workspaceId: GLOBAL_WORKSPACE_SCOPE_ID,
            projects: snapshots.flatMap(({ projects }) => projects),
            deliveries: snapshots.flatMap(({ deliveries }) => deliveries),
          };
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("demanda:deliveries-changed"));
    }
    return snapshot;
  });
}
