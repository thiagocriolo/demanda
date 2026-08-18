import { describe, expect, it } from "vitest";
import {
  defaultPersonalSettings,
  defaultWorkspaceSettings,
} from "../../settings/defaults";
import { personalSettingsSchema, workspaceSettingsSchema } from "./validation";

describe("BE-09 settings validation", () => {
  it("aceita os valores padrao separados por escopo", () => {
    expect(personalSettingsSchema.parse(defaultPersonalSettings())).toEqual(
      defaultPersonalSettings(),
    );
    expect(workspaceSettingsSchema.parse(defaultWorkspaceSettings())).toEqual(
      defaultWorkspaceSettings(),
    );
  });

  it("rejeita propriedades arbitrarias em preferencias pessoais", () => {
    expect(() =>
      personalSettingsSchema.parse({
        ...defaultPersonalSettings(),
        segredoLocal: "nao deve ser sincronizado",
      }),
    ).toThrow();
  });

  it("rejeita foto base64 nas preferências pessoais", () => {
    const settings = defaultPersonalSettings();
    settings.profile.photo = "data:image/png;base64,iVBORw0KGgo=";
    expect(personalSettingsSchema.safeParse(settings).success).toBe(false);
  });

  it("migra perfis antigos sem capa e rejeita capa base64", () => {
    const settings = defaultPersonalSettings();
    const { cover: _legacyCover, ...legacyProfile } = settings.profile;
    expect(
      personalSettingsSchema.parse({
        ...settings,
        profile: legacyProfile,
      }).profile.cover,
    ).toBe("");

    settings.profile.cover = "data:image/png;base64,iVBORw0KGgo=";
    expect(personalSettingsSchema.safeParse(settings).success).toBe(false);
  });

  it("protege niveis obrigatorios dos catalogos compartilhados", () => {
    const settings = defaultWorkspaceSettings();
    settings.taskStatuses = settings.taskStatuses.filter(
      ({ key }) => key !== "conclusao",
    );
    expect(workspaceSettingsSchema.safeParse(settings).success).toBe(false);
  });

  it("rejeita uma entrega associada a um modelo de projeto inexistente", () => {
    const settings = defaultWorkspaceSettings();
    settings.deliveryTemplates[0] = {
      ...settings.deliveryTemplates[0]!,
      projectTemplateId: "modelo-inexistente",
    };
    expect(workspaceSettingsSchema.safeParse(settings).success).toBe(false);
  });

  it("aceita o mesmo modelo de tarefa várias vezes com nomes independentes", () => {
    const settings = defaultWorkspaceSettings();
    const service = settings.serviceTemplates[0]!;
    const templateId = settings.deliveryTemplates[0]!.id;
    service.tasks = [
      { id: "ocorrencia-1", templateId, name: "Primeira etapa" },
      { id: "ocorrencia-2", templateId, name: "Revisão da etapa" },
    ];

    const parsed = workspaceSettingsSchema.parse(settings);
    expect(parsed.serviceTemplates[0]?.tasks).toEqual(service.tasks);
  });

  it("rejeita uma ocorrência cujo modelo de tarefa não existe", () => {
    const settings = defaultWorkspaceSettings();
    settings.serviceTemplates[0]!.tasks = [
      {
        id: "ocorrencia-invalida",
        templateId: "modelo-inexistente",
        name: "Tarefa inválida",
      },
    ];

    expect(workspaceSettingsSchema.safeParse(settings).success).toBe(false);
  });
});
