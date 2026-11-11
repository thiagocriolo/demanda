import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { affectedRows, type Database } from "../db/database";
import {
  businesses,
  projects,
  storedFiles,
  tasks,
  toolModels,
  toolResponses,
  toolUses,
  users,
} from "../db/schema";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
  type RequestAuthorizationContext,
} from "../authorization/workspace-context";
import type {
  ToolModel,
  ToolModelInput,
  ToolModelUpdateInput,
  ToolResponse,
  ToolResponsePayload,
  ToolUse,
  ToolUseInput,
  ToolUseStatus,
  ToolUseUpdateInput,
  ToolWorkspaceSnapshot,
} from "../../tools/types";
import {
  configMatchesTool,
  isUseContentPublishable,
  responseMatchesUse,
  visualFileIds,
} from "./validation";

type ToolDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "transaction"
>;

export class ToolModelNotFoundError extends Error {
  constructor() {
    super("Modelo não encontrado.");
    this.name = "ToolModelNotFoundError";
  }
}

export class ToolUseNotFoundError extends Error {
  constructor() {
    super("Uso de ferramenta não encontrado.");
    this.name = "ToolUseNotFoundError";
  }
}

export class ToolVersionConflictError extends Error {
  constructor() {
    super(
      "O item foi alterado por outra operação. Recarregue e tente novamente.",
    );
    this.name = "ToolVersionConflictError";
  }
}

export class ToolStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolStateConflictError";
  }
}

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

