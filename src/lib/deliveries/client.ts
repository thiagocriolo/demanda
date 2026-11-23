import type { EntityRecord } from "$lib/entities/types";
import {
  jsonRequest,
  requestJson as fetchJson,
  type FetchLike,
} from "../http/client";
import { PROJECTS_CHANGED_EVENT } from "../projects/client";
import type { ProjectResponsible, ProjectTag } from "$lib/projects/types";
import {
  isGlobalWorkspaceScope,
  workspaceIdsForRequestScope,
} from "../workspaces/workspace-scope";
import {
  loadGlobalWorkspaceList,
  mergeCountRecords,
} from "../workspaces/global-list";
import type {
  Delivery,
  DeliveryBoardMutationInput,
  DeliveryBoardMutationResult,
  DeliveryBoardOrder,
  DeliveryBoardView,
  DeliveryContentInput,
  DeliveryCreateInput,
  DeliveryList,
  DeliveryStateInput,
  DeliveryTaskInput,
  DeliveryTaskStateInput,
  DeliveryUpdateInput,
} from "./types";

export const DELIVERIES_CHANGED_EVENT = "demanda:deliveries-changed";
export type { FetchLike };

export class DeliveryApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DeliveryApiError";
  }
}

function requestJson<T>(
  fetcher: FetchLike,
  input: string,
  init?: RequestInit,
): Promise<T> {
  return fetchJson<T>(fetcher, input, init, {
    fallbackMessage: "Não foi possível concluir a operação com a entrega.",
    createError: (status, message) => new DeliveryApiError(status, message),
  });
}

export type DeliveryListOptions = {
  workspaceId?: string;
  page?: number;
  pageSize?: number;
  query?: string;
  status?: string;
  priority?: string;
  category?: string;
  projectId?: string;
  businessId?: string;
  responsibleUserId?: string;
  tagId?: string;
  dueFrom?: string;
  dueTo?: string;
  orderBy?: "updated" | "name_asc" | "name_desc" | "due_asc" | "due_desc";
  archived?: "exclude" | "include" | "only";
  includeInactiveProjects?: boolean;
  signal?: AbortSignal;
};

async function listDeliveriesForWorkspace(
  options: DeliveryListOptions = {},
  fetcher: FetchLike = fetch,
): Promise<DeliveryList> {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 50),
    archived: options.archived ?? "exclude",
  });
  const stringFilters = {
    query: options.query?.trim(),
    workspaceId: options.workspaceId,
    status: options.status,
    priority: options.priority,
    category: options.category,
    projectId: options.projectId,
    businessId: options.businessId,
    responsibleUserId: options.responsibleUserId,
    tagId: options.tagId,
    dueFrom: options.dueFrom,
    dueTo: options.dueTo,
    orderBy: options.orderBy,
  };
  for (const [key, value] of Object.entries(stringFilters)) {
    if (value) params.set(key, value);
  }
  if (options.includeInactiveProjects) {
    params.set("includeInactiveProjects", "true");
  }
  return requestJson<DeliveryList>(fetcher, `/api/deliveries?${params}`, {
    signal: options.signal,
  });
}

function compareDeliveries(left: Delivery, right: Delivery, orderBy = "updated"): number {
  if (orderBy === "name_asc" || orderBy === "name_desc") {
    const value = left.name.localeCompare(right.name, "pt-BR", {
      sensitivity: "base",
    });
    return (
      (orderBy === "name_desc" ? -value : value) ||
      left.id.localeCompare(right.id)
    );
  }
  if (orderBy === "due_asc" || orderBy === "due_desc") {
    if (!left.dueDate && !right.dueDate) return left.id.localeCompare(right.id);
    if (!left.dueDate) return 1;
    if (!right.dueDate) return -1;
    const value = left.dueDate.localeCompare(right.dueDate);
    return (
      (orderBy === "due_desc" ? -value : value) ||
      left.id.localeCompare(right.id)
    );
  }
  return (
    right.updatedAt.localeCompare(left.updatedAt) ||
    right.id.localeCompare(left.id)
  );
}

