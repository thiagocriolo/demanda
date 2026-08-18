import { describe, expect, it } from "vitest";
import {
  cronogramaBlockSchema,
  cronogramaDeleteSchema,
  cronogramaQuerySchema,
  cronogramaReorganizationSchema,
} from "./validation";

describe("BE-11: validacao do Cronograma", () => {
  it("aceita blocos de meia hora dentro do dia", () => {
    expect(
      cronogramaBlockSchema.parse({
        date: "2026-07-15",
        startMinutes: 8 * 60,
        durationMinutes: 90,
        version: 0,
      }),
    ).toEqual({
      date: "2026-07-15",
      startMinutes: 480,
      durationMinutes: 90,
      version: 0,
    });
  });

  it("rejeita grade quebrada, virada de dia e versao de exclusao invalida", () => {
    expect(
      cronogramaBlockSchema.safeParse({
        date: "2026-07-15",
        startMinutes: 485,
        durationMinutes: 60,
        version: 0,
      }).success,
    ).toBe(false);
    expect(
      cronogramaBlockSchema.safeParse({
        date: "2026-07-15",
        startMinutes: 1_410,
        durationMinutes: 60,
        version: 0,
      }).success,
    ).toBe(false);
    expect(cronogramaDeleteSchema.safeParse({ version: 0 }).success).toBe(
      false,
    );
  });

  it("valida filtros por intervalo e responsavel", () => {
    expect(
      cronogramaQuerySchema.safeParse({
        from: "2026-07-20",
        to: "2026-07-19",
      }).success,
    ).toBe(false);
    expect(
      cronogramaQuerySchema.parse({
        workspaceId: "01dd1ab3-ed34-44fd-b100-8c371bf1bbad",
        from: "2026-07-14",
        responsibleUserId: "2dba9fbf-39ce-4f1a-868f-f87eea031d99",
      }),
    ).toMatchObject({
      workspaceId: "01dd1ab3-ed34-44fd-b100-8c371bf1bbad",
      from: "2026-07-14",
    });
  });

  it("valida reorganizações atômicas sem subtarefas duplicadas", () => {
    const block = {
      subtaskId: "34a880a0-d3b4-467b-b8bd-026af1019505",
      date: "2026-07-15",
      startMinutes: 8 * 60,
      durationMinutes: 60,
      version: 1,
    };
    expect(
      cronogramaReorganizationSchema.safeParse({
        workspaceId: "01dd1ab3-ed34-44fd-b100-8c371bf1bbad",
        blocks: [block],
      }).success,
    ).toBe(true);
    expect(
      cronogramaReorganizationSchema.safeParse({
        workspaceId: "01dd1ab3-ed34-44fd-b100-8c371bf1bbad",
        blocks: [block, block],
      }).success,
    ).toBe(false);
  });
});
