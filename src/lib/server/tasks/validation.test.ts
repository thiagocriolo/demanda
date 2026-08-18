import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  taskArchiveQuerySchema,
  taskBoardSchema,
  taskCreateSchema,
  taskListQuerySchema,
  taskStateSchema,
  taskSubtaskStateSchema,
  taskUpdateSchema,
} from "./validation";

function createInput() {
  return {
    name: "  Produzir   campanha  ",
    projectId: randomUUID(),
    category: " Criação ",
    priority: " Alta ",
    status: " Produção ",
    briefing: " Briefing da tarefa ",
    dueDate: "2026-08-15",
    tagLabels: ["  Rede   Social  ", "Lançamento"],
    responsibleUserIds: [randomUUID()],
    subtasks: [
      {
        name: "  Criar   roteiro ",
        durationMinutes: 90,
        status: "pendente",
      },
    ],
  };
}

describe("validação de tarefas", () => {
  it("normaliza textos, chaves e tags sem aceitar contexto do tenant", () => {
    const parsed = taskCreateSchema.parse(createInput());
    expect(parsed).toMatchObject({
      name: "Produzir campanha",
      category: "criacao",
      priority: "alta",
      status: "producao",
      briefing: "Briefing da tarefa",
      tagLabels: ["Rede Social", "Lançamento"],
      subtasks: [{ name: "Criar roteiro", durationMinutes: 90 }],
    });
    expect(parsed).not.toHaveProperty("workspaceId");
    expect(
      taskCreateSchema.safeParse({
        ...createInput(),
        workspaceId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({ ...createInput(), businessId: randomUUID() })
        .success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({
        ...createInput(),
        boardOrder: { status: 0 },
      }).success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({ ...createInput(), boardOrder: {} }).success,
    ).toBe(true);
  });

  it("aceita somente datas civis reais e versão fica fora da criação", () => {
    expect(
      taskCreateSchema.safeParse({ ...createInput(), dueDate: "2028-02-29" })
        .success,
    ).toBe(true);
    expect(
      taskCreateSchema.safeParse({ ...createInput(), dueDate: "2027-02-29" })
        .success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({ ...createInput(), dueDate: null }).success,
    ).toBe(true);
    expect(
      taskCreateSchema.safeParse({ ...createInput(), version: 1 }).success,
    ).toBe(false);
  });

  it("exige exatamente um responsável por tarefa", () => {
    const input = createInput();
    expect(
      taskCreateSchema.safeParse({ ...input, responsibleUserIds: [] }).success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({
        ...input,
        responsibleUserIds: [randomUUID(), randomUUID()],
      }).success,
    ).toBe(false);
  });

  it("limita subtarefas, duração e estados canônicos", () => {
    const input = createInput();
    expect(
      taskCreateSchema.safeParse({
        ...input,
        subtasks: [{ ...input.subtasks[0], durationMinutes: 30 }],
      }).success,
    ).toBe(true);
    expect(
      taskCreateSchema.safeParse({
        ...input,
        subtasks: [{ ...input.subtasks[0], durationMinutes: 10_080 }],
      }).success,
    ).toBe(true);
    for (const durationMinutes of [29, 45, 10_110]) {
      expect(
        taskCreateSchema.safeParse({
          ...input,
          subtasks: [{ ...input.subtasks[0], durationMinutes }],
        }).success,
      ).toBe(false);
    }
    expect(taskCreateSchema.safeParse({ ...input, subtasks: [] }).success).toBe(
      false,
    );
    expect(
      taskCreateSchema.safeParse({
        ...input,
        subtasks: Array.from({ length: 11 }, (_, index) => ({
          name: `Subtarefa ${index}`,
          durationMinutes: 60,
          status: "pendente",
        })),
      }).success,
    ).toBe(false);
    expect(
      taskCreateSchema.safeParse({
        ...input,
        subtasks: [{ ...input.subtasks[0], status: "completed" }],
      }).success,
    ).toBe(false);
  });

  it("sincroniza IDs únicos somente na atualização agregada", () => {
    const input = createInput();
    const subtaskId = randomUUID();
    const update = {
      ...input,
      version: 3,
      subtasks: [
        { ...input.subtasks[0], id: subtaskId },
        {
          id: subtaskId,
          name: "Duplicada",
          durationMinutes: 60,
          status: "concluida",
        },
      ],
    };
    expect(taskUpdateSchema.safeParse(update).success).toBe(false);
    expect(
      taskCreateSchema.safeParse({
        ...input,
        subtasks: [{ ...input.subtasks[0], id: randomUUID() }],
      }).success,
    ).toBe(false);
    expect(
      taskUpdateSchema.safeParse({
        ...update,
        subtasks: [{ ...input.subtasks[0], id: subtaskId }],
      }).success,
    ).toBe(true);
  });

  it("exige e normaliza estado na atualização agregada", () => {
    const input = createInput();
    const update = { ...input, version: 1, status: "Conclusão" };
    expect(taskUpdateSchema.parse(update).status).toBe("conclusao");
    expect(
      taskUpdateSchema.safeParse({ ...update, status: "arquivado" }).success,
    ).toBe(false);
    const { status: _status, ...withoutStatus } = update;
    expect(taskUpdateSchema.safeParse(withoutStatus).success).toBe(false);

    expect(taskStateSchema.parse({ version: 2, status: "Conclusão" })).toEqual({
      version: 2,
      status: "conclusao",
    });
    expect(
      taskStateSchema.safeParse({ version: 2, status: "arquivado" }).success,
    ).toBe(false);
    expect(
      taskSubtaskStateSchema.parse({ version: 2, status: "concluida" }),
    ).toEqual({ version: 2, status: "concluida" });
    expect(
      taskSubtaskStateSchema.safeParse({ version: 2, status: "conclusao" })
        .success,
    ).toBe(false);
  });

  it("valida e normaliza as quatro visões do lote da pauta", () => {
    const statusId = randomUUID();
    expect(
      taskBoardSchema.parse({
        view: "status",
        updates: [
          {
            id: statusId,
            version: 2,
            position: 0,
            columnKey: " Produção ",
          },
        ],
      }),
    ).toEqual({
      view: "status",
      updates: [
        {
          id: statusId,
          version: 2,
          position: 0,
          columnKey: "producao",
        },
      ],
    });

    expect(
      taskBoardSchema.parse({
        view: "priority",
        updates: [
          {
            id: randomUUID(),
            version: 3,
            position: 1,
            columnKey: " Alta Prioridade ",
          },
        ],
      }).updates[0]?.columnKey,
    ).toBe("alta_prioridade");

    for (const view of ["business", "project"] as const) {
      const columnKey = randomUUID();
      expect(
        taskBoardSchema.parse({
          view,
          updates: [
            {
              id: randomUUID(),
              version: 4,
              position: 2,
              columnKey,
            },
          ],
        }).updates[0]?.columnKey,
      ).toBe(columnKey);
      expect(
        taskBoardSchema.safeParse({
          view,
          updates: [
            {
              id: randomUUID(),
              version: 4,
              position: 2,
              columnKey: "nao-e-uuid",
            },
          ],
        }).success,
      ).toBe(false);
    }

    expect(
      taskBoardSchema.safeParse({
        view: "status",
        updates: [
          {
            id: randomUUID(),
            version: 1,
            position: 0,
            columnKey: "arquivado",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      taskBoardSchema.safeParse({
        view: "calendar",
        updates: [
          {
            id: randomUUID(),
            version: 1,
            position: 0,
            columnKey: "fila",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("limita o lote e rejeita IDs duplicados ou valores fora da faixa", () => {
    const update = (overrides: Record<string, unknown> = {}) => ({
      id: randomUUID(),
      version: 1,
      position: 0,
      columnKey: "fila",
      ...overrides,
    });
    expect(
      taskBoardSchema.safeParse({ view: "status", updates: [] }).success,
    ).toBe(false);
    expect(
      taskBoardSchema.safeParse({
        view: "status",
        updates: Array.from({ length: 500 }, (_, position) =>
          update({ position }),
        ),
      }).success,
    ).toBe(true);
    expect(
      taskBoardSchema.safeParse({
        view: "status",
        updates: Array.from({ length: 501 }, (_, position) =>
          update({ position }),
        ),
      }).success,
    ).toBe(false);

    const duplicateId = randomUUID();
    expect(
      taskBoardSchema.safeParse({
        view: "status",
        updates: [
          update({ id: duplicateId, position: 0 }),
          update({ id: duplicateId, position: 1 }),
        ],
      }).success,
    ).toBe(false);

    expect(
      taskBoardSchema.safeParse({
        view: "priority",
        updates: [
          update({ columnKey: "Alta", position: 7 }),
          update({ columnKey: " alta ", position: 7 }),
        ],
      }).success,
    ).toBe(false);

    for (const version of [0, 1.5, 2_147_483_647]) {
      expect(
        taskBoardSchema.safeParse({
          view: "status",
          updates: [update({ version })],
        }).success,
      ).toBe(false);
    }
    for (const position of [-1, 1.5, 1_000_000_000]) {
      expect(
        taskBoardSchema.safeParse({
          view: "status",
          updates: [update({ position })],
        }).success,
      ).toBe(false);
    }
    expect(
      taskBoardSchema.safeParse({
        view: "status",
        updates: [update({ version: 2_147_483_646, position: 999_999_999 })],
      }).success,
    ).toBe(true);
  });

  it("mantém o contrato do lote estrito e exige UUID da tarefa", () => {
    const valid = {
      view: "status" as const,
      updates: [
        {
          id: randomUUID(),
          version: 1,
          position: 0,
          columnKey: "fila",
        },
      ],
    };
    expect(
      taskBoardSchema.safeParse({ ...valid, workspaceId: randomUUID() })
        .success,
    ).toBe(false);
    expect(
      taskBoardSchema.safeParse({
        ...valid,
        updates: [{ ...valid.updates[0], taskId: randomUUID() }],
      }).success,
    ).toBe(false);
    expect(
      taskBoardSchema.safeParse({
        ...valid,
        updates: [{ ...valid.updates[0], id: "id-invalido" }],
      }).success,
    ).toBe(false);
    expect(
      taskBoardSchema.safeParse({
        view: "status",
        changes: valid.updates,
      }).success,
    ).toBe(false);
  });

  it("exige versão válida para concorrência e arquivamento", () => {
    expect(taskArchiveQuerySchema.parse({ version: "7" })).toEqual({
      version: 7,
    });
    for (const value of [undefined, "0", "1.5", "2147483647"]) {
      expect(
        taskArchiveQuerySchema.safeParse(
          value === undefined ? {} : { version: value },
        ).success,
      ).toBe(false);
    }
  });

  it("valida filtros estritos, paginação e intervalo de entrega", () => {
    expect(
      taskListQuerySchema.parse({
        page: "2",
        pageSize: "100",
        status: "Produção",
        dueFrom: "2026-08-01",
        dueTo: "2026-08-31",
      }),
    ).toMatchObject({ page: 2, pageSize: 100, status: "producao" });
    expect(
      taskListQuerySchema.safeParse({
        dueFrom: "2026-09-01",
        dueTo: "2026-08-31",
      }).success,
    ).toBe(false);
    expect(taskListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(
      false,
    );
    const workspaceId = randomUUID();
    expect(taskListQuerySchema.parse({ workspaceId }).workspaceId).toBe(
      workspaceId,
    );
    expect(
      taskListQuerySchema.safeParse({ workspaceId: "global" }).success,
    ).toBe(false);
  });
});