export async function listDeliveries(
  options: DeliveryListOptions = {},
  fetcher: FetchLike = fetch,
): Promise<DeliveryList> {
  const workspaceIds = workspaceIdsForRequestScope();
  if (!options.workspaceId && isGlobalWorkspaceScope() && workspaceIds.length) {
    return loadGlobalWorkspaceList({
      workspaceIds,
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 50,
      loadPage: (workspaceId, page, pageSize) =>
        listDeliveriesForWorkspace(
          { ...options, workspaceId, page, pageSize },
          fetcher,
        ),
      compare: (left, right) =>
        compareDeliveries(left, right, options.orderBy ?? "updated"),
      mergeFacets: (facets) => ({
        all: facets.reduce((total, item) => total + item.all, 0),
        archived: facets.reduce((total, item) => total + item.archived, 0),
        statuses: mergeCountRecords(facets.map(({ statuses }) => statuses)),
        priorities: mergeCountRecords(
          facets.map(({ priorities }) => priorities),
        ),
        categories: mergeCountRecords(
          facets.map(({ categories }) => categories),
        ),
        projects: mergeCountRecords(facets.map(({ projects }) => projects)),
      }),
    });
  }
  return listDeliveriesForWorkspace(options, fetcher);
}

export async function listAllDeliveries(
  options: Omit<DeliveryListOptions, "page" | "pageSize"> = {},
  fetcher: FetchLike = fetch,
): Promise<Delivery[]> {
  if (!options.workspaceId && isGlobalWorkspaceScope()) {
    const deliveries = (
      await Promise.all(
        workspaceIdsForRequestScope().map((workspaceId) =>
          listAllDeliveries({ ...options, workspaceId }, fetcher),
        ),
      )
    ).flat();
    return deliveries.toSorted((left, right) =>
      compareDeliveries(left, right, options.orderBy ?? "updated"),
    );
  }
  const first = await listDeliveries(
    { ...options, page: 1, pageSize: 100 },
    fetcher,
  );
  const workspaceId = first.workspaceId;
  const deliveries: Delivery[] = [];
  const seen = new Set<string>();

  const append = (result: DeliveryList): void => {
    if (
      result.workspaceId !== workspaceId ||
      result.items.some((delivery) => delivery.workspaceId !== workspaceId)
    ) {
      throw new DeliveryApiError(
        409,
        "O workspace mudou durante o carregamento das tarefas. Tente novamente.",
      );
    }
    for (const delivery of result.items) {
      if (seen.has(delivery.id)) continue;
      seen.add(delivery.id);
      deliveries.push(delivery);
    }
  };

  append(first);
  for (let page = 2; page <= first.totalPages; page += 1) {
    append(await listDeliveries({ ...options, page, pageSize: 100 }, fetcher));
  }
  return deliveries;
}

export function getDelivery(
  deliveryId: string,
  fetcher: FetchLike = fetch,
): Promise<Delivery> {
  return requestJson<Delivery>(fetcher, `/api/deliveries/${encodeURIComponent(deliveryId)}`);
}

export async function createDelivery(
  input: DeliveryCreateInput,
  fetcher: FetchLike = fetch,
): Promise<Delivery> {
  const delivery = await requestJson<Delivery>(
    fetcher,
    "/api/deliveries",
    jsonRequest("POST", input),
  );
  notifyDeliveriesChanged();
  return delivery;
}

export async function updateDelivery(
  deliveryId: string,
  input: DeliveryUpdateInput,
  fetcher: FetchLike = fetch,
): Promise<Delivery> {
  const delivery = await requestJson<Delivery>(
    fetcher,
    `/api/deliveries/${encodeURIComponent(deliveryId)}`,
    jsonRequest("PUT", input),
  );
  notifyDeliveriesChanged();
  return delivery;
}

