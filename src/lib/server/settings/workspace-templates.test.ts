import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultWorkspaceSettings } from "../../settings/defaults";
import type { SettingsDatabase } from "./database";
import * as hydration from "./workspace-template-hydration";
import * as templates from "./workspace-templates";

const collaborators = vi.hoisted(() => ({
  loadWorkspaceMemberIndex: vi.fn(),
  synchronizeServiceTemplates: vi.fn(),
  synchronizeDeliveryTemplates: vi.fn(),
  synchronizeServiceTaskTemplates: vi.fn(),
}));

vi.mock("./workspace-template-members", () => ({
  loadWorkspaceMemberIndex: collaborators.loadWorkspaceMemberIndex,
}));

vi.mock("./workspace-service-template-sync", () => ({
  synchronizeServiceTemplates: collaborators.synchronizeServiceTemplates,
}));

vi.mock("./workspace-delivery-template-sync", () => ({
  synchronizeDeliveryTemplates: collaborators.synchronizeDeliveryTemplates,
  synchronizeServiceTaskTemplates:
    collaborators.synchronizeServiceTaskTemplates,
}));

describe("workspace templates facade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserva a implementação pública de hidratação", () => {
    expect(templates.hydrateWorkspaceTemplates).toBe(
      hydration.hydrateWorkspaceTemplates,
    );
  });

  it("mantém a sincronização disponível pelo ponto de entrada canônico", () => {
    expect(templates.synchronizeWorkspaceTemplates).toEqual(
      expect.any(Function),
    );
  });

  it("preserva a ordem e os resultados intermediários da sincronização", async () => {
    const database = {} as SettingsDatabase;
    const workspaceId = "workspace-1";
    const actorUserId = "user-1";
    const settings = defaultWorkspaceSettings();
    const tagIds = new Map([["tag", "tag-1"]]);
    const members = {
      ids: new Set([actorUserId]),
      byName: new Map<string, string[]>(),
    };
    const serviceIds = new Map([["service-client", "service-db"]]);
    const deliveryIds = new Map([["delivery-client", "delivery-db"]]);
    const now = new Date("2026-08-18T12:00:00.000Z");
    collaborators.loadWorkspaceMemberIndex.mockResolvedValue(members);
    collaborators.synchronizeServiceTemplates.mockResolvedValue(serviceIds);
    collaborators.synchronizeDeliveryTemplates.mockResolvedValue(deliveryIds);
    collaborators.synchronizeServiceTaskTemplates.mockResolvedValue(undefined);

    await templates.synchronizeWorkspaceTemplates(
      database,
      workspaceId,
      actorUserId,
      settings,
      tagIds,
      now,
    );

    expect(collaborators.loadWorkspaceMemberIndex).toHaveBeenCalledWith(
      database,
      workspaceId,
    );
    expect(collaborators.synchronizeServiceTemplates).toHaveBeenCalledWith(
      database,
      workspaceId,
      actorUserId,
      settings,
      tagIds,
      members,
      now,
    );
    expect(collaborators.synchronizeDeliveryTemplates).toHaveBeenCalledWith(
      database,
      workspaceId,
      settings,
      serviceIds,
      tagIds,
      members,
      now,
    );
    expect(collaborators.synchronizeServiceTaskTemplates).toHaveBeenCalledWith(
      database,
      workspaceId,
      settings,
      serviceIds,
      deliveryIds,
      now,
    );
    expect(
      collaborators.loadWorkspaceMemberIndex.mock.invocationCallOrder[0],
    ).toBeLessThan(
      collaborators.synchronizeServiceTemplates.mock.invocationCallOrder[0]!,
    );
    expect(
      collaborators.synchronizeServiceTemplates.mock.invocationCallOrder[0],
    ).toBeLessThan(
      collaborators.synchronizeDeliveryTemplates.mock.invocationCallOrder[0]!,
    );
    expect(
      collaborators.synchronizeDeliveryTemplates.mock.invocationCallOrder[0],
    ).toBeLessThan(
      collaborators.synchronizeServiceTaskTemplates.mock
        .invocationCallOrder[0]!,
    );
  });
});
