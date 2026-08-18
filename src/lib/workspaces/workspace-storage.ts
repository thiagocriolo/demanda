import { browser } from "$app/environment";
import { setWorkspaceRequestScope } from "./workspace-scope";

export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspaceUser = {
  id: string;
  username?: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

export type WorkspaceInvitation = {
  id: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  status: "pending";
  createdAt: string;
};

export type IncomingWorkspaceInvitation = WorkspaceInvitation & {
  workspaceId: string;
  workspaceName: string;
  workspaceIcon: string;
  workspaceColor: string;
  invitedBy: WorkspaceUser;
};

export type WorkspaceMember = {
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  kind: "personal" | "shared";
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
  projectCount: number;
  projectPreviews: WorkspaceProjectPreview[];
};

export type WorkspaceProjectPreview = {
  id: string;
  workspaceId: string;
  name: string;
  businessName: string;
  status: string;
  endDate: string | null;
  responsibleNames: string[];
  serviceNames: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceOption = Workspace;

export type WorkspaceInput = {
  name: string;
  description: string;
  icon: string;
  color: string;
};

type WorkspaceSnapshot = {
  activeWorkspaceId: string;
  currentUser: WorkspaceUser;
  users: WorkspaceUser[];
  workspaces: Workspace[];
  pendingInvitations: IncomingWorkspaceInvitation[];
};

type FetchLike = typeof fetch;

/** Referência mutável para preservar a API já usada pelos componentes. */
export const CURRENT_USER: WorkspaceUser = {
  id: "",
  username: "",
  name: "",
  email: "",
};

/** Compatibilidade de tipo; o id real é inicializado pela sessão autenticada. */
export const PERSONAL_WORKSPACE_ID = "personal";
export const GLOBAL_WORKSPACE_ID = "global";
export const WORKSPACES_CHANGED_EVENT = "demanda:workspaces-changed";
const GLOBAL_SCOPE_STORAGE_KEY = "demanda:workspace-scope-global";

let cachedWorkspaces: Workspace[] = [];
let cachedUsers: WorkspaceUser[] = [];
let cachedPendingInvitations: IncomingWorkspaceInvitation[] = [];
let cachedActiveWorkspaceId = "";
let cachedServerWorkspaceId = "";

function syncWorkspaceRequestScope(): void {
  setWorkspaceRequestScope(
    cachedActiveWorkspaceId,
    cachedWorkspaces.map(({ id }) => id),
  );
}

function globalScopeStored(): boolean {
  return browser && localStorage.getItem(GLOBAL_SCOPE_STORAGE_KEY) === "true";
}

export class WorkspaceApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceApiError";
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function requestJson<T>(
  fetcher: FetchLike,
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    let message = "Não foi possível concluir a operação no workspace.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // A mensagem genérica cobre respostas sem JSON.
    }
    throw new WorkspaceApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function applySnapshot(snapshot: WorkspaceSnapshot): void {
  Object.assign(CURRENT_USER, snapshot.currentUser);
  cachedUsers = clone(snapshot.users);
  cachedWorkspaces = clone(snapshot.workspaces);
  cachedPendingInvitations = clone(snapshot.pendingInvitations ?? []);
  cachedServerWorkspaceId = snapshot.activeWorkspaceId;
  cachedActiveWorkspaceId = globalScopeStored()
    ? GLOBAL_WORKSPACE_ID
    : snapshot.activeWorkspaceId;
  syncWorkspaceRequestScope();
  announceWorkspacesChanged();
}

/** Inicializa a seleção antes da montagem dos filhos usando a sessão do layout. */
export function initializeWorkspaceSession(data: {
  authenticatedUser?: {
    id?: string;
    username?: string;
    name?: string;
    email?: string;
    avatarUrl?: string | null;
  };
  activeWorkspace?: { id?: string } | null;
}): void {
  const user = data.authenticatedUser;
  if (user?.id && user.name && user.email) {
    Object.assign(CURRENT_USER, {
      id: user.id,
      username: user.username ?? "",
      name: user.name,
      email: user.email,
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    });
  }
  if (data.activeWorkspace?.id) {
    cachedServerWorkspaceId = data.activeWorkspace.id;
    cachedActiveWorkspaceId = globalScopeStored()
      ? GLOBAL_WORKSPACE_ID
      : data.activeWorkspace.id;
    syncWorkspaceRequestScope();
  }
}

export async function refreshWorkspaceSnapshot(
  fetcher: FetchLike = fetch,
): Promise<Workspace[]> {
  const snapshot = await requestJson<WorkspaceSnapshot>(
    fetcher,
    "/api/workspaces",
  );
  applySnapshot(snapshot);
  return loadWorkspaces();
}

export function loadWorkspaces(): Workspace[] {
  return clone(cachedWorkspaces);
}

export function loadWorkspaceUsers(): WorkspaceUser[] {
  return clone(
    cachedUsers.length ? cachedUsers : CURRENT_USER.id ? [CURRENT_USER] : [],
  );
}

export function loadPendingWorkspaceInvitations(): IncomingWorkspaceInvitation[] {
  return clone(cachedPendingInvitations);
}

export function loadActiveWorkspaceId(workspaces = cachedWorkspaces): string {
  if (cachedActiveWorkspaceId === GLOBAL_WORKSPACE_ID) {
    return GLOBAL_WORKSPACE_ID;
  }
  if (
    cachedActiveWorkspaceId &&
    (!workspaces.length ||
      workspaces.some(({ id }) => id === cachedActiveWorkspaceId))
  ) {
    return cachedActiveWorkspaceId;
  }
  return (
    workspaces.find(({ kind }) => kind === "personal")?.id ??
    workspaces[0]?.id ??
    ""
  );
}

/**
 * Resolve os workspaces concretos representados pelo escopo selecionado.
 * "Global" existe apenas na interface; ele nunca e enviado como tenant para
 * o servidor. Cada requisicao continua sendo autorizada contra um workspace
 * real do qual o usuario participa.
 */
export function loadScopedWorkspaceIds(
  workspaces = cachedWorkspaces,
): string[] {
  const activeId = loadActiveWorkspaceId(workspaces);
  if (activeId === GLOBAL_WORKSPACE_ID) {
    return workspaces.map(({ id }) => id);
  }
  return activeId ? [activeId] : [];
}

export function getActiveWorkspace(): Workspace {
  const activeId = loadActiveWorkspaceId();
  const concreteId =
    activeId === GLOBAL_WORKSPACE_ID ? cachedServerWorkspaceId : activeId;
  const workspace =
    cachedWorkspaces.find(({ id }) => id === concreteId) ?? cachedWorkspaces[0];
  if (!workspace) throw new Error("Workspace ainda não foi carregado.");
  return clone(workspace);
}

export async function setActiveWorkspaceId(
  id: string,
  fetcher: FetchLike = fetch,
): Promise<boolean> {
  if (id === GLOBAL_WORKSPACE_ID) {
    cachedActiveWorkspaceId = GLOBAL_WORKSPACE_ID;
    syncWorkspaceRequestScope();
    if (browser) localStorage.setItem(GLOBAL_SCOPE_STORAGE_KEY, "true");
    announceWorkspacesChanged();
    return true;
  }
  if (
    !id ||
    (cachedWorkspaces.length &&
      !cachedWorkspaces.some((workspace) => workspace.id === id))
  ) {
    return false;
  }
  await requestJson(fetcher, "/api/workspaces/active", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceId: id }),
  });
  cachedServerWorkspaceId = id;
  cachedActiveWorkspaceId = id;
  syncWorkspaceRequestScope();
  if (browser) localStorage.removeItem(GLOBAL_SCOPE_STORAGE_KEY);
  announceWorkspacesChanged();
  return true;
}

