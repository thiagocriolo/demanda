import type { EntityRecord } from "$lib/entities/types";
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
  Task,
  TaskBoardMutationInput,
  TaskBoardMutationResult,
  TaskBoardOrder,
  TaskBoardView,
  TaskContentInput,
  TaskCreateInput,
  TaskList,
  TaskStateInput,
  TaskSubtaskInput,
  TaskSubtaskStateInput,
  TaskUpdateInput,
} from "./types";

export const TASKS_CHANGED_EVENT = "demanda:tasks-changed";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class TaskApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TaskApiError";
  }
}

async function requestJson<T>(
  fetcher: FetchLike,
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    let message = "Não foi possível concluir a operação com a tarefa.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // A mensagem genérica também cobre respostas sem JSON.
    }
    throw new TaskApiError(response.status, message);
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

export type TaskListOptions = {
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
  signal?: AbortSignal;
};

async function listTasksForWorkspace(
  options: TaskListOptions = {},
  fetcher: FetchLike = fetch,
): Promise<TaskList> {
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
  return requestJson<TaskList>(fetcher, `/api/tasks?${params}`, {
    signal: options.signal,
  });
}

function compareTasks(left: Task, right: Task, orderBy = "updated"): number {
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

export async function listTasks(
  options: TaskListOptions = {},
  fetcher: FetchLike = fetch,
): Promise<TaskList> {
  const workspaceIds = workspaceIdsForRequestScope();
  if (!options.workspaceId && isGlobalWorkspaceScope() && workspaceIds.length) {
    return loadGlobalWorkspaceList({
      workspaceIds,
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 50,
      loadPage: (workspaceId, page, pageSize) =>
        listTasksForWorkspace(
          { ...options, workspaceId, page, pageSize },
          fetcher,
        ),
      compare: (left, right) =>
        compareTasks(left, right, options.orderBy ?? "updated"),
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
  return listTasksForWorkspace(options, fetcher);
}

export async function listAllTasks(
  options: Omit<TaskListOptions, "page" | "pageSize"> = {},
  fetcher: FetchLike = fetch,
): Promise<Task[]> {
  if (!options.workspaceId && isGlobalWorkspaceScope()) {
    const tasks = (
      await Promise.all(
        workspaceIdsForRequestScope().map((workspaceId) =>
          listAllTasks({ ...options, workspaceId }, fetcher),
        ),
      )
    ).flat();
    return tasks.toSorted((left, right) =>
      compareTasks(left, right, options.orderBy ?? "updated"),
    );
  }
  const first = await listTasks(
    { ...options, page: 1, pageSize: 100 },
    fetcher,
  );
  const workspaceId = first.workspaceId;
  const tasks: Task[] = [];
  const seen = new Set<string>();

  const append = (result: TaskList): void => {
    if (
      result.workspaceId !== workspaceId ||
      result.items.some((task) => task.workspaceId !== workspaceId)
    ) {
      throw new TaskApiError(
        409,
        "O workspace mudou durante o carregamento das tarefas. Tente novamente.",
      );
    }
    for (const task of result.items) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      tasks.push(task);
    }
  };

  append(first);
  for (let page = 2; page <= first.totalPages; page += 1) {
    append(await listTasks({ ...options, page, pageSize: 100 }, fetcher));
  }
  return tasks;
}

export function getTask(
  taskId: string,
  fetcher: FetchLike = fetch,
): Promise<Task> {
  return requestJson<Task>(fetcher, `/api/tasks/${encodeURIComponent(taskId)}`);
}

export async function createTask(
  input: TaskCreateInput,
  fetcher: FetchLike = fetch,
): Promise<Task> {
  const task = await requestJson<Task>(
    fetcher,
    "/api/tasks",
    jsonRequest("POST", input),
  );
  notifyTasksChanged();
  return task;
}

export async function updateTask(
  taskId: string,
  input: TaskUpdateInput,
  fetcher: FetchLike = fetch,
): Promise<Task> {
  const task = await requestJson<Task>(
    fetcher,
    `/api/tasks/${encodeURIComponent(taskId)}`,
    jsonRequest("PUT", input),
  );
  notifyTasksChanged();
  return task;
}

export async function setTaskState(
  taskId: string,
  input: TaskStateInput,
  fetcher: FetchLike = fetch,
): Promise<Task> {
  const task = await requestJson<Task>(
    fetcher,
    `/api/tasks/${encodeURIComponent(taskId)}/state`,
    jsonRequest("PUT", input),
  );
  notifyTasksChanged();
  return task;
}

export async function setTaskSubtaskState(
  taskId: string,
  subtaskId: string,
  input: TaskSubtaskStateInput,
  fetcher: FetchLike = fetch,
): Promise<Task> {
  const task = await requestJson<Task>(
    fetcher,
    `/api/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}/state`,
    jsonRequest("PUT", input),
  );
  notifyTasksChanged();
  return task;
}

export async function archiveTask(
  taskId: string,
  version: number,
  fetcher: FetchLike = fetch,
): Promise<Task> {
  const task = await requestJson<Task>(
    fetcher,
    `/api/tasks/${encodeURIComponent(taskId)}?version=${encodeURIComponent(String(version))}`,
    { method: "DELETE" },
  );
  notifyTasksChanged();
  return task;
}

export async function updateTaskBoard(
  input: TaskBoardMutationInput,
  fetcher: FetchLike = fetch,
): Promise<TaskBoardMutationResult> {
  const result = await requestJson<TaskBoardMutationResult>(
    fetcher,
    "/api/tasks/board",
    jsonRequest("PUT", input),
  );
  notifyTasksChanged();
  return result;
}

function notifyTasksChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
  window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED_EVENT));
}

