import { describe, expect, it } from "vitest";
import {
  assertWorkspacePermission,
  hasWorkspacePermission,
  isWorkspacePermission,
  isWorkspaceRole,
  WORKSPACE_PERMISSION_MATRIX,
  WorkspacePermissionDeniedError,
  workspacePermissions,
  workspaceRoles,
  type WorkspacePermission,
  type WorkspaceRole,
} from "./policy";

const expectedPermissionMatrix: Record<
  WorkspaceRole,
  Record<WorkspacePermission, boolean>
> = {
  owner: {
    "workspace:read": true,
    "workspace:write": true,
    "workspace:administer": true,
    "workspace:own": true,
  },
  admin: {
    "workspace:read": true,
    "workspace:write": true,
    "workspace:administer": true,
    "workspace:own": false,
  },
  member: {
    "workspace:read": true,
    "workspace:write": true,
    "workspace:administer": false,
    "workspace:own": false,
  },
};

describe("política de autorização de workspace", () => {
  it.each(
    workspaceRoles.flatMap((role) =>
      workspacePermissions.map(
        (permission) =>
          [
            role,
            permission,
            expectedPermissionMatrix[role][permission],
          ] as const,
      ),
    ),
  )("avalia %s / %s como %s", (role, permission, expected) => {
    expect(hasWorkspacePermission(role, permission)).toBe(expected);
  });

  it("expõe uma matriz profundamente imutável", () => {
    expect(Object.isFrozen(WORKSPACE_PERMISSION_MATRIX)).toBe(true);

    for (const role of workspaceRoles) {
      expect(Object.isFrozen(WORKSPACE_PERMISSION_MATRIX[role])).toBe(true);
    }
  });

  it("reconhece somente papéis e permissões declarados", () => {
    for (const role of workspaceRoles) {
      expect(isWorkspaceRole(role)).toBe(true);
    }

    for (const permission of workspacePermissions) {
      expect(isWorkspacePermission(permission)).toBe(true);
    }

    expect(isWorkspaceRole("viewer")).toBe(false);
    expect(isWorkspaceRole(null)).toBe(false);
    expect(isWorkspacePermission("workspace:delete")).toBe(false);
    expect(isWorkspacePermission(undefined)).toBe(false);
  });

  it.each(["viewer", "", "__proto__", "constructor", null, undefined])(
    "nega o papel inválido %s",
    (role) => {
      expect(
        hasWorkspacePermission(
          role as unknown as WorkspaceRole,
          "workspace:read",
        ),
      ).toBe(false);
    },
  );

  it.each(["workspace:delete", "read", "", "__proto__", null, undefined])(
    "nega a permissão inválida %s",
    (permission) => {
      expect(
        hasWorkspacePermission(
          "owner",
          permission as unknown as WorkspacePermission,
        ),
      ).toBe(false);
    },
  );

  it("não lança para uma permissão concedida", () => {
    expect(() =>
      assertWorkspacePermission("admin", "workspace:administer"),
    ).not.toThrow();
  });

  it("lança um erro próprio e sem contexto sensível quando nega", () => {
    let thrown: unknown;

    try {
      assertWorkspacePermission("member", "workspace:administer");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkspacePermissionDeniedError);
    expect(thrown).toMatchObject({
      name: "WorkspacePermissionDeniedError",
      code: "WORKSPACE_PERMISSION_DENIED",
      message: "Acesso ao workspace não autorizado.",
    });
    expect((thrown as Error).message).not.toContain("member");
    expect((thrown as Error).message).not.toContain("workspace:administer");
  });

  it("também lança o erro próprio para entradas inválidas forçadas", () => {
    expect(() =>
      assertWorkspacePermission("viewer" as WorkspaceRole, "workspace:read"),
    ).toThrow(WorkspacePermissionDeniedError);
    expect(() =>
      assertWorkspacePermission(
        "owner",
        "workspace:delete" as WorkspacePermission,
      ),
    ).toThrow(WorkspacePermissionDeniedError);
  });
});
