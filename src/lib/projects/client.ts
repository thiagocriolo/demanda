import type { EntityRecord } from "../entities/types";
import { centsToMoney as formatCents } from "../finance/money";
import {
  jsonRequest,
  requestJson as fetchJson,
  type FetchLike,
} from "../http/client";
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
  ProjectList,
  ProjectMutationInput,
  ProjectOptions,
  ProjectResponsible,
  ProjectServiceSummary,
  ProjectTag,
  Service,
  ServiceMutationInput,
} from "./types";

export const PROJECTS_CHANGED_EVENT = "demanda:projects-changed";
export type { FetchLike };

export class ProjectApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProjectApiError";
  }
}

function requestJson<T>(
  fetcher: FetchLike,
  input: string,
  init?: RequestInit,
): Promise<T> {
  return fetchJson<T>(fetcher, input, init, {
    fallbackMessage: "Não foi possível concluir a operação com o projeto.",
    createError: (status, message) => new ProjectApiError(status, message),
  });
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
  includeInactive?: boolean;
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
  if (options.includeInactive) params.set("includeInactive", "true");
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

export async function createService(
  input: ServiceMutationInput,
  fetcher: FetchLike = fetch,
): Promise<Service> {
  return requestJson<Service>(fetcher, "/api/services", jsonRequest("POST", input));
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

export async function setProjectActive(
  projectId: string,
  isActive: boolean,
  fetcher: FetchLike = fetch,
): Promise<Project> {
  const project = await requestJson<Project>(
    fetcher,
    `/api/projects/${encodeURIComponent(projectId)}/active`,
    jsonRequest("PUT", { isActive }),
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
    ...(project.contract
      ? { contractId: project.contract.id, contractName: project.contract.name }
      : {}),
    servicos: serviceNames.join(", "),
    service_tags: serviceNames.join(", "),
    serviceIds: JSON.stringify(project.services.map(({ id }) => id)),
    sourceServiceId: project.sourceServiceId ?? "",
    isInstitutional: String(project.isInstitutional),
    isActive: String(project.isActive),
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
  const serviceIds = parseArray<unknown>(
    values.serviceIds ?? current?.serviceIds,
  ).filter((value): value is string => typeof value === "string");
  const explicitTags = parseArray<unknown>(
    values.tagLabels ?? current?.tagLabels,
  ).filter((value): value is string => typeof value === "string");
  const tagLabels =
    values.tagLabels !== undefined || current?.tagLabels !== undefined
      ? explicitTags
      : uniqueStrings((values.tags ?? current?.tags ?? "").split(/[,;]+/u));
  const selectedStatus = values.status?.trim() ?? "";
  const contractId = (values.contractId ?? current?.contractId ?? "").trim();
  const businessId = (
    values.negocioId ??
    values.business_id ??
    current?.negocioId ??
    ""
  ).trim();

  return {
    name: (values.nome ?? values.name ?? "").trim(),
    ...(contractId ? { contractId } : {}),
    ...(businessId ? { businessId } : {}),
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
    ...(["fee", "personal"].includes(
      (values.tipoEngajamento ?? values.engagementType ?? "").toLocaleLowerCase(
        "pt-BR",
      ),
    )
      ? {
          engagementType: (values.tipoEngajamento ?? values.engagementType)
            .toLocaleLowerCase("pt-BR") as "fee" | "personal",
        }
      : {}),
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
    ...(project.contractId ? { contractId: project.contractId } : {}),
    ...(project.businessId ? { businessId: project.businessId } : {}),
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

  return input;
}
