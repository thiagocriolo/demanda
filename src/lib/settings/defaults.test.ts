import { describe, expect, it } from "vitest";
import { defaultWorkspaceSettings, freshSettings } from "./defaults";

describe("configurações padrão de status", () => {
  it("usa um ícone exclusivo em cada um dos 20 status", () => {
    const settings = defaultWorkspaceSettings();
    const statuses = [
      ...settings.personStatuses,
      ...settings.businessStatuses,
      ...settings.projectStatuses,
      ...settings.taskStatuses,
    ];

    expect(statuses).toHaveLength(20);
    expect(new Set(statuses.map(({ icon }) => icon)).size).toBe(20);
  });
});

describe("configurações padrão das gavetas", () => {
  it("mantém Agenda e Cronograma fechados até o usuário alterar a preferência", () => {
    const settings = freshSettings();

    expect(settings.agendaDrawerDefault).toBe("collapsed");
    expect(settings.cronogramaDrawerDefault).toBe("collapsed");
  });
});
