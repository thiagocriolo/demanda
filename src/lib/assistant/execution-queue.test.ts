import { describe, expect, it } from "vitest";
import {
  compileRecordCommandQueue,
  executeCompiledRecordCommandQueue,
  type QueuedRecordCommand,
} from "./execution-queue";

const twoBranches: QueuedRecordCommand[] = [
  { id: "contact-a", command: { kind: "contact", name: "Ana" } },
  {
    id: "business-a",
    command: { kind: "business", name: "Agência A", contactName: "Ana" },
  },
  {
    id: "project-a",
    command: { kind: "project", name: "Site A", businessName: "Agência A" },
  },
  {
    id: "task-a",
    command: { kind: "task", name: "Wireframe A", projectName: "Site A" },
  },
  { id: "contact-b", command: { kind: "contact", name: "Bruno" } },
  {
    id: "business-b",
    command: { kind: "business", name: "Agência B", contactName: "Bruno" },
  },
];

describe("compileRecordCommandQueue", () => {
  it("infere a árvore de dependências pelos relacionamentos dos registros", () => {
    expect(
      compileRecordCommandQueue(twoBranches).map(({ id, dependsOn }) => ({
        id,
        dependsOn,
      })),
    ).toEqual([
      { id: "contact-a", dependsOn: [] },
      { id: "business-a", dependsOn: ["contact-a"] },
      { id: "project-a", dependsOn: ["business-a"] },
      { id: "task-a", dependsOn: ["project-a"] },
      { id: "contact-b", dependsOn: [] },
      { id: "business-b", dependsOn: ["contact-b"] },
    ]);
  });

  it("rejeita dependências inexistentes e ciclos", () => {
    expect(() =>
      compileRecordCommandQueue([
        {
          id: "contact-a",
          command: { kind: "contact", name: "Ana" },
          dependsOn: ["unknown"],
        },
      ]),
    ).toThrow("não existe no lote");
    expect(() =>
      compileRecordCommandQueue([
        {
          id: "contact-a",
          command: { kind: "contact", name: "Ana" },
          dependsOn: ["contact-b"],
        },
        {
          id: "contact-b",
          command: { kind: "contact", name: "Bruno" },
          dependsOn: ["contact-a"],
        },
      ]),
    ).toThrow("formam um ciclo");
  });

  it("aceita dependsOn explícito para desambiguar nomes repetidos", () => {
    const queue = compileRecordCommandQueue([
      { id: "contact-a", command: { kind: "contact", name: "Ana" } },
      { id: "contact-b", command: { kind: "contact", name: "Ana" } },
      {
        id: "business-a",
        command: { kind: "business", name: "Agência A", contactName: "Ana" },
        dependsOn: ["contact-a"],
      },
    ]);

    expect(queue.find(({ id }) => id === "business-a")?.dependsOn).toEqual([
      "contact-a",
    ]);
  });

  it("cria dependência da entrega para o modelo de serviço referenciado", () => {
    const queue = compileRecordCommandQueue([
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
    ]);

    expect(
      queue.find(({ id }) => id === "delivery-calendar")?.dependsOn,
    ).toEqual(["service-social"]);
  });
});

describe("executeCompiledRecordCommandQueue", () => {
  it("entrega o ID criado pelo comando-pai ao comando que o referencia", async () => {
    const result = await executeCompiledRecordCommandQueue(
      compileRecordCommandQueue([
        { id: "contact-ana", command: { kind: "contact", name: "Ana" } },
        {
          id: "business-a",
          command: {
            kind: "business",
            name: "Agência A",
            contactRef: "contact-ana",
          },
        },
      ]),
      async (command, context) => {
        if (command.kind === "contact") {
          return {
            message: "Contato criado.",
            created: [],
            output: { contactId: "contact-id" },
          };
        }
        expect(context.outputsByCommandId.get("contact-ana")?.contactId).toBe(
          "contact-id",
        );
        return {
          message: "Negócio criado.",
          created: [],
          output: { businessId: "business-id" },
        };
      },
    );

    expect(result.progress.map(({ status }) => status)).toEqual([
      "succeeded",
      "succeeded",
    ]);
  });

  it("bloqueia somente os descendentes do comando que falhou", async () => {
    const result = await executeCompiledRecordCommandQueue(
      compileRecordCommandQueue(twoBranches),
      async (command) => {
        if (command.name === "Wireframe A")
          throw new Error("Sem responsável disponível.");
        return { message: `Criado ${command.name}.`, created: [] };
      },
    );

    expect(result.progress.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "contact-a", status: "succeeded" },
      { id: "business-a", status: "succeeded" },
      { id: "project-a", status: "succeeded" },
      { id: "task-a", status: "failed" },
      { id: "contact-b", status: "succeeded" },
      { id: "business-b", status: "succeeded" },
    ]);
  });

  it("não executa os descendentes de uma falha", async () => {
    const result = await executeCompiledRecordCommandQueue(
      compileRecordCommandQueue(twoBranches),
      async (command) => {
        if (command.name === "Agência A") throw new Error("Falha no negócio.");
        return { message: `Criado ${command.name}.`, created: [] };
      },
    );

    expect(result.progress.find(({ id }) => id === "project-a")?.status).toBe(
      "blocked",
    );
    expect(result.progress.find(({ id }) => id === "task-a")?.status).toBe(
      "blocked",
    );
    expect(result.progress.find(({ id }) => id === "business-b")?.status).toBe(
      "succeeded",
    );
  });

  it("pausa um ramo ambíguo como decisão necessária", async () => {
    const result = await executeCompiledRecordCommandQueue(
      compileRecordCommandQueue([
        {
          id: "project",
          command: { kind: "project", name: "Site", businessName: "A" },
        },
        {
          id: "task",
          command: { kind: "task", name: "Home", projectRef: "project" },
        },
      ]),
      async (command) => {
        if (command.kind === "project") {
          const error = Object.assign(new Error("Escolha o negócio A."), {
            name: "RecordResolutionRequiredError",
            options: [{ id: "business-1", label: "A" }],
          });
          throw error;
        }
        return { message: "Não deveria executar.", created: [] };
      },
    );

    expect(result.progress.find(({ id }) => id === "project")?.status).toBe(
      "needs_resolution",
    );
    expect(result.progress.find(({ id }) => id === "task")?.status).toBe(
      "blocked",
    );
  });
});
