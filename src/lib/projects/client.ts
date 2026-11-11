import type { EntityRecord } from "../entities/types";
import {
  GLOBAL_WORKSPACE_SCOPE_ID,
  isGlobalWorkspaceScope,
  workspaceIdsForRequestScope,
} from "../workspaces/workspace-scope";
import {
  loadGlobalWorkspaceList,
  mergeCountRecords,
} from "../workspaces/global-list";
import type {
  Project,
  ProjectBusiness,
  ProjectFromServiceInput,
  ProjectInstallment,
  ProjectInstallmentInput,
  ProjectList,
  ProjectMutationInput,
  ProjectOptions,
  ProjectResponsible,
  ProjectServiceSummary,
  ProjectTag,
} from "./types";

export const PROJECTS_CHANGED_EVENT = "demanda:projects-changed";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ProjectApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProjectApiError";
  }
}

async function requestJson<T>(
  fetcher: FetchLike,
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    let message = "Não foi possível concluir a operação com o projeto.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // A mensagem genérica também cobre respostas sem JSON.
    }
    throw new ProjectApiError(response.status, message);
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

export type ProjectListOptions = {
  workspaceId?: string;
  page?: number;
  pageSize?: number;
  query?: string;
  status?: string;
  serviceId?: string;
  orderBy?: "updated" | "name_asc" | "name_desc";
  archived?: "exclude" | "include" | "only";
  includeEmptyInstitutional?: boolean;
  signal?: AbortSignal;
};

async function listProjectsForWorkspace(
  options: ProjectListOptions = {},
  fetcher: FetchLike = fetch,
): Promise<ProjectList> {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 50),
    archived: options.archived ?? "exclude",
  });
  if (options.workspaceId) params.set("workspaceId", options.workspaceId);
  if (options.query?.trim()) params.set("query", options.query.trim());
  if (options.status) params.set("status", options.status);
  if (options.serviceId) params.set("serviceId", options.serviceId);
  if (options.orderBy) params.set("orderBy", options.orderBy);
  if (options.includeEmptyInstitutional) {
    params.set("includeEmptyInstitutional", "true");
  }
  return requestJson<ProjectList>(fetcher, `/api/projects?${params}`, {
    signal: options.signal,
  });
}

function compareProjects(
  left: Project,
  right: Project,
  orderBy = "updated",
): number {
  if (orderBy === "name_asc" || orderBy === "name_desc") {
    const value = left.name.localeCompare(right.name, "pt-BR", {
      sensitivity: "base",
    });
    return (
      (orderBy === "name_desc" ? -value : value) ||
      left.id.localeCompare(right.id)
    );
  }
  return (
    right.updatedAt.localeCompare(left.updatedAt) ||
    right.id.localeCompare(left.id)
  );
}

export async function listProjects(
  options: ProjectListOptions = {},
  fetcher: FetchLike = fetch,
): Promise<ProjectList> {
  const workspaceIds = workspaceIdsForRequestScope();
  if (!options.workspaceId && isGlobalWorkspaceScope() && workspaceIds.length) {
    return loadGlobalWorkspaceList({
      workspaceIds,
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 50,
      loadPage: (workspaceId, page, pageSize) =>
        listProjectsForWorkspace(
          { ...options, workspaceId, page, pageSize },
          fetcher,
        ),
      compare: (left, right) =>
        compareProjects(left, right, options.orderBy ?? "updated"),
      mergeFacets: (facets) => ({
        all: facets.reduce((total, item) => total + item.all, 0),
        archived: facets.reduce((total, item) => total + item.archived, 0),
        statuses: mergeCountRecords(facets.map(({ statuses }) => statuses)),
        services: mergeCountRecords(facets.map(({ services }) => services)),
      }),
    });
  }
  return listProjectsForWorkspace(options, fetcher);
}

