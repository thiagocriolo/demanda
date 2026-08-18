import type {
  DashboardPeriod,
  DashboardSnapshot,
  GlobalSearchResponse,
  GlobalSearchScope,
} from "./api-types";

export class DashboardApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DashboardApiError";
  }
}

async function request<T>(
  url: string,
  fetcher: typeof fetch,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(url, init);
  if (!response.ok) {
    let message = "Não foi possível carregar os dados.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // A mensagem genérica cobre respostas sem JSON.
    }
    throw new DashboardApiError(response.status, message);
  }
  return (await response.json()) as T;
}

export function localIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function loadDashboardSnapshot(
  options: {
    date?: string;
    period?: DashboardPeriod;
    signal?: AbortSignal;
    fetcher?: typeof fetch;
  } = {},
): Promise<DashboardSnapshot> {
  const params = new URLSearchParams({
    date: options.date ?? localIsoDate(),
    period: options.period ?? "week",
  });
  return request<DashboardSnapshot>(
    `/api/dashboard?${params}`,
    options.fetcher ?? fetch,
    { signal: options.signal },
  );
}

export function searchGlobally(
  query: string,
  options: {
    scope?: GlobalSearchScope;
    page?: number;
    pageSize?: number;
    signal?: AbortSignal;
    fetcher?: typeof fetch;
  } = {},
): Promise<GlobalSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    scope: options.scope ?? "all",
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 8),
  });
  return request<GlobalSearchResponse>(
    `/api/search?${params}`,
    options.fetcher ?? fetch,
    { signal: options.signal },
  );
}
