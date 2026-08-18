import type {
  CronogramaBlockInput,
  CronogramaQuery,
  CronogramaReorganizationInput,
  CronogramaSnapshot,
} from "./api-types";
import type { ScheduleMap } from "./types";
import {
  GLOBAL_WORKSPACE_SCOPE_ID,
  isGlobalWorkspaceScope,
  workspaceIdsForRequestScope,
} from "../workspaces/workspace-scope";

type FetchLike = typeof fetch;

export class CronogramaApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CronogramaApiError";
  }
}

async function request(
  input: string,
  init: RequestInit | undefined,
  fetcher: FetchLike,
): Promise<CronogramaSnapshot> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    let message = "Não foi possível atualizar o Cronograma.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // Respostas sem JSON usam a mensagem segura acima.
    }
    throw new CronogramaApiError(response.status, message);
  }
  return (await response.json()) as CronogramaSnapshot;
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
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
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
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version }),
    },
    fetcher,
  );
}

export function saveCronogramaReorganization(
  input: CronogramaReorganizationInput,
  fetcher: FetchLike = fetch,
): Promise<CronogramaSnapshot> {
  return request(
    "/api/cronograma/reorganize",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
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
