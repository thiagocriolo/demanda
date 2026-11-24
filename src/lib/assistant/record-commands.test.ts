import { describe, expect, it } from "vitest";
import { parseRecordCommand, parseRecordCommands } from "./record-commands";

describe("parseRecordCommand", () => {
  it("interpreta um contato", () => {
    expect(parseRecordCommand("Adicione um contato chamado Caleb.")).toEqual({
      ok: true,
      command: { kind: "contact", name: "Caleb" },
    });
  });

  it("interpreta pessoa, workspace, serviço e lançamento financeiro", () => {
    expect(parseRecordCommand("Crie uma pessoa chamada Ana.")).toEqual({
      ok: true,
      command: { kind: "contact", name: "Ana" },
    });
    expect(parseRecordCommand("Crie um workspace chamado Estúdio.")).toEqual({
      ok: true,
      command: { kind: "workspace", name: "Estúdio" },
    });
    expect(
      parseRecordCommand("Crie um serviço chamado Gestão social."),
    ).toEqual({
      ok: true,
      command: { kind: "service", name: "Gestão social" },
    });
    expect(
      parseRecordCommand(
        "Registre uma receita Fee de R$ 2.500,00 para 2026-11-30",
      ),
    ).toEqual({
      ok: true,
      command: {
        kind: "finance_entry",
        name: "Fee",
        type: "revenue",
        amountCents: 250000,
        dueDate: "2026-11-30",
      },
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
      command: { kind: "delivery", name: "Wireframe", projectName: "Site" },
    });
  });

  it("aceita uma série de comandos canônicos", () => {
    expect(
      parseRecordCommands(`CRIE CONTATO: Caleb
CRIE NEGÓCIO: Macajo | RESPONSÁVEL: Caleb
CRIE PROJETO: Site | CONTRATO: Fee Macajo
CRIE TAREFA: Wireframe | PROJETO: Site`),
    ).toEqual({
      ok: true,
      commands: [
        { kind: "contact", name: "Caleb" },
        { kind: "business", name: "Macajo", contactNames: ["Caleb"] },
        { kind: "project", name: "Site", contractName: "Fee Macajo" },
        { kind: "delivery", name: "Wireframe", projectName: "Site" },
      ],
    });
  });

  it("cria contato com combinações de status, telefone e e-mail", () => {
    expect(
      parseRecordCommands(
        "CRIE CONTATO: Rafael Monteiro | STATUS: Ativo | TELEFONE: (88) 99999-0000 | E-MAIL: rafael@exemplo.com | PROFISSÃO: Designer | OBSERVAÇÕES: Indicado pela Camila",
      ),
    ).toEqual({
      ok: true,
      commands: [
        {
          kind: "contact",
          name: "Rafael Monteiro",
          status: "active",
          profession: "Designer",
          phones: [
            {
              type: "whatsapp",
              label: "WhatsApp",
              value: "(88) 99999-0000",
              isPrimary: true,
            },
          ],
          emails: [
            {
              type: "work",
              label: "Principal",
              value: "rafael@exemplo.com",
              isPrimary: true,
            },
          ],
          notes: [{ body: "Indicado pela Camila" }],
        },
      ],
    });
  });

  it("rejeita um status de contato que não existe", () => {
    expect(
      parseRecordCommands(
        "CRIE CONTATO: Rafael Monteiro | STATUS: Novo status",
      ),
    ).toEqual({
      ok: false,
      message:
        "Linha 1: data.status precisa ser Lead, Prospecto, Ativo, Desativado ou Arquivado.",
    });
  });

  it("converte o status exibido de negócio para sua chave canônica", () => {
    expect(
      parseRecordCommands(
        "CRIE NEGÓCIO: Estúdio | RESPONSÁVEL: Caleb | STATUS: Ativado",
      ),
    ).toMatchObject({
      ok: true,
      commands: [{ kind: "business", stage: "ativo" }],
    });
  });

  it("preserva todos os campos de contato no protocolo estruturado", () => {
    expect(
      parseRecordCommands(`{
  "protocol": "demanda.commands/v2",
  "commands": [{
    "id": "contact-rafael",
    "action": "create",
    "resource": "contact",
    "data": {
      "name": "Rafael Monteiro",
      "contactType": "person",
      "status": "ativo",
      "phones": [{ "type": "mobile", "label": "Celular", "value": "+5588999990000", "isPrimary": true }],
      "emails": [{ "type": "work", "label": "Trabalho", "value": "rafael@exemplo.com", "isPrimary": true }],
      "notes": [{ "body": "Cliente prioritário" }]
    }
  }]
}`),
    ).toMatchObject({
      ok: true,
      commands: [
        {
          kind: "contact",
          status: "active",
          phones: [{ type: "mobile", value: "+5588999990000" }],
          emails: [{ type: "work", value: "rafael@exemplo.com" }],
        },
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

  it("aceita referências de comandos e tarefas no protocolo v2", () => {
    expect(
      parseRecordCommands(`{
  "protocol": "demanda.commands/v2",
  "commands": [
    {
      "id": "project-site",
      "action": "create",
      "resource": "project",
      "data": { "name": "Site", "contractRef": "contract-acme" }
    },
    {
      "id": "delivery-home",
      "dependsOn": ["project-site"],
      "action": "create",
      "resource": "delivery",
      "data": {
        "name": "Atualizar home",
        "projectRef": "project-site",
        "tasks": [{ "name": "Atualizar layout" }]
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
            contractRef: "contract-acme",
          },
        },
        {
          id: "delivery-home",
          command: {
            kind: "delivery",
            name: "Atualizar home",
            projectRef: "project-site",
            tasks: [{ name: "Atualizar layout", durationMinutes: 60 }],
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
        "contractName": "Fee Macajo",
        "contractType": "cíclico"
      }
    },
    {
      "id": "project-site",
      "action": "create",
      "resource": "project",
      "data": {
        "name": "Site institucional",
        "contractName": "Fee Macajo",
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

  it("aceita workspace, contrato, serviço e lançamento financeiro", () => {
    expect(
      parseRecordCommands(`{
  "protocol": "demanda.commands/v2",
  "commands": [
    { "id": "workspace", "action": "create", "resource": "workspace", "data": { "name": "Acme" } },
    { "id": "service", "action": "create", "resource": "service", "data": { "name": "Gestão social" } },
    { "id": "contract", "action": "create", "resource": "contract", "data": { "name": "Mensal", "businessRef": "business", "contractType": "recorrente", "amountCents": 250000 } },
    { "id": "revenue", "action": "create", "resource": "finance_entry", "data": { "name": "Fee novembro", "type": "receita", "amountCents": 250000, "dueDate": "2026-11-30" } }
  ]
}`),
    ).toMatchObject({
      ok: true,
      commands: [
        { kind: "workspace", name: "Acme" },
        { kind: "service", name: "Gestão social" },
        {
          kind: "contract",
          name: "Mensal",
          businessRef: "business",
          contractType: "recurring",
          amountCents: 250000,
        },
        {
          kind: "finance_entry",
          name: "Fee novembro",
          type: "revenue",
          amountCents: 250000,
          dueDate: "2026-11-30",
        },
      ],
    });
  });
});