export async function setDeliveryState(
  deliveryId: string,
  input: DeliveryStateInput,
  fetcher: FetchLike = fetch,
): Promise<Delivery> {
  const delivery = await requestJson<Delivery>(
    fetcher,
    `/api/deliveries/${encodeURIComponent(deliveryId)}/state`,
    jsonRequest("PUT", input),
  );
  notifyDeliveriesChanged();
  return delivery;
}

export async function setDeliveryTaskState(
  deliveryId: string,
  taskId: string,
  input: DeliveryTaskStateInput,
  fetcher: FetchLike = fetch,
): Promise<Delivery> {
  const delivery = await requestJson<Delivery>(
    fetcher,
    `/api/deliveries/${encodeURIComponent(deliveryId)}/tasks/${encodeURIComponent(taskId)}/state`,
    jsonRequest("PUT", input),
  );
  notifyDeliveriesChanged();
  return delivery;
}

export async function archiveDelivery(
  deliveryId: string,
  version: number,
  fetcher: FetchLike = fetch,
): Promise<Delivery> {
  const delivery = await requestJson<Delivery>(
    fetcher,
    `/api/deliveries/${encodeURIComponent(deliveryId)}?version=${encodeURIComponent(String(version))}`,
    { method: "PATCH" },
  );
  notifyDeliveriesChanged();
  return delivery;
}

export async function deleteDelivery(
  deliveryId: string,
  version: number,
  fetcher: FetchLike = fetch,
): Promise<void> {
  await requestJson<{ deleted: true }>(
    fetcher,
    `/api/deliveries/${encodeURIComponent(deliveryId)}?version=${encodeURIComponent(String(version))}`,
    { method: "DELETE" },
  );
  notifyDeliveriesChanged();
}

export async function updateDeliveryBoard(
  input: DeliveryBoardMutationInput,
  fetcher: FetchLike = fetch,
): Promise<DeliveryBoardMutationResult> {
  const result = await requestJson<DeliveryBoardMutationResult>(
    fetcher,
    "/api/deliveries/board",
    jsonRequest("PUT", input),
  );
  notifyDeliveriesChanged();
  return result;
}

function notifyDeliveriesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DELIVERIES_CHANGED_EVENT));
  window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
}

export function observeDeliveries(onchange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(DELIVERIES_CHANGED_EVENT, onchange);
  return () => window.removeEventListener(DELIVERIES_CHANGED_EVENT, onchange);
}

const DELIVERY_TAGS_FIELD = "__deliveryTags";
const DELIVERY_RESPONSIBLES_FIELD = "__deliveryResponsibles";
const DELIVERY_STATUS_FIELD = "__deliveryStatus";
const DELIVERY_VERSION_FIELD = "__deliveryVersion";
const DELIVERY_BOARD_ORDER_FIELD = "__deliveryBoardOrder";

function durationHours(minutes: number): string {
  const hours = Math.max(0, minutes) / 60;
  return Number.isInteger(hours)
    ? String(hours)
    : String(Math.round(hours * 100) / 100);
}

