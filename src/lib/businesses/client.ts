import type { EntityRecord } from "../entities/types";
import type {
  Business,
  BusinessList,
  BusinessMutationInput,
  BusinessNote,
  BusinessResponsible,
  BusinessResponsibleUserOption,
} from "./types";

export const BUSINESSES_CHANGED_EVENT = "demanda:businesses-changed";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class BusinessApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BusinessApiError";
  }
}

async function requestJson<T>(
  fetcher: FetchLike,
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    let message = "Não foi possível concluir a operação com o negócio.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // A mensagem genérica também cobre respostas sem JSON.
    }
    throw new BusinessApiError(response.status, message);
  }
  return (await response.json()) as T;
}

function jsonRequest(method: "POST" | "PUT", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export type BusinessListOptions = {
  page?: number;
  pageSize?: number;
  query?: string;
  stage?: string;
  category?: string;
  orderBy?: "updated" | "name_asc" | "name_desc";
  archived?: "exclude" | "include" | "only";
  signal?: AbortSignal;
};

async function listBusinessesPage(
  options: BusinessListOptions = {},
  fetcher: FetchLike = fetch,
): Promise<BusinessList> {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 50),
    archived: options.archived ?? "exclude",
  });
  if (options.query?.trim()) params.set("query", options.query.trim());
  if (options.stage) params.set("stage", options.stage);
  if (options.category) params.set("category", options.category);
  if (options.orderBy) params.set("orderBy", options.orderBy);
  return requestJson<BusinessList>(fetcher, `/api/businesses?${params}`, {
    signal: options.signal,
  });
}

export async function listBusinesses(
  options: BusinessListOptions = {},
  fetcher: FetchLike = fetch,
): Promise<BusinessList> {
  return listBusinessesPage(options, fetcher);
}

export async function listAllActiveBusinesses(
  options: Omit<BusinessListOptions, "page" | "pageSize" | "archived"> = {},
  fetcher: FetchLike = fetch,
): Promise<Business[]> {
  const first = await listBusinesses(
    { ...options, page: 1, pageSize: 100, archived: "exclude" },
    fetcher,
  );
  const ownerUserId = first.ownerUserId;
  const items: Business[] = [];
  const seen = new Set<string>();
  const append = (result: BusinessList): void => {
    if (
      result.ownerUserId !== ownerUserId ||
      result.items.some((business) => business.ownerUserId !== ownerUserId)
    ) {
      throw new BusinessApiError(
        409,
        "O usuário mudou durante o carregamento dos negócios. Tente novamente.",
      );
    }
    for (const business of result.items) {
      if (seen.has(business.id)) continue;
      seen.add(business.id);
      items.push(business);
    }
  };
  append(first);
  for (let page = 2; page <= first.totalPages; page += 1) {
    const result = await listBusinesses(
      { ...options, page, pageSize: 100, archived: "exclude" },
      fetcher,
    );
    append(result);
  }
  return items;
}

export function getBusiness(
  businessId: string,
  fetcher: FetchLike = fetch,
): Promise<Business> {
  return requestJson<Business>(
    fetcher,
    `/api/businesses/${encodeURIComponent(businessId)}`,
  );
}

export async function createBusiness(
  input: BusinessMutationInput,
  fetcher: FetchLike = fetch,
): Promise<Business> {
  const business = await requestJson<Business>(
    fetcher,
    "/api/businesses",
    jsonRequest("POST", input),
  );
  notifyBusinessesChanged();
  return business;
}

export async function updateBusiness(
  businessId: string,
  input: BusinessMutationInput,
  fetcher: FetchLike = fetch,
): Promise<Business> {
  const business = await requestJson<Business>(
    fetcher,
    `/api/businesses/${encodeURIComponent(businessId)}`,
    jsonRequest("PUT", input),
  );
  notifyBusinessesChanged();
  return business;
}

export async function archiveBusiness(
  businessId: string,
  fetcher: FetchLike = fetch,
): Promise<void> {
  await requestJson<{ archived: true }>(
    fetcher,
    `/api/businesses/${encodeURIComponent(businessId)}`,
    { method: "DELETE" },
  );
  notifyBusinessesChanged();
}

