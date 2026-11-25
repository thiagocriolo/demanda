import { describe, expect, it, vi } from "vitest";
import type { EntityRecord } from "$lib/entities/types";

vi.mock("$app/environment", () => ({ browser: false }));

import { loadAgendaItems } from "./storage";

function projectRecord(overrides: Partial<EntityRecord>): EntityRecord {
  return {
    id: crypto.randomUUID(),
    workspaceId: "ws-1",
    nome: "Projeto Regular",
    negocio: "Tacho de Cobre",
    status: "execucao",
    dataFim: "",
    isInstitutional: "false",
    contract_type: "one_off",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function deliveryRecord(overrides: Partial<EntityRecord>): EntityRecord {
  return {
    id: crypto.randomUUID(),
    workspaceId: "ws-1",
    nome: "Entrega",
    negocio: "Tacho de Cobre",
    projeto: "Institucional",
    status: "fila",
    dataEntrega: "",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("loadAgendaItems", () => {
  it("exclui entregas de projetos recorrentes e projetos institucionais da agenda, mantendo entregas de projetos pontuais", () => {
    const regularProject = projectRecord({
      id: "project-regular",
      nome: "Campanha",
      contract_type: "one_off",
      dataFim: "",
    });
    const regularRecurringProject = projectRecord({
      id: "project-regular-recurring",
      nome: "Gestão Mensal",
      isInstitutional: "false",
      contract_type: "recurring",
      dataFim: "",
    });
    const recurringInstitutional = projectRecord({
      id: "project-inst-recurring",
      nome: "Institucional",
      isInstitutional: "true",
      contract_type: "recurring",
      dataFim: "",
    });
    const oneOffInstitutional = projectRecord({
      id: "project-inst-one-off",
      nome: "Institucional",
      isInstitutional: "true",
      contract_type: "one_off",
      dataFim: "",
    });

    const regularDelivery = deliveryRecord({
      id: "delivery-regular",
      projetoId: regularProject.id,
      projectWorkspaceId: "ws-1",
      dataEntrega: "2026-12-01",
    });
    const regularRecurringDelivery = deliveryRecord({
      id: "delivery-regular-recurring",
      projetoId: regularRecurringProject.id,
      projectWorkspaceId: "ws-1",
      dataEntrega: "",
    });
    const recurringInstitutionalDelivery = deliveryRecord({
      id: "delivery-inst-recurring",
      projetoId: recurringInstitutional.id,
      projectWorkspaceId: "ws-1",
      dataEntrega: "",
    });
    const oneOffInstitutionalDelivery = deliveryRecord({
      id: "delivery-inst-one-off",
      projetoId: oneOffInstitutional.id,
      projectWorkspaceId: "ws-1",
      dataEntrega: "2026-12-05",
    });

    const items = loadAgendaItems(
      [
        regularProject,
        regularRecurringProject,
        recurringInstitutional,
        oneOffInstitutional,
      ],
      [
        regularDelivery,
        regularRecurringDelivery,
        recurringInstitutionalDelivery,
        oneOffInstitutionalDelivery,
      ],
    );

    expect(items.projects.map(({ id }) => id)).toEqual([
      regularProject.id,
      regularRecurringProject.id,
    ]);
    expect(items.deliveries.map(({ id }) => id)).toEqual([
      regularDelivery.id,
      oneOffInstitutionalDelivery.id,
    ]);
  });
});