export function deliveryToEntityRecord(delivery: Delivery): EntityRecord {
  const responsibleNames = delivery.responsibles.map(({ name }) => name);
  const responsibleIds = delivery.responsibles.map(({ userId }) => userId);
  const tagLabels = delivery.tags.map(({ name }) => name);
  const tasks = delivery.tasks.map((task) => ({
    id: task.id,
    nome: task.name,
    duracao: durationHours(task.durationMinutes),
    durationMinutes: task.durationMinutes,
    ...(task.executionAt ? { executionAt: task.executionAt } : {}),
    status: task.status,
    sequence: task.sortOrder,
  }));
  const boardOrder = JSON.stringify(delivery.boardOrder);
  const pautaOrder = JSON.stringify({
    ...delivery.boardOrder,
    ...(delivery.boardOrder.business === undefined
      ? {}
      : { client: delivery.boardOrder.business }),
    business: undefined,
  });
  return {
    id: delivery.id,
    workspaceId: delivery.workspaceId,
    workspace_id: delivery.workspaceId,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
    archivedAt: delivery.archivedAt ?? "",
    completedAt: delivery.completedAt ?? "",
    nome: delivery.name,
    name: delivery.name,
    negocio: delivery.business.name,
    negocioId: delivery.business.id,
    negocio_id: delivery.business.id,
    business_id: delivery.business.id,
    business_name: delivery.business.name,
    businessArchivedAt: delivery.business.archivedAt ?? "",
    businessWorkspaceId: delivery.workspaceId,
    business_workspace_id: delivery.workspaceId,
    projeto: delivery.project.name,
    projetoId: delivery.project.id,
    projeto_id: delivery.project.id,
    project_id: delivery.project.id,
    project_name: delivery.project.name,
    projectStatus: delivery.project.status,
    projectArchivedAt: delivery.project.archivedAt ?? "",
    projectWorkspaceId: delivery.workspaceId,
    project_workspace_id: delivery.workspaceId,
    categoria: delivery.category,
    stage: delivery.category,
    prioridade: delivery.priority,
    priority: delivery.priority,
    status: delivery.archivedAt ? "arquivado" : delivery.status,
    descricao: delivery.briefing,
    briefing: delivery.briefing,
    responsavel: responsibleNames.join(", "),
    responsaveis: responsibleNames.join(", "),
    responsavelId: responsibleIds[0] ?? "",
    assigned_user_id: responsibleIds[0] ?? "",
    responsibleAvatarUrl: delivery.responsibles[0]?.avatarUrl ?? "",
    responsibleUserIds: JSON.stringify(responsibleIds),
    tags: tagLabels.join(", "),
    tagLabels: JSON.stringify(tagLabels),
    dataEntrega: delivery.dueDate ?? "",
    data_entrega: delivery.dueDate ?? "",
    dueDate: delivery.dueDate ?? "",
    due_date: delivery.dueDate ?? "",
    tipoEngajamento: delivery.engagementType === "fee" ? "Fee" : "Pessoal",
    engagementType: delivery.engagementType ?? "personal",
    duracao: durationHours(delivery.durationMinutes),
    duration: durationHours(delivery.durationMinutes),
    durationMinutes: String(delivery.durationMinutes),
    sortOrder: String(delivery.sortOrder),
    ordem: String(delivery.sortOrder),
    pautaOrderByView: pautaOrder,
    tarefas: JSON.stringify(tasks),
    version: String(delivery.version),
    [DELIVERY_TAGS_FIELD]: JSON.stringify(delivery.tags),
    [DELIVERY_RESPONSIBLES_FIELD]: JSON.stringify(delivery.responsibles),
    [DELIVERY_STATUS_FIELD]: delivery.status,
    [DELIVERY_VERSION_FIELD]: String(delivery.version),
    [DELIVERY_BOARD_ORDER_FIELD]: boardOrder,
  };
}

export type DeliveryRecordRelations = {
  tags: ProjectTag[];
  responsibles: ProjectResponsible[];
};

export function deliveryRelationsFromRecord(
  record?: EntityRecord,
): DeliveryRecordRelations {
  return {
    tags: parseArray<ProjectTag>(record?.[DELIVERY_TAGS_FIELD]),
    responsibles: parseArray<ProjectResponsible>(
      record?.[DELIVERY_RESPONSIBLES_FIELD],
    ),
  };
}

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