export async function createWorkspace(
  values: WorkspaceInput,
  fetcher: FetchLike = fetch,
): Promise<Workspace> {
  const { id } = await requestJson<{ id: string }>(fetcher, "/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: values.name,
      description: values.description,
      icon: values.icon,
      color: values.color,
    }),
  });
  await refreshWorkspaceSnapshot(fetcher);
  const workspace = cachedWorkspaces.find((item) => item.id === id);
  if (!workspace) throw new Error("Workspace não encontrado após a criação.");
  return clone(workspace);
}

export async function updateWorkspace(
  workspaceId: string,
  values: WorkspaceInput,
  fetcher: FetchLike = fetch,
): Promise<Workspace> {
  await requestJson(fetcher, `/api/workspaces/${workspaceId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(values),
  });
  await refreshWorkspaceSnapshot(fetcher);
  const workspace = cachedWorkspaces.find((item) => item.id === workspaceId);
  if (!workspace)
    throw new Error("Workspace não encontrado após a atualização.");
  return clone(workspace);
}

export async function deleteWorkspace(
  workspaceId: string,
  fetcher: FetchLike = fetch,
): Promise<boolean> {
  await requestJson(fetcher, `/api/workspaces/${workspaceId}`, {
    method: "DELETE",
  });
  await refreshWorkspaceSnapshot(fetcher);
  return true;
}

export function canManageWorkspace(workspace: Workspace): boolean {
  const membership = workspace.members.find(
    ({ userId }) => userId === CURRENT_USER.id,
  );
  return membership?.role === "owner" || membership?.role === "admin";
}

export function canDeleteWorkspace(workspace: Workspace): boolean {
  return workspace.kind === "shared" && workspace.ownerId === CURRENT_USER.id;
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: Exclude<WorkspaceRole, "owner">,
  fetcher: FetchLike = fetch,
): Promise<boolean> {
  await requestJson(
    fetcher,
    `/api/workspaces/${workspaceId}/members/${userId}/role`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    },
  );
  await refreshWorkspaceSnapshot(fetcher);
  return true;
}

export async function addWorkspaceCollaborator(
  workspaceId: string,
  values: {
    email: string;
    role?: Exclude<WorkspaceRole, "owner">;
  },
  fetcher: FetchLike = fetch,
): Promise<
  | { status: "member"; user: WorkspaceUser }
  | { status: "pending"; invitation: WorkspaceInvitation }
> {
  const result = await requestJson<
    | { status: "member"; user: WorkspaceUser }
    | { status: "pending"; invitation: WorkspaceInvitation }
  >(fetcher, `/api/workspaces/${workspaceId}/members`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: values.email,
      role: values.role ?? "member",
    }),
  });
  await refreshWorkspaceSnapshot(fetcher);
  return clone(result);
}

export async function revokeWorkspaceInvitation(
  workspaceId: string,
  invitationId: string,
  fetcher: FetchLike = fetch,
): Promise<boolean> {
  await requestJson(
    fetcher,
    `/api/workspaces/${workspaceId}/invitations/${invitationId}`,
    { method: "DELETE" },
  );
  await refreshWorkspaceSnapshot(fetcher);
  return true;
}

export async function acceptWorkspaceInvitation(
  invitationId: string,
  fetcher: FetchLike = fetch,
): Promise<string> {
  const result = await requestJson<{ workspaceId: string }>(
    fetcher,
    `/api/workspace-invitations/${invitationId}/accept`,
    { method: "POST" },
  );
  await refreshWorkspaceSnapshot(fetcher);
  return result.workspaceId;
}

export type WorkspaceCollaboratorSearchResult =
  | {
      kind: "user";
      id: string;
      username: string;
      name: string;
      email: string;
      avatarUrl: string | null;
      exact: boolean;
    }
  | { kind: "invite"; id: string; email: string; exact: true };

export async function searchWorkspaceCollaborators(
  query: string,
  fetcher: FetchLike = fetch,
): Promise<WorkspaceCollaboratorSearchResult[]> {
  const response = await requestJson<{
    results: WorkspaceCollaboratorSearchResult[];
  }>(fetcher, `/api/connections/search?q=${encodeURIComponent(query)}`);
  return clone(response.results);
}

export async function removeWorkspaceMember(
  workspaceId: string,
  userId: string,
  fetcher: FetchLike = fetch,
): Promise<boolean> {
  await requestJson(
    fetcher,
    `/api/workspaces/${workspaceId}/members/${userId}`,
    {
      method: "DELETE",
    },
  );
  await refreshWorkspaceSnapshot(fetcher);
  return true;
}

export function announceWorkspacesChanged(): void {
  if (!browser) return;
  window.dispatchEvent(new CustomEvent(WORKSPACES_CHANGED_EVENT));
}

export function observeWorkspaces(onchange: () => void): () => void {
  if (!browser) return () => undefined;
  window.addEventListener(WORKSPACES_CHANGED_EVENT, onchange);
  return () => window.removeEventListener(WORKSPACES_CHANGED_EVENT, onchange);
}
