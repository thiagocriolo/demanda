import {
  isGlobalWorkspaceScope,
  workspaceIdsForRequestScope,
} from "$lib/workspaces/workspace-scope";
import type {
  ToolModel,
  ToolModelInput,
  ToolModelUpdateInput,
  ToolResponse,
  ToolResponsePayload,
  ToolUse,
  ToolUseInput,
  ToolUseUpdateInput,
  ToolWorkspaceSnapshot,
} from "./types";

export const TOOLS_CHANGED_EVENT = "demanda:tools-changed";
type FetchLike = typeof fetch;

export class ToolApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ToolApiError";
  }
}

async function requestJson<T>(
  fetcher: FetchLike,
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    let message = "Não foi possível concluir a operação em Ferramentas.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // A mensagem genérica cobre respostas sem JSON.
    }
    throw new ToolApiError(response.status, message);
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

async function loadWorkspaceTools(
  workspaceId: string | undefined,
  fetcher: FetchLike,
): Promise<ToolWorkspaceSnapshot> {
  const query = workspaceId
    ? `?workspaceId=${encodeURIComponent(workspaceId)}`
    : "";
  return requestJson(fetcher, `/api/tools${query}`);
}

export async function loadTools(
  fetcher: FetchLike = fetch,
): Promise<ToolWorkspaceSnapshot[]> {
  const workspaceIds = workspaceIdsForRequestScope();
  if (isGlobalWorkspaceScope() && workspaceIds.length) {
    return Promise.all(
      workspaceIds.map((workspaceId) =>
        loadWorkspaceTools(workspaceId, fetcher),
      ),
    );
  }
  return [await loadWorkspaceTools(undefined, fetcher)];
}

export async function createToolModel(
  input: ToolModelInput,
  fetcher: FetchLike = fetch,
): Promise<ToolModel> {
  const model = await requestJson<ToolModel>(
    fetcher,
    "/api/tool-models",
    jsonRequest("POST", input),
  );
  notifyToolsChanged();
  return model;
}

export async function updateToolModel(
  modelId: string,
  input: ToolModelUpdateInput,
  fetcher: FetchLike = fetch,
): Promise<ToolModel> {
  const model = await requestJson<ToolModel>(
    fetcher,
    `/api/tool-models/${encodeURIComponent(modelId)}`,
    jsonRequest("PUT", input),
  );
  notifyToolsChanged();
  return model;
}

export async function duplicateToolModel(
  modelId: string,
  fetcher: FetchLike = fetch,
): Promise<ToolModel> {
  const model = await requestJson<ToolModel>(
    fetcher,
    `/api/tool-models/${encodeURIComponent(modelId)}/duplicate`,
    { method: "POST" },
  );
  notifyToolsChanged();
  return model;
}

export async function archiveToolModel(
  modelId: string,
  version: number,
  fetcher: FetchLike = fetch,
): Promise<ToolModel> {
  const model = await requestJson<ToolModel>(
    fetcher,
    `/api/tool-models/${encodeURIComponent(modelId)}?version=${version}`,
    { method: "DELETE" },
  );
  notifyToolsChanged();
  return model;
}

export async function createToolUse(
  input: ToolUseInput,
  fetcher: FetchLike = fetch,
): Promise<ToolUse> {
  const use = await requestJson<ToolUse>(
    fetcher,
    "/api/tool-uses",
    jsonRequest("POST", input),
  );
  notifyToolsChanged();
  return use;
}

export async function updateToolUse(
  useId: string,
  input: ToolUseUpdateInput,
  fetcher: FetchLike = fetch,
): Promise<ToolUse> {
  const use = await requestJson<ToolUse>(
    fetcher,
    `/api/tool-uses/${encodeURIComponent(useId)}`,
    jsonRequest("PUT", input),
  );
  notifyToolsChanged();
  return use;
}

export function loadToolResponses(
  useId: string,
  fetcher: FetchLike = fetch,
): Promise<ToolResponse[]> {
  return requestJson(
    fetcher,
    `/api/tool-uses/${encodeURIComponent(useId)}/responses`,
  );
}

export async function submitToolResponse(
  useId: string,
  payload: ToolResponsePayload,
  fetcher: FetchLike = fetch,
): Promise<ToolResponse> {
  const response = await requestJson<ToolResponse>(
    fetcher,
    `/api/tool-uses/${encodeURIComponent(useId)}/responses`,
    jsonRequest("POST", { payload }),
  );
  notifyToolsChanged();
  return response;
}

function notifyToolsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOOLS_CHANGED_EVENT));
}