function parseBoardOrder(value: string | undefined): DeliveryBoardOrder {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const result: DeliveryBoardOrder = {};
    for (const view of ["status", "priority", "business", "project"] as const) {
      const order =
        (parsed as Record<string, unknown>)[view] ??
        (view === "business"
          ? (parsed as Record<string, unknown>).client
          : undefined);
      if (typeof order === "number" && Number.isInteger(order) && order >= 0) {
        result[view] = order;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function integer(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizedDate(value: string | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? raw
    : null;
}

function hoursToMinutes(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed)) return 60;
  return Math.min(10_080, Math.max(30, Math.round((parsed * 60) / 30) * 30));
}

function taskInputs(
  value: string | undefined,
  fallbackName: string,
): DeliveryTaskInput[] {
  const parsed = parseArray<Record<string, unknown>>(value);
  const tasks = parsed.slice(0, 50).flatMap((item): DeliveryTaskInput[] => {
    const name =
      typeof item.nome === "string"
        ? item.nome.trim()
        : typeof item.name === "string"
          ? item.name.trim()
          : "";
    if (!name) return [];
    const durationMinutes =
      typeof item.durationMinutes === "number"
        ? Math.min(
            10_080,
            Math.max(30, Math.round(item.durationMinutes / 30) * 30),
          )
        : hoursToMinutes(item.duracao ?? item.duration ?? item.duration_hours);
    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : undefined;
    const executionAt =
      typeof item.executionAt === "string" && item.executionAt.trim()
        ? item.executionAt.trim()
        : null;
    return [
      {
        ...(id ? { id } : {}),
        name,
        durationMinutes,
        ...(executionAt ? { executionAt } : {}),
        status:
          typeof item.status === "string" && item.status.trim()
            ? item.status.trim()
            : "pendente",
      },
    ];
  });
  return tasks.length
    ? tasks
    : [
        {
          name: fallbackName || "Atividade principal",
          durationMinutes: 60,
          status: "pendente",
        },
      ];
}

function recordVersion(record?: EntityRecord): number {
  const version = Number(record?.[DELIVERY_VERSION_FIELD] ?? record?.version);
  return Number.isInteger(version) && version >= 1 ? version : 0;
}

function canonicalUpdateTasks(
  tasks: DeliveryTaskInput[],
  current: EntityRecord,
): DeliveryTaskInput[] {
  const currentIds = new Set(
    taskInputs(current.tarefas, current.nome).flatMap(({ id }) =>
      id ? [id] : [],
    ),
  );
  return tasks.map(({ id, ...task }) =>
    id && currentIds.has(id) ? { id, ...task } : task,
  );
}

export function deliveryVersionFromRecord(record?: EntityRecord): number {
  return recordVersion(record);
}

function mutationFields(
  values: Record<string, string>,
  current?: EntityRecord,
): DeliveryContentInput & { status: string } {
  const name = (values.nome ?? values.name ?? current?.nome ?? "").trim();
  const explicitResponsibleIds = parseArray<unknown>(
    values.responsibleUserIds ?? current?.responsibleUserIds,
  ).filter((value): value is string => typeof value === "string");
  const fallbackResponsibleId =
    values.responsavelId ??
    values.assigned_user_id ??
    current?.responsavelId ??
    current?.assigned_user_id;
  const responsibleUserIds = uniqueStrings(
    explicitResponsibleIds.length
      ? explicitResponsibleIds
      : fallbackResponsibleId
        ? [fallbackResponsibleId]
        : [],
  ).slice(0, 1);
  const explicitTags = parseArray<unknown>(
    values.tagLabels ?? current?.tagLabels,
  ).filter((value): value is string => typeof value === "string");
  const tagLabels = uniqueStrings(
    explicitTags.length || values.tagLabels !== undefined
      ? explicitTags
      : (values.tags ?? current?.tags ?? "").split(/[,;]+/u),
  );
  const selectedStatus = (
    values.status ??
    current?.status ??
    "planejamento"
  ).trim();
  const status =
    selectedStatus === "arquivado"
      ? current?.[DELIVERY_STATUS_FIELD] || "conclusao"
      : selectedStatus;
  const boardOrder = parseBoardOrder(
    values.pautaOrderByView ??
      values[DELIVERY_BOARD_ORDER_FIELD] ??
      current?.[DELIVERY_BOARD_ORDER_FIELD] ??
      current?.pautaOrderByView,
  );
  const tasks = taskInputs(
    values.tarefas ?? current?.tarefas,
    name,
  );

  return {
    name,
    projectId: (
      values.projetoId ??
      values.projeto_id ??
      values.project_id ??
      current?.projetoId ??
      current?.project_id ??
      ""
    ).trim() || undefined,
    institutionalContractId: (
      values.institutionalContractId ?? current?.institutionalContractId ?? ""
    ).trim() || undefined,
    category: (
      values.categoria ??
      values.stage ??
      current?.categoria ??
      ""
    ).trim(),
    priority: (
      values.prioridade ??
      values.priority ??
      current?.prioridade ??
      "normal"
    ).trim(),
    status,
    briefing: (
      values.descricao ??
      values.briefing ??
      current?.descricao ??
      current?.briefing ??
      ""
    ).trim(),
    dueDate: normalizedDate(
      values.dataEntrega ??
        values.data_entrega ??
        values.dueDate ??
        values.due_date ??
        current?.dataEntrega ??
        current?.dueDate,
    ),
    engagementType:
      (values.tipoEngajamento ?? values.engagementType ?? "")
        .toLocaleLowerCase("pt-BR") === "fee"
        ? "fee"
        : "personal",
    sortOrder: integer(
      values.sortOrder ?? values.ordem ?? current?.sortOrder ?? current?.ordem,
    ),
    boardOrder,
    tagLabels,
    responsibleUserIds,
    tasks,
  };
}

export function entityValuesToDeliveryCreateInput(
  values: Record<string, string>,
  current?: EntityRecord,
  _options: { copy?: boolean } = {},
): DeliveryCreateInput {
  const input = mutationFields(values, current);
  return {
    ...input,
    // New deliveries enter the board without a claimed position. The transactional
    // board endpoint is the only writer allowed to assign column positions.
    boardOrder: {},
    // Form IDs are temporary UI keys. The server creates canonical UUIDs.
    tasks: input.tasks.map(({ id: _id, ...task }) => task),
  };
}

export function entityValuesToDeliveryUpdateInput(
  values: Record<string, string>,
  current: EntityRecord,
): DeliveryUpdateInput {
  const fields = mutationFields(values, current);
  const { boardOrder: _boardOrder, ...content } = fields;
  return {
    ...content,
    tasks: canonicalUpdateTasks(fields.tasks, current),
    version: recordVersion(current),
  };
}

export async function updateDeliveryFromEntityValues(
  deliveryId: string,
  values: Record<string, string>,
  current: EntityRecord,
  fetcher: FetchLike = fetch,
): Promise<Delivery> {
  return updateDelivery(
    deliveryId,
    entityValuesToDeliveryUpdateInput(values, current),
    fetcher,
  );
}

export function withDeliveryBoardOrder(
  record: EntityRecord,
  view: DeliveryBoardView | "client",
  order: number,
): EntityRecord {
  const serverView = view === "client" ? "business" : view;
  const boardOrder = {
    ...parseBoardOrder(
      record[DELIVERY_BOARD_ORDER_FIELD] ?? record.pautaOrderByView,
    ),
    [serverView]: Math.max(0, Math.trunc(order)),
  };
  const serialized = JSON.stringify(boardOrder);
  const pautaSerialized = JSON.stringify({
    ...boardOrder,
    ...(boardOrder.business === undefined
      ? {}
      : { client: boardOrder.business }),
    business: undefined,
  });
  return {
    ...record,
    pautaOrderByView: pautaSerialized,
    [DELIVERY_BOARD_ORDER_FIELD]: serialized,
  };
}
