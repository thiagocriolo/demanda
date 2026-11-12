import {
  defaultPersonalSettings,
  defaultWorkspaceSettings,
  freshSettings,
  mergeSettingsScopes,
  personalSettingsFromState,
  workspaceSettingsFromState,
} from "./defaults";
import { SETTINGS_CHANGED_EVENT } from "./storage";
import type {
  PersonalSettingsResponse,
  SettingsSnapshot,
  SettingsState,
  WorkspaceSettingsResponse,
} from "./types";

type FetchLike = typeof fetch;

export class SettingsApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SettingsApiError";
  }
}

let cached = freshSettings();
let personalVersion = 0;
let workspaceVersion = 0;
let workspaceId = "";
let canManageWorkspace = false;

async function requestJson<T>(
  fetcher: FetchLike,
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    let message = "Não foi possível carregar as configurações.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // A mensagem genérica cobre respostas sem JSON.
    }
    throw new SettingsApiError(response.status, message);
  }
  return (await response.json()) as T;
}

function notify(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
}

function apply(snapshot: SettingsSnapshot): SettingsState {
  personalVersion = snapshot.personal.version;
  workspaceVersion = snapshot.workspace.version;
  workspaceId = snapshot.workspace.workspaceId;
  canManageWorkspace = snapshot.workspace.canManage;
  cached = mergeSettingsScopes(
    snapshot.personal.settings,
    snapshot.workspace.settings,
  );
  notify();
  return structuredClone(cached);
}

/** Inicializa o cache do navegador com o snapshot usado no primeiro HTML. */
export function initializeSettingsSession(
  snapshot: SettingsSnapshot,
): SettingsState {
  return apply(snapshot);
}

export function currentSettings(): SettingsState {
  return structuredClone(cached);
}

export function workspaceSettingsAccess(): {
  workspaceId: string;
  version: number;
  canManage: boolean;
} {
  return {
    workspaceId,
    version: workspaceVersion,
    canManage: canManageWorkspace,
  };
}

export async function loadSettingsFromServer(
  fetcher: FetchLike = fetch,
): Promise<SettingsState> {
  return apply(await requestJson<SettingsSnapshot>(fetcher, "/api/settings"));
}

export async function savePersonalSettings(
  settings: SettingsState,
  fetcher: FetchLike = fetch,
): Promise<SettingsState> {
  const personal = await requestJson<PersonalSettingsResponse>(
    fetcher,
    "/api/preferences",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: personalVersion,
        settings: personalSettingsFromState(settings),
      }),
    },
  );
  personalVersion = personal.version;
  cached = mergeSettingsScopes(
    personal.settings,
    workspaceSettingsFromState(cached),
  );
  notify();
  return structuredClone(cached);
}

export async function saveWorkspaceSettings(
  settings: SettingsState,
  fetcher: FetchLike = fetch,
): Promise<SettingsState> {
  if (!canManageWorkspace) {
    throw new SettingsApiError(
      403,
      "Somente administradores podem alterar as configurações do workspace.",
    );
  }
  const workspace = await requestJson<WorkspaceSettingsResponse>(
    fetcher,
    "/api/workspace-settings",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: workspaceVersion,
        settings: workspaceSettingsFromState(settings),
      }),
    },
  );
  workspaceVersion = workspace.version;
  workspaceId = workspace.workspaceId;
  canManageWorkspace = workspace.canManage;
  cached = mergeSettingsScopes(
    personalSettingsFromState(cached),
    workspace.settings,
  );
  notify();
  return structuredClone(cached);
}

type SettingsBackupV2 = {
  version: 2;
  exportedAt: string;
  personal: { settings: ReturnType<typeof personalSettingsFromState> };
  workspace?: {
    workspaceId: string;
    settings: ReturnType<typeof workspaceSettingsFromState>;
  };
};

export async function exportSettingsBackup(
  fetcher: FetchLike = fetch,
): Promise<string> {
  await loadSettingsFromServer(fetcher);
  const backup: SettingsBackupV2 = {
    version: 2,
    exportedAt: new Date().toISOString(),
    personal: { settings: personalSettingsFromState(cached) },
  };
  if (canManageWorkspace) {
    backup.workspace = {
      workspaceId,
      settings: workspaceSettingsFromState(cached),
    };
  }
  return JSON.stringify(backup, null, 2);
}

function parseBackup(raw: string): SettingsBackupV2 {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Arquivo de configurações inválido.");
  }
  const record = parsed as Record<string, unknown>;
  if (
    record.version !== 2 ||
    !record.personal ||
    typeof record.personal !== "object" ||
    Array.isArray(record.personal) ||
    !("settings" in record.personal)
  ) {
    throw new Error("Versão de backup incompatível.");
  }
  return parsed as SettingsBackupV2;
}

export async function importSettingsBackup(
  raw: string,
  fetcher: FetchLike = fetch,
): Promise<SettingsState> {
  const backup = parseBackup(raw);
  await loadSettingsFromServer(fetcher);
  if (backup.workspace) {
    if (!canManageWorkspace) {
      throw new SettingsApiError(
        403,
        "O backup contém configurações compartilhadas e exige permissão de administrador.",
      );
    }
    if (backup.workspace.workspaceId !== workspaceId) {
      throw new SettingsApiError(
        409,
        "O backup compartilhado pertence a outro workspace.",
      );
    }
  }
  const snapshot = await requestJson<SettingsSnapshot>(
    fetcher,
    "/api/settings/import",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personalVersion,
        personal: backup.personal.settings,
        ...(backup.workspace
          ? {
              workspace: {
                workspaceId: backup.workspace.workspaceId,
                version: workspaceVersion,
                settings: backup.workspace.settings,
              },
            }
          : {}),
      }),
    },
  );
  return apply(snapshot);
}

export async function resetPersonalSettings(
  fetcher: FetchLike = fetch,
): Promise<SettingsState> {
  return apply(
    await requestJson<SettingsSnapshot>(fetcher, "/api/account/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "RESETAR" }),
    }),
  );
}
