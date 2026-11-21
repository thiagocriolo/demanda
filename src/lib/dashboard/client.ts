import { requestJson } from "../http/client";
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

function request<T>(
  url: string,
  fetcher: typeof fetch,
  init?: RequestInit,
): Promise<T> {
  return requestJson<T>(fetcher, url, init, {
    fallbackMessage: "Não foi possível carregar os dados.",
    createError: (status, message) => new DashboardApiError(status, message),
  });
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
