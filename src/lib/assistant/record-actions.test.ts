import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshSettings } from "../settings/defaults";
import type { SettingsState } from "../settings/types";

const fixtures = vi.hoisted(() => ({
  settings: undefined as SettingsState | undefined,
  savedPayloads: [] as SettingsState[],
}));

vi.mock("$lib/contacts/client", () => ({
  createContact: vi.fn(),
  listContacts: vi.fn(),
}));
vi.mock("$lib/businesses/client", () => ({
  createBusiness: vi.fn(),
  listBusinesses: vi.fn(),
}));
vi.mock("$lib/projects/client", () => ({
  createProject: vi.fn(),
  getProjectOptions: vi.fn(),
  listProjects: vi.fn(),
}));
vi.mock("$lib/tasks/client", () => ({ createTask: vi.fn() }));
vi.mock("$lib/workspaces/workspace-storage", () => ({
  CURRENT_USER: { id: "user-1" },
}));
vi.mock("$lib/settings/client", () => ({
  currentSettings: () => structuredClone(fixtures.settings!),
  saveWorkspaceSettings: async (settings: SettingsState) => {
    fixtures.savedPayloads.push(structuredClone(settings));
    const saved = structuredClone(settings);
    saved.serviceTemplates = saved.serviceTemplates.map((template) =>
      template.name === "Agendamento Publicitário 360°"
        ? { ...template, id: "service-persisted" }
        : template,
    );
    saved.deliveryTemplates = saved.deliveryTemplates.map((template) =>
      template.name === "Planejamento mensal de marketing"
        ? { ...template, id: "delivery-persisted" }
        : template,
    );
    fixtures.settings = saved;
    return structuredClone(saved);
  },
}));

describe("ações de modelos do assistente", () => {
  beforeEach(() => {
    vi.resetModules();
    fixtures.settings = freshSettings();
    fixtures.savedPayloads = [];
  });

  it("usa o ID persistido do serviço na entrega dependente", async () => {
    const { executeRecordCommand } = await import("./record-actions");
    const service = await executeRecordCommand({
      kind: "service_template",
      name: "Agendamento Publicitário 360°",
    });
    const serviceTemplateId = service.output?.serviceTemplateId;

    expect(serviceTemplateId).toBe("service-persisted");

    const delivery = await executeRecordCommand(
      {
        kind: "delivery_template",
        name: "Planejamento mensal de marketing",
        serviceTemplateRef: "s",
      },
      { outputsByCommandId: new Map([["s", { serviceTemplateId }]]) },
    );

    expect(delivery.output?.deliveryTemplateId).toBe("delivery-persisted");
    expect(fixtures.savedPayloads[1]?.deliveryTemplates.at(-1)).toMatchObject({
      projectTemplateId: "service-persisted",
    });
  });
});
