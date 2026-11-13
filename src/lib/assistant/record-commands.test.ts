import { describe, expect, it } from "vitest";
import { parseRecordCommand, parseRecordCommands } from "./record-commands";

describe("parseRecordCommand", () => {
  it("interpreta um contato", () => {
    expect(parseRecordCommand("Adicione um contato chamado Caleb.")).toEqual({
      ok: true,
      command: { kind: "contact", name: "Caleb" },
    });
  });

  it("interpreta negócio e responsável", () => {
    expect(
      parseRecordCommand("Crie um negócio chamado Macajo do Caleb"),
    ).toEqual({
      ok: true,
      command: { kind: "business", name: "Macajo", contactName: "Caleb" },
    });
  });

  it("interpreta projeto e tarefa", () => {
    expect(
      parseRecordCommand("Criar projeto Site para negócio Macajo"),
    ).toEqual({
      ok: true,
      command: { kind: "project", name: "Site", businessName: "Macajo" },
    });
    expect(
      parseRecordCommand("Adicionar tarefa Wireframe para projeto Site"),
    ).toEqual({
      ok: true,
      command: { kind: "task", name: "Wireframe", projectName: "Site" },
    });
  });

  it("aceita uma série de comandos canônicos", () => {
    expect(
      parseRecordCommands(`CRIE CONTATO: Caleb
CRIE NEGÓCIO: Macajo | RESPONSÁVEL: Caleb
CRIE PROJETO: Site | NEGÓCIO: Macajo
CRIE TAREFA: Wireframe | PROJETO: Site`),
    ).toEqual({
      ok: true,
      commands: [
        { kind: "contact", name: "Caleb" },
        { kind: "business", name: "Macajo", contactName: "Caleb" },
        { kind: "project", name: "Site", businessName: "Macajo" },
        { kind: "task", name: "Wireframe", projectName: "Site" },
      ],
    });
  });

  it("aceita o documento versionado que a IA deve gerar", () => {
    expect(
      parseRecordCommands(`{
  "protocol": "demanda.commands/v1",
  "commands": [
    {
      "id": "contact-caleb",
      "action": "create",
      "resource": "contact",
      "data": { "name": "Caleb" }
    },
    {
      "id": "business-macajo",
      "action": "create",
      "resource": "business",
      "data": {
        "name": "Macajo",
        "responsibleContactName": "Caleb"
      }
    }
  ]
}`),
    ).toEqual({
      ok: true,
      commands: [
        { kind: "contact", name: "Caleb" },
        { kind: "business", name: "Macajo", contactName: "Caleb" },
      ],
      queueCommands: [
        {
          id: "contact-caleb",
          command: { kind: "contact", name: "Caleb" },
          dependsOn: undefined,
        },
        {
          id: "business-macajo",
          command: {
            kind: "business",
            name: "Macajo",
            contactName: "Caleb",
          },
          dependsOn: undefined,
        },
      ],
    });
  });

  it("aceita referências de comandos e subtarefas no protocolo v2", () => {
    expect(
      parseRecordCommands(`{
  "protocol": "demanda.commands/v2",
  "commands": [
    {
      "id": "project-site",
      "action": "create",
      "resource": "project",
      "data": { "name": "Site", "businessRef": "business-acme" }
    },
    {
      "id": "task-home",
      "dependsOn": ["project-site"],
      "action": "create",
      "resource": "task",
      "data": {
        "name": "Atualizar home",
        "projectRef": "project-site",
        "subtasks": [{ "name": "Atualizar layout" }]
      }
    }
  ]
}`),
    ).toMatchObject({
      ok: true,
      queueCommands: [
        {
          id: "project-site",
          command: {
            kind: "project",
            name: "Site",
            businessRef: "business-acme",
          },
        },
        {
          id: "task-home",
          command: {
            kind: "task",
            name: "Atualizar home",
            projectRef: "project-site",
            subtasks: [{ name: "Atualizar layout", durationMinutes: 60 }],
          },
        },
      ],
    });
  });

  it("aceita o tipo cíclico ou pontual na criação de projeto", () => {
    expect(
      parseRecordCommands(`{
  "protocol": "demanda.commands/v2",
  "commands": [
    {
      "id": "project-monthly",
      "action": "create",
      "resource": "project",
      "data": {
        "name": "Gestão mensal",
        "businessName": "Macajo",
        "contractType": "cíclico"
      }
    },
    {
      "id": "project-site",
      "action": "create",
      "resource": "project",
      "data": {
        "name": "Site institucional",
        "businessName": "Macajo",
        "contractType": "pontual"
      }
    }
  ]
}`),
    ).toMatchObject({
      ok: true,
      queueCommands: [
        {
          id: "project-monthly",
          command: { kind: "project", contractType: "recurring" },
        },
        {
          id: "project-site",
          command: { kind: "project", contractType: "one_off" },
        },
      ],
    });
  });

  it("aceita modelos de serviço e entrega vinculados", () => {
    expect(
      parseRecordCommands(`{
  "protocol": "demanda.commands/v2",
  "commands": [
    {
      "id": "service-social",
      "action": "create",
      "resource": "service_template",
      "data": { "name": "Gestão social" }
    },
    {
      "id": "delivery-calendar",
      "action": "create",
      "resource": "delivery_template",
      "data": {
        "name": "Calendário",
        "serviceTemplateRef": "service-social"
      }
    }
  ]
}`),
    ).toMatchObject({
      ok: true,
      queueCommands: [
        {
          id: "service-social",
          command: { kind: "service_template", name: "Gestão social" },
        },
        {
          id: "delivery-calendar",
          command: {
            kind: "delivery_template",
            name: "Calendário",
            serviceTemplateRef: "service-social",
          },
        },
      ],
    });
  });
});