export async function listAllActiveProjects(
  options: Omit<ProjectListOptions, "page" | "pageSize" | "archived"> = {},
  fetcher: FetchLike = fetch,
): Promise<Project[]> {
  if (!options.workspaceId && isGlobalWorkspaceScope()) {
    const projects = (
      await Promise.all(
        workspaceIdsForRequestScope().map((workspaceId) =>
          listAllActiveProjects({ ...options, workspaceId }, fetcher),
        ),
      )
    ).flat();
    return projects.toSorted((left, right) =>
      compareProjects(left, right, options.orderBy ?? "updated"),
    );
  }
  const first = await listProjects(
    { ...options, page: 1, pageSize: 100, archived: "exclude" },
    fetcher,
  );
  const workspaceId = first.workspaceId;
  const projects: Project[] = [];
  const seen = new Set<string>();

  const append = (result: ProjectList): void => {
    if (
      result.workspaceId !== workspaceId ||
      result.items.some((project) => project.workspaceId !== workspaceId)
    ) {
      throw new ProjectApiError(
        409,
        "O workspace mudou durante o carregamento dos projetos. Tente novamente.",
      );
    }
    for (const project of result.items) {
      if (seen.has(project.id)) continue;
      seen.add(project.id);
      projects.push(project);
    }
  };

  append(first);
  for (let page = 2; page <= first.totalPages; page += 1) {
    append(
      await listProjects(
        { ...options, page, pageSize: 100, archived: "exclude" },
        fetcher,
      ),
    );
  }
  return projects;
}

export function getProject(
  projectId: string,
  fetcher: FetchLike = fetch,
): Promise<Project> {
  return requestJson<Project>(
    fetcher,
    `/api/projects/${encodeURIComponent(projectId)}`,
  );
}

export async function getProjectOptions(
  options: { workspaceId?: string; signal?: AbortSignal } = {},
  fetcher: FetchLike = fetch,
): Promise<ProjectOptions> {
  if (!options.workspaceId && isGlobalWorkspaceScope()) {
    const snapshots = await Promise.all(
      workspaceIdsForRequestScope().map((workspaceId) =>
        getProjectOptions({ ...options, workspaceId }, fetcher),
      ),
    );
    const unique = <T>(items: T[], key: (item: T) => string): T[] =>
      items.filter(
        (item, index) =>
          items.findIndex((candidate) => key(candidate) === key(item)) ===
          index,
      );
    return {
      workspaceId: GLOBAL_WORKSPACE_SCOPE_ID,
      workspaceName: "Global",
      members: unique(
        snapshots.flatMap(({ members }) => members),
        ({ userId }) => userId,
      ),
      services: unique(
        snapshots.flatMap(({ services }) => services),
        ({ id }) => id,
      ),
      tags: unique(
        snapshots.flatMap(({ tags }) => tags),
        ({ id }) => id,
      ),
    };
  }
  const params = new URLSearchParams();
  if (options.workspaceId) params.set("workspaceId", options.workspaceId);
  const query = params.size > 0 ? `?${params}` : "";
  return requestJson<ProjectOptions>(fetcher, `/api/projects/options${query}`, {
    signal: options.signal,
  });
}

export async function createProject(
  input: ProjectMutationInput,
  fetcher: FetchLike = fetch,
): Promise<Project> {
  const project = await requestJson<Project>(
    fetcher,
    "/api/projects",
    jsonRequest("POST", input),
  );
  notifyProjectsChanged();
  return project;
}

export async function createProjectFromService(
  input: ProjectFromServiceInput,
  fetcher: FetchLike = fetch,
): Promise<Project> {
  const project = await requestJson<Project>(
    fetcher,
    "/api/projects/from-service",
    jsonRequest("POST", input),
  );
  notifyProjectsChanged();
  return project;
}

export const createFromService = createProjectFromService;

export async function updateProject(
  projectId: string,
  input: ProjectMutationInput,
  fetcher: FetchLike = fetch,
): Promise<Project> {
  const project = await requestJson<Project>(
    fetcher,
    `/api/projects/${encodeURIComponent(projectId)}`,
    jsonRequest("PUT", input),
  );
  notifyProjectsChanged();
  return project;
}

export async function archiveProject(
  projectId: string,
  fetcher: FetchLike = fetch,
): Promise<void> {
  await requestJson<{ archived: true }>(
    fetcher,
    `/api/projects/${encodeURIComponent(projectId)}`,
    { method: "PATCH" },
  );
  notifyProjectsChanged();
}

export async function deleteProject(
  projectId: string,
  fetcher: FetchLike = fetch,
): Promise<void> {
  await requestJson<{ deleted: true }>(
    fetcher,
    `/api/projects/${encodeURIComponent(projectId)}`,
    { method: "DELETE" },
  );
  notifyProjectsChanged();
}

function notifyProjectsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
}

export function observeProjects(onchange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(PROJECTS_CHANGED_EVENT, onchange);
  return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, onchange);
}

const PROJECT_BUSINESS_FIELD = "__projectBusiness";
const PROJECT_SERVICES_FIELD = "__projectServices";
const PROJECT_TAGS_FIELD = "__projectTags";
const PROJECT_RESPONSIBLES_FIELD = "__projectResponsibles";
const PROJECT_INSTALLMENTS_FIELD = "__projectInstallments";
const PROJECT_STATUS_FIELD = "__projectStatus";
const PROJECT_SOURCE_SERVICE_FIELD = "__projectSourceServiceId";
const PROJECT_INSTITUTIONAL_FIELD = "__projectInstitutional";

export type ProjectRecordRelations = {
  business?: ProjectBusiness;
  services: ProjectServiceSummary[];
  tags: ProjectTag[];
  responsibles: ProjectResponsible[];
  installments: ProjectInstallment[];
  sourceServiceId: string | null;
};

function uniqueStrings(values: string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter(
      (value, index, all) =>
        Boolean(value) &&
        all.findIndex(
          (candidate) =>
            candidate.toLocaleLowerCase("pt-BR") ===
            value.toLocaleLowerCase("pt-BR"),
        ) === index,
    );
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

function parseObject<T>(value: string | undefined): T | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as T) : undefined;
  } catch {
    return undefined;
  }
}

function formatCents(cents: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(cents) ? cents : 0));
  return `${Math.floor(safe / 100).toLocaleString("pt-BR")},${String(safe % 100).padStart(2, "0")}`;
}

function moneyToCents(value: string | undefined): number {
  const raw = (value ?? "").trim().replace(/\s|R\$/giu, "");
  if (!raw) return 0;
  const negative = raw.includes("-");
  const decimalSeparator = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
  let digits: string;
  if (
    decimalSeparator >= 0 &&
    raw.length - decimalSeparator - 1 >= 1 &&
    raw.length - decimalSeparator - 1 <= 2
  ) {
    const integer = raw.slice(0, decimalSeparator).replace(/\D/gu, "") || "0";
    const decimal = raw
      .slice(decimalSeparator + 1)
      .replace(/\D/gu, "")
      .padEnd(2, "0")
      .slice(0, 2);
    digits = `${integer}${decimal}`;
  } else {
    digits = `${raw.replace(/\D/gu, "")}00`;
  }
  const cents = Number(digits);
  return Number.isSafeInteger(cents) ? (negative ? -cents : cents) : 0;
}

