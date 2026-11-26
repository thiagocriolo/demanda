import {
  createChangeChannel,
  jsonRequest,
  requestJson as fetchJson,
} from "../http/client";
import type {
  ServicePackage,
  ServicePackageList,
  ServicePackageMutationInput,
} from "./types";

export class ServicePackageApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServicePackageApiError";
  }
}

function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  return fetchJson<T>(fetch, input, init, {
    fallbackMessage: "Não foi possível concluir a operação com o serviço.",
    createError: (status, message) => new ServicePackageApiError(status, message),
  });
}

export async function listServicePackages(
  options: {
    archived?: "exclude" | "include" | "only";
    query?: string;
    signal?: AbortSignal;
  } = {},
): Promise<ServicePackageList> {
  const params = new URLSearchParams();
  if (options.archived) params.set("archived", options.archived);
  if (options.query?.trim()) params.set("query", options.query.trim());
  const suffix = params.toString() ? `?${params}` : "";
  return requestJson<ServicePackageList>(`/api/service-packages${suffix}`, {
    signal: options.signal,
  });
}

export function getServicePackage(
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<ServicePackage> {
  return requestJson<ServicePackage>(
    `/api/service-packages/${encodeURIComponent(id)}`,
    { signal: options.signal },
  );
}

export async function createServicePackage(
  input: ServicePackageMutationInput,
): Promise<ServicePackage> {
  const created = await requestJson<ServicePackage>(
    "/api/service-packages",
    jsonRequest("POST", input),
  );
  notifyServicePackagesChanged();
  return created;
}

export async function updateServicePackage(
  id: string,
  input: ServicePackageMutationInput,
): Promise<ServicePackage> {
  const updated = await requestJson<ServicePackage>(
    `/api/service-packages/${encodeURIComponent(id)}`,
    jsonRequest("PUT", input),
  );
  notifyServicePackagesChanged();
  return updated;
}

export async function archiveServicePackage(id: string): Promise<ServicePackage> {
  const updated = await requestJson<ServicePackage>(
    `/api/service-packages/${encodeURIComponent(id)}`,
    jsonRequest("PATCH", { action: "archive" }),
  );
  notifyServicePackagesChanged();
  return updated;
}

export async function restoreServicePackage(id: string): Promise<ServicePackage> {
  const updated = await requestJson<ServicePackage>(
    `/api/service-packages/${encodeURIComponent(id)}`,
    jsonRequest("PATCH", { action: "restore" }),
  );
  notifyServicePackagesChanged();
  return updated;
}

export async function duplicateServicePackage(
  id: string,
): Promise<ServicePackage> {
  const created = await requestJson<ServicePackage>(
    `/api/service-packages/${encodeURIComponent(id)}`,
    jsonRequest("PATCH", { action: "duplicate" }),
  );
  notifyServicePackagesChanged();
  return created;
}

export async function deleteServicePackage(id: string): Promise<void> {
  await requestJson<{ deleted: true }>(
    `/api/service-packages/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  notifyServicePackagesChanged();
}

export const SERVICE_PACKAGES_CHANGED_EVENT = "demanda:service-packages-changed";

const servicePackagesChannel = createChangeChannel(
  SERVICE_PACKAGES_CHANGED_EVENT,
);
const notifyServicePackagesChanged = servicePackagesChannel.notify;
export const observeServicePackages = servicePackagesChannel.observe;
