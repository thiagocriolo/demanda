import {
  jsonRequest,
  requestJson as fetchJson,
  type FetchLike,
} from "../http/client";
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

export class ToolApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ToolApiError";
  }
}

function requestJson<T>(
  fetcher: FetchLike,
  input: string,
  init?: RequestInit,
): Promise<T> {
  return fetchJson<T>(fetcher, input, init, {
    fallbackMessage: "Não foi possível concluir a operação em Ferramentas.",
    createError: (status, message) => new ToolApiError(status, message),
  });
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
