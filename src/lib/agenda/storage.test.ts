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
  it("exclui projetos institucionais da aba de projetos e inclui todas as entregas ativas marcando as recorrentes", () => {
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
      projectContractType: "recurring",
      recurrence: "weekly",
      dataEntrega: "2026-12-04",
    });
    const recurringInstitutionalDelivery = deliveryRecord({
      id: "delivery-inst-recurring",
      projetoId: recurringInstitutional.id,
      projectWorkspaceId: "ws-1",
      projectContractType: "recurring",
      recurrence: "weekly",
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
    expect(items.deliveries.map(({ id, isRecurring }) => ({ id, isRecurring }))).toEqual([
      { id: regularDelivery.id, isRecurring: false },
      { id: regularRecurringDelivery.id, isRecurring: true },
      { id: recurringInstitutionalDelivery.id, isRecurring: true },
      { id: oneOffInstitutionalDelivery.id, isRecurring: false },
    ]);
  });
});
