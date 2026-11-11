import { describe, expect, it } from "vitest";
import type { RecordsTabConfig } from "../types";
import { businessRecordsDomain } from "./businesses";
import { contactRecordsDomain } from "./contacts";
import { projectRecordsDomain } from "./projects";
import { taskRecordsDomain } from "./tasks";

const baseRecord = {
  id: "record-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function tabConfig(
  kind: RecordsTabConfig["kind"],
  statusField: string,
  emptyLabel: string,
): RecordsTabConfig {
  return {
    kind,
    statusField,
    emptyLabel,
    config: { fields: [] },
  } as unknown as RecordsTabConfig;
}

const peopleConfig = tabConfig("pessoa", "tipo", "contato");
const businessConfig = tabConfig("negocio", "etapa", "negócio");
const projectConfig = tabConfig("projeto", "status", "projeto");
const taskConfig = tabConfig("tarefa", "status", "tarefa");

describe("records domain cards", () => {
  it("maps contact details without leaking client DTOs to the page", () => {
    const card = contactRecordsDomain.toCard(
      peopleConfig,
      {
        ...baseRecord,
        nome: "Maria",
        tipo: "ativo",
        telefone: "+55 85 99999-9999",
        email: "maria@example.com",
        cargo: "Designer",
      },
      [],
    );

    expect(card).toMatchObject({
      kind: "pessoa",
      primary: "+55 85 99999-9999",
      secondary: "maria@example.com",
      relation: "Designer",
    });
  });

  it("maps business responsibles and project deadlines", () => {
    const business = businessRecordsDomain.toCard(
      businessConfig,
      {
        ...baseRecord,
        nome: "Cliente",
        responsaveis: "Ana, Bruno",
        observacoes: "Conta estratégica",
      },
      [],
    );
    const project = projectRecordsDomain.toCard(
      projectConfig,
      {
        ...baseRecord,
        nome: "Site",
        negocio: "Cliente",
        dataFim: "2026-08-20",
      },
      [],
    );

    expect(business).toMatchObject({ primary: "Ana", primaryMore: "+1" });
    expect(project).toMatchObject({
      secondary: "Cliente",
      completion: "20/08/2026",
    });
  });

  it("maps task progress while tolerating malformed subtasks", () => {
    const completed = taskRecordsDomain.toCard(
      taskConfig,
      {
        ...baseRecord,
        nome: "Entrega",
        subtarefas: JSON.stringify([
          { status: "concluida" },
          { status: "pendente" },
        ]),
      },
      [],
    );
    const malformed = taskRecordsDomain.toCard(
      taskConfig,
      { ...baseRecord, nome: "Entrega", subtarefas: "{" },
      [],
    );

    expect(completed.steps).toBe("1/2");
    expect(malformed.steps).toBe("0/0");
  });
});
