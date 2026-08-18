export const workspaceRoles = Object.freeze([
  "owner",
  "admin",
  "member",
] as const);

export type WorkspaceRole = (typeof workspaceRoles)[number];

export const workspacePermissions = Object.freeze([
  "workspace:read",
  "workspace:write",
  "workspace:administer",
  "workspace:own",
] as const);

export type WorkspacePermission = (typeof workspacePermissions)[number];

export const WORKSPACE_PERMISSION_MATRIX = Object.freeze({
  owner: Object.freeze([
    "workspace:read",
    "workspace:write",
    "workspace:administer",
    "workspace:own",
  ] as const),
  admin: Object.freeze([
    "workspace:read",
    "workspace:write",
    "workspace:administer",
  ] as const),
  member: Object.freeze(["workspace:read", "workspace:write"] as const),
} satisfies Readonly<Record<WorkspaceRole, readonly WorkspacePermission[]>>);

const knownWorkspaceRoles: ReadonlySet<string> = new Set(workspaceRoles);
const knownWorkspacePermissions: ReadonlySet<string> = new Set(
  workspacePermissions,
);

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && knownWorkspaceRoles.has(value);
}

export function isWorkspacePermission(
  value: unknown,
): value is WorkspacePermission {
  return typeof value === "string" && knownWorkspacePermissions.has(value);
}

export function hasWorkspacePermission(
  role: WorkspaceRole,
  permission: WorkspacePermission,
): boolean {
  if (!isWorkspaceRole(role) || !isWorkspacePermission(permission)) {
    return false;
  }

  return (
    WORKSPACE_PERMISSION_MATRIX[role] as readonly WorkspacePermission[]
  ).includes(permission);
}

export class WorkspacePermissionDeniedError extends Error {
  readonly code = "WORKSPACE_PERMISSION_DENIED" as const;

  constructor() {
    super("Acesso ao workspace não autorizado.");
    this.name = "WorkspacePermissionDeniedError";
  }
}

export function assertWorkspacePermission(
  role: WorkspaceRole,
  permission: WorkspacePermission,
): void {
  if (!hasWorkspacePermission(role, permission)) {
    throw new WorkspacePermissionDeniedError();
  }
}