function normalizeDate(value: string | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const match =
    /^(?:(\d{2})[./](\d{2})[./](\d{4})|(\d{4})-(\d{2})-(\d{2}))$/u.exec(raw);
  if (!match) return null;
  const year = Number(match[3] ?? match[4]);
  const month = Number(match[2] ?? match[5]);
  const day = Number(match[1] ?? match[6]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

function displayInstallments(installments: ProjectInstallment[]): string {
  return JSON.stringify(
    installments.map(({ number, dueDate, amountCents, status }) => ({
      number,
      due_date: dueDate,
      amount: formatCents(amountCents),
      status,
    })),
  );
}

function installmentInputs(
  value: string | undefined,
  fallback: ProjectInstallment[],
): ProjectInstallmentInput[] {
  const parsed = parseArray<Record<string, unknown>>(value);
  const source: Record<string, unknown>[] =
    value === undefined
      ? fallback.map((installment) => ({ ...installment }))
      : parsed;
  return source.flatMap((item, index) => {
    const dueDateValue =
      typeof item.dueDate === "string"
        ? item.dueDate
        : typeof item.due_date === "string"
          ? item.due_date
          : "";
    const dueDate = normalizeDate(dueDateValue);
    if (!dueDate) return [];
    const amountCents =
      typeof item.amountCents === "number"
        ? Math.max(0, Math.round(item.amountCents))
        : moneyToCents(
            typeof item.amount === "string" ? item.amount : undefined,
          );
    const number =
      typeof item.number === "number" && Number.isInteger(item.number)
        ? item.number
        : index + 1;
    return [
      {
        number: Math.max(1, number),
        dueDate,
        amountCents,
        status: typeof item.status === "string" ? item.status : "pending",
      },
    ];
  });
}

export function projectToEntityRecord(project: Project): EntityRecord {
  const serviceNames = project.services.map(({ name }) => name);
  const responsibleNames = project.responsibles.map(({ name }) => name);
  const tagLabels = project.tags.map(({ name }) => name);
  const installments = displayInstallments(project.installments);
  const contractType =
    project.contractType === "recurring" ? "Recorrente" : "Pontual";
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: project.archivedAt ?? "",
    nome: project.name,
    name: project.name,
    negocioId: project.business.id,
    business_id: project.business.id,
    negocio: project.business.name,
    business_name: project.business.name,
    businessWorkspaceId: project.workspaceId,
    business_workspace_id: project.workspaceId,
    servicos: serviceNames.join(", "),
    service_tags: serviceNames.join(", "),
    serviceIds: JSON.stringify(project.services.map(({ id }) => id)),
    sourceServiceId: project.sourceServiceId ?? "",
    isInstitutional: String(project.isInstitutional),
    status: project.archivedAt ? "arquivado" : project.status,
    dataInicio: project.startDate,
    start_date: project.startDate,
    dataFim: project.endDate ?? "",
    delivery_date: project.endDate ?? "",
    prazo: project.endDate ?? "",
    briefing: project.briefing,
    description: project.briefing,
    descricao: project.briefing,
    tags: tagLabels.join(", "),
    tagLabels: JSON.stringify(tagLabels),
    responsaveis: responsibleNames.join(", "),
    responsavel: responsibleNames.join(", "),
    responsibleUserIds: JSON.stringify(
      project.responsibles.map(({ userId }) => userId),
    ),
    tipoContrato: contractType,
    contract_type: project.contractType,
    valor: formatCents(project.amountCents),
    amount: formatCents(project.amountCents),
    amountCents: String(project.amountCents),
    primeiroVencimento: project.firstDueDate ?? "",
    payment_date: project.firstDueDate ?? "",
    parcelas: String(Math.max(1, project.installments.length)),
    installments_count: String(Math.max(1, project.installments.length)),
    installments,
    parcelasDetalhadas: installments,
    paymentMethod: project.paymentMethod,
    paymentTerms: project.paymentTerms,
    financeNotes: project.financeNotes,
    [PROJECT_BUSINESS_FIELD]: JSON.stringify(project.business),
    [PROJECT_SERVICES_FIELD]: JSON.stringify(project.services),
    [PROJECT_TAGS_FIELD]: JSON.stringify(project.tags),
    [PROJECT_RESPONSIBLES_FIELD]: JSON.stringify(project.responsibles),
    [PROJECT_INSTALLMENTS_FIELD]: JSON.stringify(project.installments),
    [PROJECT_STATUS_FIELD]: project.status,
    [PROJECT_SOURCE_SERVICE_FIELD]: project.sourceServiceId ?? "",
    [PROJECT_INSTITUTIONAL_FIELD]: String(project.isInstitutional),
  };
}

export function projectRelationsFromRecord(
  record: EntityRecord | undefined,
): ProjectRecordRelations {
  return {
    business: parseObject<ProjectBusiness>(record?.[PROJECT_BUSINESS_FIELD]),
    services: parseArray<ProjectServiceSummary>(
      record?.[PROJECT_SERVICES_FIELD],
    ),
    tags: parseArray<ProjectTag>(record?.[PROJECT_TAGS_FIELD]),
    responsibles: parseArray<ProjectResponsible>(
      record?.[PROJECT_RESPONSIBLES_FIELD],
    ),
    installments: parseArray<ProjectInstallment>(
      record?.[PROJECT_INSTALLMENTS_FIELD],
    ),
    sourceServiceId:
      record?.[PROJECT_SOURCE_SERVICE_FIELD] || record?.sourceServiceId || null,
  };
}

export function entityValuesToProjectInput(
  values: Record<string, string>,
  current?: EntityRecord,
): ProjectMutationInput {
  const relations = projectRelationsFromRecord(current);
  const serviceIds = parseArray<unknown>(
    values.serviceIds ?? current?.serviceIds,
  ).filter((value): value is string => typeof value === "string");
  const responsibleUserIds = parseArray<unknown>(
    values.responsibleUserIds ?? current?.responsibleUserIds,
  ).filter((value): value is string => typeof value === "string");
  const explicitTags = parseArray<unknown>(
    values.tagLabels ?? current?.tagLabels,
  ).filter((value): value is string => typeof value === "string");
  const tagLabels =
    values.tagLabels !== undefined || current?.tagLabels !== undefined
      ? explicitTags
      : uniqueStrings((values.tags ?? current?.tags ?? "").split(/[,;]+/u));
  const selectedStatus = values.status?.trim() ?? "";
  const contractValue =
    values.contract_type ?? values.tipoContrato ?? current?.contract_type;

  return {
    name: (values.nome ?? values.name ?? "").trim(),
    businessId: (
      values.negocioId ??
      values.business_id ??
      current?.negocioId ??
      ""
    ).trim(),
    serviceIds: uniqueStrings(serviceIds),
    status:
      selectedStatus === "arquivado"
        ? current?.[PROJECT_STATUS_FIELD] || "concluido"
        : selectedStatus,
    startDate: normalizeDate(values.dataInicio ?? values.start_date) ?? "",
    endDate: normalizeDate(values.dataFim ?? values.delivery_date),
    briefing: (
      values.briefing ??
      values.description ??
      values.descricao ??
      ""
    ).trim(),
    tagLabels: uniqueStrings(tagLabels),
    responsibleUserIds: uniqueStrings(responsibleUserIds),
    contractType:
      contractValue === "recurring" ||
      contractValue?.toLocaleLowerCase("pt-BR") === "recorrente"
        ? "recurring"
        : "one_off",
    amountCents:
      values.amountCents && /^\d+$/u.test(values.amountCents)
        ? Number(values.amountCents)
        : moneyToCents(values.valor ?? values.amount),
    firstDueDate: normalizeDate(
      values.primeiroVencimento ?? values.payment_date,
    ),
    paymentMethod: (
      values.paymentMethod ??
      current?.paymentMethod ??
      ""
    ).trim(),
    paymentTerms: (values.paymentTerms ?? current?.paymentTerms ?? "").trim(),
    financeNotes: (values.financeNotes ?? current?.financeNotes ?? "").trim(),
    installments: installmentInputs(
      values.installments ?? values.parcelasDetalhadas,
      relations.installments,
    ),
  };
}

export function entityValuesToProjectFromServiceInput(
  values: Record<string, string>,
  current?: EntityRecord,
): ProjectFromServiceInput {
  const project = entityValuesToProjectInput(values, current);
  const serviceId =
    values.sourceServiceId ||
    current?.[PROJECT_SOURCE_SERVICE_FIELD] ||
    current?.sourceServiceId ||
    "";
  const input: ProjectFromServiceInput = {
    serviceId,
    additionalServiceIds: project.serviceIds.filter((id) => id !== serviceId),
    name: project.name,
    businessId: project.businessId,
    startDate: project.startDate,
  };

  const hasOverrideMarker = Object.hasOwn(values, "sourceOverrideFields");
  const overrideFields = new Set(
    parseArray<unknown>(values.sourceOverrideFields).filter(
      (field): field is string => typeof field === "string",
    ),
  );
  const includes = (field: string): boolean =>
    !hasOverrideMarker || overrideFields.has(field);

  if (includes("endDate")) input.endDate = project.endDate;
  if (includes("status")) input.status = project.status;
  if (includes("briefing")) input.briefing = project.briefing;
  if (includes("tagLabels")) input.tagLabels = project.tagLabels;
  if (includes("responsibleUserIds")) {
    input.responsibleUserIds = project.responsibleUserIds;
  }
  if (includes("contractType")) input.contractType = project.contractType;
  if (includes("amountCents")) input.amountCents = project.amountCents;
  if (includes("firstDueDate")) input.firstDueDate = project.firstDueDate;
  if (includes("paymentMethod")) input.paymentMethod = project.paymentMethod;
  if (includes("paymentTerms")) input.paymentTerms = project.paymentTerms;
  if (includes("financeNotes")) input.financeNotes = project.financeNotes;
  if (includes("installments")) input.installments = project.installments;

  return input;
}
