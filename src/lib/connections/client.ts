import { jsonRequest, requestJson } from "$lib/http/client";
import type {
  ConnectionDashboard,
  ConnectionRequestSummary,
  ConnectionSearchResult,
} from "$lib/server/connections/service";

function request<T>(
  fetcher: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<T> {
  return requestJson<T>(fetcher, url, init, {
    fallbackMessage: "Não foi possível concluir a operação.",
    createError: (_status, message) => new Error(message),
  });
}

export async function loadConnections(fetcher: typeof fetch = fetch) {
  return request<ConnectionDashboard>(fetcher, "/api/connections");
}

export async function searchPeople(
  query: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  const payload = await request<{ results: ConnectionSearchResult[] }>(
    fetcher,
    `/api/connections/search?q=${encodeURIComponent(query)}`,
    { signal },
  );
  return payload.results;
}

export async function sendConnectionRequest(userId: string, fetcher: typeof fetch = fetch) {
  return request<ConnectionRequestSummary>(
    fetcher,
    "/api/connections",
    jsonRequest("POST", { userId }),
  );
}

export async function answerConnectionRequest(
  requestId: string,
  action: "accept" | "decline" | "cancel",
  fetcher: typeof fetch = fetch,
) {
  await request<{ ok: true }>(
    fetcher,
    `/api/connections/requests/${requestId}`,
    jsonRequest("PATCH", { action }),
  );
}

export async function disconnect(userId: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`/api/connections/${userId}`, { method: "DELETE" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message ?? "Não foi possível concluir a operação.");
  }
}