function databaseConstraint(cause: unknown): string | undefined {
  const visited = new Set<unknown>();
  let current = cause;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    if ("sqlMessage" in current && typeof current.sqlMessage === "string") {
      const match = /CONSTRAINT `([^`]+)`/u.exec(current.sqlMessage);
      if (match?.[1]) return match[1];
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

async function workspaceIdForRead(
  database: ToolDatabase,
  context: RequestAuthorizationContext,
  requestedWorkspaceId?: string,
): Promise<string> {
  if (requestedWorkspaceId) {
    return (
      await requireWorkspacePermission(
        database,
        context.user.id,
        requestedWorkspaceId,
        "workspace:read",
      )
    ).workspace.id;
  }
  return requireActiveWorkspacePermission(context, "workspace:read").workspace
    .id;
}

async function workspaceIdForWrite(
  database: ToolDatabase,
  context: RequestAuthorizationContext,
  requestedWorkspaceId?: string,
): Promise<string> {
  if (requestedWorkspaceId) {
    return (
      await requireWorkspacePermissionForUpdate(
        database,
        context.user.id,
        requestedWorkspaceId,
        "workspace:write",
      )
    ).workspace.id;
  }
  return requireActiveWorkspacePermission(context, "workspace:write").workspace
    .id;
}

function modelDto(
  row: typeof toolModels.$inferSelect,
  usageCount: number,
): ToolModel {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    toolKey: row.toolKey,
    name: row.name,
    description: row.description,
    config: row.config,
    usageCount,
    version: row.version,
    createdByUserId: row.createdByUserId,
    archivedAt: iso(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function modelUsageCounts(
  database: ToolDatabase,
  workspaceId: string,
): Promise<Map<string, number>> {
  const rows = await database
    .select({ modelId: toolUses.modelId, total: count() })
    .from(toolUses)
    .where(eq(toolUses.workspaceId, workspaceId))
    .groupBy(toolUses.modelId);
  return new Map(rows.map(({ modelId, total }) => [modelId, total]));
}

async function listModels(
  database: ToolDatabase,
  workspaceId: string,
): Promise<ToolModel[]> {
  const [rows, counts] = await Promise.all([
    database
      .select()
      .from(toolModels)
      .where(eq(toolModels.workspaceId, workspaceId))
      .orderBy(desc(toolModels.updatedAt), desc(toolModels.id)),
    modelUsageCounts(database, workspaceId),
  ]);
  return rows.map((row) => modelDto(row, counts.get(row.id) ?? 0));
}

type HydratedUseRow = {
  use: typeof toolUses.$inferSelect;
  modelName: string | null;
  taskName: string | null;
  projectId: string | null;
  projectName: string | null;
  businessId: string | null;
  businessName: string | null;
  responseCount: number;
};

function useDto(row: HydratedUseRow): ToolUse {
  const context =
    row.use.taskId &&
    row.taskName &&
    row.projectId &&
    row.projectName &&
    row.businessId &&
    row.businessName
      ? {
          task: { id: row.use.taskId, name: row.taskName },
          project: { id: row.projectId, name: row.projectName },
          business: { id: row.businessId, name: row.businessName },
        }
      : null;
  return {
    id: row.use.id,
    workspaceId: row.use.workspaceId,
    toolKey: row.use.toolKey,
    modelId: row.use.modelId,
    modelName: row.modelName,
    name: row.use.name,
    configSnapshot: row.use.configSnapshot,
    content: row.use.content,
    taskId: row.use.taskId,
    context,
    status: row.use.status,
    responseCount: row.responseCount,
    version: row.use.version,
    createdByUserId: row.use.createdByUserId,
    completedAt: iso(row.use.completedAt),
    archivedAt: iso(row.use.archivedAt),
    createdAt: row.use.createdAt.toISOString(),
    updatedAt: row.use.updatedAt.toISOString(),
  };
}

function useHydrationQuery(database: ToolDatabase, workspaceId: string) {
  const responseCounts = database
    .select({
      workspaceId: toolResponses.workspaceId,
      useId: toolResponses.useId,
      total: count().as("total"),
    })
    .from(toolResponses)
    .where(eq(toolResponses.workspaceId, workspaceId))
    .groupBy(toolResponses.workspaceId, toolResponses.useId)
    .as("tool_response_counts");

  return database
    .select({
      use: toolUses,
      modelName: toolModels.name,
      taskName: tasks.name,
      projectId: projects.id,
      projectName: projects.name,
      businessId: businesses.id,
      businessName: businesses.name,
      responseCount: responseCounts.total,
    })
    .from(toolUses)
    .innerJoin(
      toolModels,
      and(
        eq(toolModels.workspaceId, toolUses.workspaceId),
        eq(toolModels.id, toolUses.modelId),
      ),
    )
    .leftJoin(
      tasks,
      and(
        eq(tasks.workspaceId, toolUses.workspaceId),
        eq(tasks.id, toolUses.taskId),
      ),
    )
    .leftJoin(
      projects,
      and(
        eq(projects.workspaceId, tasks.workspaceId),
        eq(projects.id, tasks.projectId),
      ),
    )
    .leftJoin(
      businesses,
      and(
        eq(businesses.workspaceId, tasks.workspaceId),
        eq(businesses.id, tasks.businessId),
      ),
    )
    .leftJoin(
      responseCounts,
      and(
        eq(responseCounts.workspaceId, toolUses.workspaceId),
        eq(responseCounts.useId, toolUses.id),
      ),
    );
}

async function listUses(
  database: ToolDatabase,
  workspaceId: string,
): Promise<ToolUse[]> {
  const rows = await useHydrationQuery(database, workspaceId)
    .where(eq(toolUses.workspaceId, workspaceId))
    .orderBy(desc(toolUses.updatedAt), desc(toolUses.id));
  return rows.map((row) =>
    useDto({ ...row, responseCount: row.responseCount ?? 0 }),
  );
}

async function getHydratedUse(
  database: ToolDatabase,
  workspaceId: string,
  useId: string,
): Promise<ToolUse> {
  const [row] = await useHydrationQuery(database, workspaceId)
    .where(and(eq(toolUses.workspaceId, workspaceId), eq(toolUses.id, useId)))
    .limit(1);
  if (!row) throw new ToolUseNotFoundError();
  return useDto({ ...row, responseCount: row.responseCount ?? 0 });
}

export async function listWorkspaceTools(
  database: ToolDatabase,
  context: RequestAuthorizationContext,
  requestedWorkspaceId?: string,
): Promise<ToolWorkspaceSnapshot> {
  const workspaceId = await workspaceIdForRead(
    database,
    context,
    requestedWorkspaceId,
  );
  const [models, uses] = await Promise.all([
    listModels(database, workspaceId),
    listUses(database, workspaceId),
  ]);
  return { workspaceId, models, uses };
}

async function scopedModelRow(
  database: ToolDatabase,
  workspaceId: string,
  modelId: string,
): Promise<typeof toolModels.$inferSelect> {
  const [row] = await database
    .select()
    .from(toolModels)
    .where(
      and(eq(toolModels.workspaceId, workspaceId), eq(toolModels.id, modelId)),
    )
    .limit(1);
  if (!row) throw new ToolModelNotFoundError();
  return row;
}

async function modelRowById(
  database: ToolDatabase,
  modelId: string,
): Promise<typeof toolModels.$inferSelect> {
  const [row] = await database
    .select()
    .from(toolModels)
    .where(eq(toolModels.id, modelId))
    .limit(1);
  if (!row) throw new ToolModelNotFoundError();
  return row;
}

async function useRowById(
  database: ToolDatabase,
  useId: string,
): Promise<typeof toolUses.$inferSelect> {
  const [row] = await database
    .select()
    .from(toolUses)
    .where(eq(toolUses.id, useId))
    .limit(1);
  if (!row) throw new ToolUseNotFoundError();
  return row;
}

export async function createWorkspaceToolModel(
  database: ToolDatabase,
  context: RequestAuthorizationContext,
  input: ToolModelInput,
): Promise<ToolModel> {
  const workspaceId = await workspaceIdForWrite(
    database,
    context,
    input.workspaceId,
  );
  if (!configMatchesTool(input.toolKey, input.config)) {
    throw new ToolInputError(
      "A configuração não corresponde à ferramenta escolhida.",
    );
  }
  const id = randomUUID();
  await database
    .insert(toolModels)
    .values({
      id,
      workspaceId,
      createdByUserId: context.user.id,
      toolKey: input.toolKey,
      name: input.name,
      description: input.description,
      config: structuredClone(input.config),
    });
  const [row] = await database
    .select()
    .from(toolModels)
    .where(eq(toolModels.id, id))
    .limit(1);
  if (!row) throw new Error("Modelo não criado.");
  return modelDto(row, 0);
}

export async function updateWorkspaceToolModel(
  database: ToolDatabase,
  context: RequestAuthorizationContext,
  modelId: string,
  input: ToolModelUpdateInput,
): Promise<ToolModel> {
  const current = await modelRowById(database, modelId);
  const workspaceId = current.workspaceId;
  await requireWorkspacePermissionForUpdate(
    database,
    context.user.id,
    workspaceId,
    "workspace:write",
  );
  if (current.archivedAt)
    throw new ToolStateConflictError(
      "Modelos arquivados não podem ser editados.",
    );
  if (!configMatchesTool(current.toolKey, input.config)) {
    throw new ToolInputError(
      "Não é possível alterar a Ferramenta de um Modelo.",
    );
  }
  const updated = await database
    .update(toolModels)
    .set({
      name: input.name,
      description: input.description,
      config: structuredClone(input.config),
      version: input.version + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(toolModels.workspaceId, workspaceId),
        eq(toolModels.id, modelId),
        eq(toolModels.version, input.version),
        isNull(toolModels.archivedAt),
      ),
    );
  if (affectedRows(updated) !== 1) throw new ToolVersionConflictError();
  const counts = await modelUsageCounts(database, workspaceId);
  return modelDto(
    {
      ...current,
      name: input.name,
      description: input.description,
      config: structuredClone(input.config),
      version: input.version + 1,
      updatedAt: new Date(),
    },
    counts.get(modelId) ?? 0,
  );
}

export async function duplicateWorkspaceToolModel(
  database: ToolDatabase,
  context: RequestAuthorizationContext,
  modelId: string,
): Promise<ToolModel> {
  const current = await modelRowById(database, modelId);
  const workspaceId = current.workspaceId;
  await requireWorkspacePermissionForUpdate(
    database,
    context.user.id,
    workspaceId,
    "workspace:write",
  );
  const copyId = randomUUID();
  await database
    .insert(toolModels)
    .values({
      id: copyId,
      workspaceId,
      createdByUserId: context.user.id,
      toolKey: current.toolKey,
      name: `${current.name} — cópia`.slice(0, 120),
      description: current.description,
      config: structuredClone(current.config),
    });
  const [copy] = await database
    .select()
    .from(toolModels)
    .where(eq(toolModels.id, copyId))
    .limit(1);
  if (!copy) throw new Error("Modelo não duplicado.");
  return modelDto(copy, 0);
}

export async function archiveWorkspaceToolModel(
  database: ToolDatabase,
  context: RequestAuthorizationContext,
  modelId: string,
  version: number,
): Promise<ToolModel> {
  const current = await modelRowById(database, modelId);
  const workspaceId = current.workspaceId;
  await requireWorkspacePermissionForUpdate(
    database,
    context.user.id,
    workspaceId,
    "workspace:write",
  );
  const now = new Date();
  const updated = await database
    .update(toolModels)
    .set({ archivedAt: now, updatedAt: now, version: version + 1 })
    .where(
      and(
        eq(toolModels.workspaceId, workspaceId),
        eq(toolModels.id, modelId),
        eq(toolModels.version, version),
        isNull(toolModels.archivedAt),
      ),
    );
  if (affectedRows(updated) !== 1) {
    if (current.version !== version || current.archivedAt) {
      throw new ToolVersionConflictError();
    }
    throw new ToolVersionConflictError();
  }
  const counts = await modelUsageCounts(database, workspaceId);
  return modelDto(
    { ...current, archivedAt: now, updatedAt: now, version: version + 1 },
    counts.get(modelId) ?? 0,
  );
}

function assertUseInputMatchesModel(
  model: typeof toolModels.$inferSelect,
  content: ToolUseInput["content"] | ToolUseUpdateInput["content"],
  status: ToolUseStatus,
): void {
  if (model.toolKey !== content.kind) {
    throw new ToolInputError(
      "O conteúdo não corresponde à Ferramenta do Modelo.",
    );
  }
  if (status === "open" && !isUseContentPublishable(content)) {
    throw new ToolInputError(
      content.kind === "comparison"
        ? "Adicione pelo menos duas alternativas visuais antes de publicar."
        : "Adicione conteúdo visual a todos os itens antes de publicar.",
    );
  }
}

async function assertVisualAssets(
  database: ToolDatabase,
  workspaceId: string,
  content: ToolUseInput["content"] | ToolUseUpdateInput["content"],
): Promise<void> {
  const fileIds = visualFileIds(content);
  if (!fileIds.length) return;
  const rows = await database
    .select({ id: storedFiles.id })
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.workspaceId, workspaceId),
        eq(storedFiles.purpose, "attachment"),
        eq(storedFiles.status, "ready"),
        isNull(storedFiles.deletedAt),
        inArray(storedFiles.id, fileIds),
      ),
    );
  if (rows.length !== fileIds.length) {
    throw new ToolInputError(
      "Uma ou mais imagens não pertencem a este workspace ou não estão disponíveis.",
    );
  }
}

export async function createWorkspaceToolUse(
  database: ToolDatabase,
  context: RequestAuthorizationContext,
  input: ToolUseInput,
): Promise<ToolUse> {
  const workspaceId = await workspaceIdForWrite(
    database,
    context,
    input.workspaceId,
  );
  const model = await scopedModelRow(database, workspaceId, input.modelId);
  if (model.archivedAt) {
    throw new ToolStateConflictError(
      "Não é possível iniciar um Uso com um Modelo arquivado.",
    );
  }
  assertUseInputMatchesModel(model, input.content, input.status);
  await assertVisualAssets(database, workspaceId, input.content);
  try {
    const id = randomUUID();
    await database
      .insert(toolUses)
      .values({
        id,
        workspaceId,
        createdByUserId: context.user.id,
        modelId: model.id,
        taskId: input.taskId,
        toolKey: model.toolKey,
        name: input.name,
        configSnapshot: structuredClone(model.config),
        content: structuredClone(input.content),
        status: input.status,
      });
    const created = { id };
    if (!created) throw new Error("Uso não criado.");
    return getHydratedUse(database, workspaceId, id);
  } catch (cause) {
    if (databaseConstraint(cause) === "tool_uses_workspace_task_foreign_key") {
      throw new ToolInputError(
        "A tarefa selecionada não pertence a este workspace.",
      );
    }
    throw cause;
  }
}

function transitionAllowed(
  current: ToolUseStatus,
  next: ToolUseStatus,
): boolean {
  const transitions: Record<ToolUseStatus, ToolUseStatus[]> = {
    draft: ["draft", "open", "archived"],
    open: ["open", "completed", "archived"],
    completed: ["completed", "archived"],
    archived: ["archived"],
  };
  return transitions[current].includes(next);
}

export async function updateWorkspaceToolUse(
  database: ToolDatabase,
  context: RequestAuthorizationContext,
  useId: string,
  input: ToolUseUpdateInput,
): Promise<ToolUse> {
  const current = await useRowById(database, useId);
  const workspaceId = current.workspaceId;
  await requireWorkspacePermissionForUpdate(
    database,
    context.user.id,
    workspaceId,
    "workspace:write",
  );
  if (!transitionAllowed(current.status, input.status)) {
    throw new ToolStateConflictError(
      "Esta alteração de status não é permitida.",
    );
  }
  if (current.status === "archived") {
    throw new ToolStateConflictError(
      "Usos arquivados não podem ser alterados.",
    );
  }
  if (
    current.status === "completed" &&
    (input.name !== current.name ||
      input.taskId !== current.taskId ||
      JSON.stringify(input.content) !== JSON.stringify(current.content))
  ) {
    throw new ToolStateConflictError(
      "Um Uso concluído preserva seu conteúdo histórico.",
    );
  }
  const model = await scopedModelRow(database, workspaceId, current.modelId);
  assertUseInputMatchesModel(model, input.content, input.status);
  await assertVisualAssets(database, workspaceId, input.content);
  const now = new Date();
  const completedAt =
    input.status === "completed"
      ? (current.completedAt ?? now)
      : input.status === "archived"
        ? current.completedAt
        : null;
  const archivedAt = input.status === "archived" ? now : null;
  try {
    const updated = await database
      .update(toolUses)
      .set({
        name: input.name,
        taskId: input.taskId,
        content: structuredClone(input.content),
        status: input.status,
        completedAt,
        archivedAt,
        version: input.version + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(toolUses.workspaceId, workspaceId),
          eq(toolUses.id, useId),
          eq(toolUses.version, input.version),
        ),
      );
    if (affectedRows(updated) !== 1) throw new ToolVersionConflictError();
    return getHydratedUse(database, workspaceId, useId);
  } catch (cause) {
    if (cause instanceof ToolVersionConflictError) throw cause;
    if (databaseConstraint(cause) === "tool_uses_workspace_task_foreign_key") {
      throw new ToolInputError(
        "A tarefa selecionada não pertence a este workspace.",
      );
    }
    throw cause;
  }
}

function responseDto(row: {
  response: typeof toolResponses.$inferSelect;
  respondentName: string;
  respondentEmail: string;
  respondentAvatarUrl: string | null;
}): ToolResponse {
  return {
    id: row.response.id,
    workspaceId: row.response.workspaceId,
    useId: row.response.useId,
    respondent: {
      id: row.response.respondentUserId,
      name: row.respondentName,
      email: row.respondentEmail,
      avatarUrl: row.respondentAvatarUrl,
    },
    payload: row.response.payload,
    submittedAt: row.response.submittedAt.toISOString(),
    createdAt: row.response.createdAt.toISOString(),
    updatedAt: row.response.updatedAt.toISOString(),
  };
}

export async function listWorkspaceToolResponses(
  database: ToolDatabase,
  context: RequestAuthorizationContext,
  useId: string,
): Promise<ToolResponse[]> {
  const useRow = await useRowById(database, useId);
  const workspaceId = useRow.workspaceId;
  await requireWorkspacePermission(
    database,
    context.user.id,
    workspaceId,
    "workspace:read",
  );
  await getHydratedUse(database, workspaceId, useId);
  const rows = await database
    .select({
      response: toolResponses,
      respondentName: users.name,
      respondentEmail: users.email,
      respondentAvatarUrl: users.avatarUrl,
    })
    .from(toolResponses)
    .innerJoin(users, eq(users.id, toolResponses.respondentUserId))
    .where(
      and(
        eq(toolResponses.workspaceId, workspaceId),
        eq(toolResponses.useId, useId),
      ),
    )
    .orderBy(desc(toolResponses.submittedAt), desc(toolResponses.id));
  return rows.map(responseDto);
}

export async function submitWorkspaceToolResponse(
  database: ToolDatabase,
  context: RequestAuthorizationContext,
  useId: string,
  payload: ToolResponsePayload,
): Promise<ToolResponse> {
  const useRow = await useRowById(database, useId);
  const workspaceId = useRow.workspaceId;
  await requireWorkspacePermissionForUpdate(
    database,
    context.user.id,
    workspaceId,
    "workspace:write",
  );
  const use = await getHydratedUse(database, workspaceId, useId);
  if (use.status !== "open") {
    throw new ToolStateConflictError(
      "Este Uso não está disponível para respostas.",
    );
  }
  if (!responseMatchesUse(use.configSnapshot, use.content, payload)) {
    throw new ToolInputError(
      "A resposta está incompleta ou não corresponde a este Uso.",
    );
  }
  const now = new Date();
  await database
    .insert(toolResponses)
    .values({
      workspaceId,
      useId,
      respondentUserId: context.user.id,
      payload: structuredClone(payload),
      submittedAt: now,
    })
    .onDuplicateKeyUpdate({
        set: {
        payload: structuredClone(payload),
        submittedAt: now,
        updatedAt: now,
      },
    });
  const responses = await listWorkspaceToolResponses(database, context, useId);
  const response = responses.find(
    ({ respondent }) => respondent.id === context.user.id,
  );
  if (!response) throw new Error("Resposta não persistida.");
  return response;
}
