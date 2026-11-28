import { describe, expect, it } from "vitest";
import { freshSettings } from "$lib/settings/defaults";
import type { Project } from "$lib/projects/types";
import {
  copyDeliveryBlueprint,
  copyProjectBlueprint,
  deliveryTemplateBlueprint,
  projectTemplateBlueprint,
  realProjectBlueprint,
} from "./blueprints";
import type { ServicePackageDeliveryInput } from "./types";

const delivery: ServicePackageDeliveryInput = {
  id: "original-delivery",
  name: "Publicação",
  description: "Briefing",
  priority: "normal",
  recurrenceType: "custom",
  recurrenceUnit: "week",
  recurrenceDays: [1, 3],
  tasks: [{ id: "original-task", name: "Produzir", durationMinutes: 90 }],
};

describe("cópias de escopo", () => {
  it("copia projetos, entregas e tarefas com identidades independentes", () => {
    const source = {
      id: "original-project",
      isInstitutional: false,
      name: "Social",
      briefing: "Escopo",
      projectType: "recurring" as const,
      durationDays: 30,
      deliveries: [delivery],
    };
    const copy = copyProjectBlueprint(source);
    expect(copy).not.toHaveProperty("id");
    expect(copy.deliveries[0]).not.toHaveProperty("id");
    expect(copy.deliveries[0].tasks[0]).not.toHaveProperty("id");
    copy.deliveries[0].recurrenceDays.push(5);
    copy.deliveries[0].tasks[0].name = "Revisar";
    expect(delivery.recurrenceDays).toEqual([1, 3]);
    expect(delivery.tasks[0].name).toBe("Produzir");
    expect(copyDeliveryBlueprint(delivery).tasks[0].durationMinutes).toBe(90);
  });

  it("converte os modelos existentes preservando as regras do projeto", () => {
    const settings = freshSettings();
    const source = {
      ...settings.deliveryTemplates[0],
      id: "delivery",
      name: "Post",
      tasks: [
        { id: "task", nome: "Texto", duracao: "1,5", status: "concluida" },
      ],
    };
    const template = {
      ...settings.serviceTemplates[0],
      contractType: "Recorrente",
      deliveries: [
        {
          id: "ref",
          templateId: source.id,
          name: "Post semanal",
          frequency: "custom" as const,
          customUnit: "week" as const,
          recurrenceDays: [2, 4],
        },
      ],
    };
    expect(deliveryTemplateBlueprint(source).tasks).toEqual([
      { name: "Texto", durationMinutes: 90 },
    ]);
    const copy = projectTemplateBlueprint(template, [source]);
    expect(copy.projectType).toBe("recurring");
    expect(copy.deliveries[0]).toMatchObject({
      name: "Post semanal",
      recurrenceType: "custom",
      recurrenceUnit: "week",
      recurrenceDays: [2, 4],
    });
    expect(
      projectTemplateBlueprint({ ...template, contractType: "Pontual" }, [
        source,
      ]).deliveries[0].recurrenceType,
    ).toBe("one_off");
    expect(() => projectTemplateBlueprint(template, [])).toThrow(
      "não está disponível",
    );
  });

  it("extrai apenas a estrutura operacional de um projeto real", () => {
    const project = {
      id: "real",
      isInstitutional: false,
      name: "Site",
      briefing: "Briefing",
      contractType: "one_off",
      startDate: "2026-11-27",
      endDate: "2026-12-07",
      amountCents: 500_000,
      responsibles: [{ userId: "person" }],
      status: "conclusao",
    } as Project;
    const copy = realProjectBlueprint(project, [delivery]);
    expect(copy.durationDays).toBe(10);
    expect(copy).not.toHaveProperty("startDate");
    expect(copy).not.toHaveProperty("responsibles");
    expect(copy).not.toHaveProperty("amountCents");
    expect(copy).not.toHaveProperty("status");
    expect(
      realProjectBlueprint({ ...project, endDate: null }, []).durationDays,
    ).toBeNull();
  });
});
