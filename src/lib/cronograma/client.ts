import type {
  CronogramaBlockInput,
  CronogramaQuery,
  CronogramaReorganizationInput,
  CronogramaSnapshot,
} from "./api-types";
import type { ScheduleMap } from "./types";
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

export class CronogramaApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CronogramaApiError";
  }
}

function request(
  input: string,
  init: RequestInit | undefined,
  fetcher: FetchLike,
): Promise<CronogramaSnapshot> {
  return requestJson<CronogramaSnapshot>(fetcher, input, init, {
    fallbackMessage: "Não foi possível atualizar o Cronograma.",
    createError: (status, message) => new CronogramaApiError(status, message),
  });
}

export async function loadCronogramaSnapshot(
  query: CronogramaQuery = {},
  fetcher: FetchLike = fetch,
): Promise<CronogramaSnapshot> {
  if (!query.workspaceId && isGlobalWorkspaceScope()) {
    const snapshots = await Promise.all(
      workspaceIdsForRequestScope().map((workspaceId) =>
        loadCronogramaSnapshot({ ...query, workspaceId }, fetcher),
      ),
    );
    return {
      workspaceId: GLOBAL_WORKSPACE_SCOPE_ID,
      items: snapshots.flatMap(({ items }) => items),
    };
  }
  const params = new URLSearchParams();
  if (query.workspaceId) params.set("workspaceId", query.workspaceId);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.responsibleUserId)
    params.set("responsibleUserId", query.responsibleUserId);
  const suffix = params.size ? `?${params.toString()}` : "";
  return request(`/api/cronograma${suffix}`, undefined, fetcher);
}

export function saveCronogramaEntry(
  subtaskId: string,
  input: CronogramaBlockInput,
  fetcher: FetchLike = fetch,
): Promise<CronogramaSnapshot> {
  return request(
    `/api/cronograma/${encodeURIComponent(subtaskId)}`,
    jsonRequest("PUT", input),
    fetcher,
  );
}

export function deleteCronogramaEntry(
  subtaskId: string,
  version: number,
  fetcher: FetchLike = fetch,
): Promise<CronogramaSnapshot> {
  return request(
    `/api/cronograma/${encodeURIComponent(subtaskId)}`,
    jsonRequest("DELETE", { version }),
    fetcher,
  );
}

export function saveCronogramaReorganization(
  input: CronogramaReorganizationInput,
  fetcher: FetchLike = fetch,
): Promise<CronogramaSnapshot> {
  return request(
    "/api/cronograma/reorganize",
    jsonRequest("POST", input),
    fetcher,
  );
}

export function scheduleMapFromSnapshot(
  snapshot: CronogramaSnapshot,
): ScheduleMap {
  return Object.fromEntries(
    snapshot.items.map((item) => [
      item.subtaskId,
      {
        date: item.date,
        startMinutes: item.startMinutes,
        durationSlots: item.durationMinutes / 30,
        version: item.version,
      },
    ]),
  );
}