export function observeTasks(onchange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(TASKS_CHANGED_EVENT, onchange);
  return () => window.removeEventListener(TASKS_CHANGED_EVENT, onchange);
}

const TASK_TAGS_FIELD = "__taskTags";
const TASK_RESPONSIBLES_FIELD = "__taskResponsibles";
const TASK_STATUS_FIELD = "__taskStatus";
const TASK_VERSION_FIELD = "__taskVersion";
const TASK_BOARD_ORDER_FIELD = "__taskBoardOrder";

function durationHours(minutes: number): string {
  const hours = Math.max(0, minutes) / 60;
  return Number.isInteger(hours)
    ? String(hours)
    : String(Math.round(hours * 100) / 100);
}

export function taskToEntityRecord(task: Task): EntityRecord {
  const responsibleNames = task.responsibles.map(({ name }) => name);
  const responsibleIds = task.responsibles.map(({ userId }) => userId);
  const tagLabels = task.tags.map(({ name }) => name);
  const subtasks = task.subtasks.map((subtask) => ({
    id: subtask.id,
    nome: subtask.name,
    duracao: durationHours(subtask.durationMinutes),
    durationMinutes: subtask.durationMinutes,
    status: subtask.status,
    sequence: subtask.sortOrder,
  }));
  const boardOrder = JSON.stringify(task.boardOrder);
  const pautaOrder = JSON.stringify({
    ...task.boardOrder,
    ...(task.boardOrder.business === undefined
      ? {}
      : { client: task.boardOrder.business }),
    business: undefined,
  });
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    workspace_id: task.workspaceId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    archivedAt: task.archivedAt ?? "",
    completedAt: task.completedAt ?? "",
    nome: task.name,
    name: task.name,
    negocio: task.business.name,
    negocioId: task.business.id,
    negocio_id: task.business.id,
    business_id: task.business.id,
    business_name: task.business.name,
    businessArchivedAt: task.business.archivedAt ?? "",
    businessWorkspaceId: task.workspaceId,
    business_workspace_id: task.workspaceId,
    projeto: task.project.name,
    projetoId: task.project.id,
    projeto_id: task.project.id,
    project_id: task.project.id,
    project_name: task.project.name,
    projectStatus: task.project.status,
    projectArchivedAt: task.project.archivedAt ?? "",
    projectWorkspaceId: task.workspaceId,
    project_workspace_id: task.workspaceId,
    categoria: task.category,
    stage: task.category,
    prioridade: task.priority,
    priority: task.priority,
    status: task.archivedAt ? "arquivado" : task.status,
    descricao: task.briefing,
    briefing: task.briefing,
    responsavel: responsibleNames.join(", "),
    responsaveis: responsibleNames.join(", "),
    responsavelId: responsibleIds[0] ?? "",
    assigned_user_id: responsibleIds[0] ?? "",
    responsibleAvatarUrl: task.responsibles[0]?.avatarUrl ?? "",
    responsibleUserIds: JSON.stringify(responsibleIds),
    tags: tagLabels.join(", "),
    tagLabels: JSON.stringify(tagLabels),
    dataEntrega: task.dueDate ?? "",
    data_entrega: task.dueDate ?? "",
    dueDate: task.dueDate ?? "",
    due_date: task.dueDate ?? "",
    duracao: durationHours(task.durationMinutes),
    duration: durationHours(task.durationMinutes),
    durationMinutes: String(task.durationMinutes),
    sortOrder: String(task.sortOrder),
    ordem: String(task.sortOrder),
    pautaOrderByView: pautaOrder,
    subtarefas: JSON.stringify(subtasks),
    version: String(task.version),
    [TASK_TAGS_FIELD]: JSON.stringify(task.tags),
    [TASK_RESPONSIBLES_FIELD]: JSON.stringify(task.responsibles),
    [TASK_STATUS_FIELD]: task.status,
    [TASK_VERSION_FIELD]: String(task.version),
    [TASK_BOARD_ORDER_FIELD]: boardOrder,
  };
}