export function listBusinessResponsibleUsers(
  fetcher: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<BusinessResponsibleUserOption[]> {
  return requestJson<BusinessResponsibleUserOption[]>(
    fetcher,
    "/api/business-responsibles/users",
    { signal },
  );
}

function notifyBusinessesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BUSINESSES_CHANGED_EVENT));
}

export function observeBusinesses(onchange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(BUSINESSES_CHANGED_EVENT, onchange);
  return () => window.removeEventListener(BUSINESSES_CHANGED_EVENT, onchange);
}

const BUSINESS_NOTES_FIELD = "__businessNotes";
const BUSINESS_RESPONSIBLES_FIELD = "__businessResponsibles";
const BUSINESS_STAGE_FIELD = "__businessStage";

function serializeNotes(notes: BusinessNote[]): string {
  return JSON.stringify(notes.map(({ body }) => ({ body })));
}

function parseArray<T>(value: string | undefined): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function replaceVisibleNote(
  notes: { body: string }[],
  displayedBefore: string,
  displayedAfter: string,
): { body: string }[] {
  if (displayedAfter === displayedBefore) return notes;
  if (!displayedAfter) return notes.slice(1);
  if (!notes.length) return [{ body: displayedAfter }];
  return [{ body: displayedAfter }, ...notes.slice(1)];
}

export function businessToEntityRecord(business: Business): EntityRecord {
  return {
    id: business.id,
    workspaceId: business.workspaceId,
    ownerUserId: business.ownerUserId,
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
    archivedAt: business.archivedAt ?? "",
    nome: business.name,
    categoria: business.category,
    etapa: business.archivedAt ? "arquivado" : business.stage,
    responsaveis: business.responsibles.map(({ name }) => name).join(", "),
    responsavelIds: JSON.stringify(
      business.responsibles.map((responsible) =>
        responsible.kind === "user"
          ? `user:${responsible.userId}`
          : `contact:${responsible.contactId}`,
      ),
    ),
    observacoes: business.notes[0]?.body ?? "",
    [BUSINESS_NOTES_FIELD]: serializeNotes(business.notes),
    [BUSINESS_RESPONSIBLES_FIELD]: JSON.stringify(business.responsibles),
    [BUSINESS_STAGE_FIELD]: business.stage,
  };
}

export function entityValuesToBusinessInput(
  values: Record<string, string>,
  current?: EntityRecord,
): BusinessMutationInput {
  const storedNotes = parseArray<{ body: string }>(
    current?.[BUSINESS_NOTES_FIELD],
  );
  const currentNotes =
    storedNotes.length || !current?.observacoes
      ? storedNotes
      : [{ body: current.observacoes }];
  const responsibleIds = parseArray<unknown>(
    values.responsavelIds ?? current?.responsavelIds,
  ).filter((id): id is string => typeof id === "string");
  const responsibleContactIds: string[] = [];
  const responsibleUserIds: string[] = [];
  for (const value of responsibleIds) {
    if (value.startsWith("user:")) {
      responsibleUserIds.push(value.slice("user:".length));
    } else if (value.startsWith("contact:")) {
      responsibleContactIds.push(value.slice("contact:".length));
    } else {
      // Registros anteriores a responsaveis por usuario armazenavam UUIDs
      // simples, todos pertencentes a contatos.
      responsibleContactIds.push(value);
    }
  }
  const selectedStage = values.etapa?.trim() ?? "";

  return {
    name: values.nome?.trim() ?? "",
    category: values.categoria?.trim() ?? "",
    stage:
      selectedStage === "arquivado"
        ? current?.[BUSINESS_STAGE_FIELD] || "encerrado"
        : selectedStage,
    responsibleContactIds: [...new Set(responsibleContactIds)],
    ...(responsibleUserIds.length
      ? { responsibleUserIds: [...new Set(responsibleUserIds)] }
      : {}),
    notes: replaceVisibleNote(
      currentNotes,
      current?.observacoes?.trim() ?? "",
      values.observacoes?.trim() ?? "",
    ),
  };
}

export function businessResponsiblesFromRecord(
  record: EntityRecord | undefined,
): BusinessResponsible[] {
  return parseArray<BusinessResponsible>(record?.[BUSINESS_RESPONSIBLES_FIELD]);
}
