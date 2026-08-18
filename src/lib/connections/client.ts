import type {
  ConnectionDashboard,
  ConnectionRequestSummary,
  ConnectionSearchResult,
} from "$lib/server/connections/service";

async function parse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const payload = await response.json().catch(() => ({})) as { message?: string };
  throw new Error(payload.message ?? "Não foi possível concluir a operação.");
}

export async function loadConnections(fetcher: typeof fetch = fetch) {
  return parse<ConnectionDashboard>(await fetcher("/api/connections"));
}

export async function searchPeople(
  query: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  const payload = await parse<{ results: ConnectionSearchResult[] }>(
    await fetcher(`/api/connections/search?q=${encodeURIComponent(query)}`, { signal }),
  );
  return payload.results;
}

export async function sendConnectionRequest(userId: string, fetcher: typeof fetch = fetch) {
  return parse<ConnectionRequestSummary>(
    await fetcher("/api/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    }),
  );
}

export async function answerConnectionRequest(
  requestId: string,
  action: "accept" | "decline" | "cancel",
  fetcher: typeof fetch = fetch,
) {
  await parse<{ ok: true }>(
    await fetcher(`/api/connections/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }),
  );
}

export async function disconnect(userId: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`/api/connections/${userId}`, { method: "DELETE" });
  if (!response.ok) await parse(response);
}