export type TaskRecordRelations = {
  tags: ProjectTag[];
  responsibles: ProjectResponsible[];
};

export function taskRelationsFromRecord(
  record?: EntityRecord,
): TaskRecordRelations {
  return {
    tags: parseArray<ProjectTag>(record?.[TASK_TAGS_FIELD]),
    responsibles: parseArray<ProjectResponsible>(
      record?.[TASK_RESPONSIBLES_FIELD],
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

function parseBoardOrder(value: string | undefined): TaskBoardOrder {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const result: TaskBoardOrder = {};
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

function subtaskInputs(
  value: string | undefined,
  fallbackName: string,
): TaskSubtaskInput[] {
  const parsed = parseArray<Record<string, unknown>>(value);
  const subtasks = parsed.slice(0, 50).flatMap((item): TaskSubtaskInput[] => {
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
    return [
      {
        ...(id ? { id } : {}),
        name,
        durationMinutes,
        status:
          typeof item.status === "string" && item.status.trim()
            ? item.status.trim()
            : "pendente",
      },
    ];
  });
  return subtasks.length
    ? subtasks
    : [
        {
          name: fallbackName || "Atividade principal",
          durationMinutes: 60,
          status: "pendente",
        },
      ];
}

function recordVersion(record?: EntityRecord): number {
  const version = Number(record?.[TASK_VERSION_FIELD] ?? record?.version);
  return Number.isInteger(version) && version >= 1 ? version : 0;
}

function canonicalUpdateSubtasks(
  subtasks: TaskSubtaskInput[],
  current: EntityRecord,
): TaskSubtaskInput[] {
  const currentIds = new Set(
    subtaskInputs(current.subtarefas, current.nome).flatMap(({ id }) =>
      id ? [id] : [],
    ),
  );
  return subtasks.map(({ id, ...subtask }) =>
    id && currentIds.has(id) ? { id, ...subtask } : subtask,
  );
}

export function taskVersionFromRecord(record?: EntityRecord): number {
  return recordVersion(record);
}

function mutationFields(
  values: Record<string, string>,
  current?: EntityRecord,
): TaskContentInput & { status: string } {
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
      ? current?.[TASK_STATUS_FIELD] || "conclusao"
      : selectedStatus;
  const boardOrder = parseBoardOrder(
    values.pautaOrderByView ??
      values[TASK_BOARD_ORDER_FIELD] ??
      current?.[TASK_BOARD_ORDER_FIELD] ??
      current?.pautaOrderByView,
  );
  const subtasks = subtaskInputs(
    values.subtarefas ?? current?.subtarefas,
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
    ).trim(),
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
    sortOrder: integer(
      values.sortOrder ?? values.ordem ?? current?.sortOrder ?? current?.ordem,
    ),
    boardOrder,
    tagLabels,
    responsibleUserIds,
    subtasks,
  };
}

export function entityValuesToTaskCreateInput(
  values: Record<string, string>,
  current?: EntityRecord,
  _options: { copy?: boolean } = {},
): TaskCreateInput {
  const input = mutationFields(values, current);
  return {
    ...input,
    // New tasks enter the board without a claimed position. The transactional
    // board endpoint is the only writer allowed to assign column positions.
    boardOrder: {},
    // Form IDs are temporary UI keys. The server creates canonical UUIDs.
    subtasks: input.subtasks.map(({ id: _id, ...subtask }) => subtask),
  };
}

export function entityValuesToTaskUpdateInput(
  values: Record<string, string>,
  current: EntityRecord,
): TaskUpdateInput {
  const fields = mutationFields(values, current);
  const { boardOrder: _boardOrder, ...content } = fields;
  return {
    ...content,
    subtasks: canonicalUpdateSubtasks(fields.subtasks, current),
    version: recordVersion(current),
  };
}

export async function updateTaskFromEntityValues(
  taskId: string,
  values: Record<string, string>,
  current: EntityRecord,
  fetcher: FetchLike = fetch,
): Promise<Task> {
  return updateTask(
    taskId,
    entityValuesToTaskUpdateInput(values, current),
    fetcher,
  );
}

export function withTaskBoardOrder(
  record: EntityRecord,
  view: TaskBoardView | "client",
  order: number,
): EntityRecord {
  const serverView = view === "client" ? "business" : view;
  const boardOrder = {
    ...parseBoardOrder(
      record[TASK_BOARD_ORDER_FIELD] ?? record.pautaOrderByView,
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
    [TASK_BOARD_ORDER_FIELD]: serialized,
  };
}
