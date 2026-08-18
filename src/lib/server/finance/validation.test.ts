import { describe, expect, it } from "vitest";
import {
  financialCreateSchema,
  financialQuerySchema,
  financialStateSchema,
} from "./validation";

const base = {
  title: "Contrato",
  type: "revenue" as const,
  mode: "one_off" as const,
  amountCents: 10_001,
  competenceDate: "2026-07-01",
  dueDate: "2026-07-10",
  category: "Contratos",
  notes: "",
};

describe("BE-12: validação financeira", () => {
  it("aceita parcelas cuja soma inteira preserva cada centavo", () => {
    expect(
      financialCreateSchema.parse({
        ...base,
        installments: [
          { number: 1, dueDate: "2026-07-10", amountCents: 5_000 },
          { number: 2, dueDate: "2026-08-10", amountCents: 5_001 },
        ],
      }).installments,
    ).toHaveLength(2);
  });

  it("rejeita soma, ordem e combinação de recorrência inválidas", () => {
    expect(
      financialCreateSchema.safeParse({
        ...base,
        installments: [
          { number: 2, dueDate: "2026-08-10", amountCents: 5_000 },
          { number: 1, dueDate: "2026-07-10", amountCents: 5_000 },
        ],
      }).success,
    ).toBe(false);
    expect(
      financialCreateSchema.safeParse({
        ...base,
        mode: "recurring",
        recurrenceCount: 12,
        installments: [
          { number: 1, dueDate: "2026-07-10", amountCents: 5_000 },
          { number: 2, dueDate: "2026-08-10", amountCents: 5_001 },
        ],
      }).success,
    ).toBe(false);
  });

  it("valida competência, intervalo e transições", () => {
    expect(
      financialQuerySchema.parse({
        workspaceId: "078ef345-0bdf-4ddb-9135-13a824ec4f6d",
        from: "2026-07-01",
        to: "2026-07-31",
        basis: "competence",
      }),
    ).toMatchObject({
      workspaceId: "078ef345-0bdf-4ddb-9135-13a824ec4f6d",
      basis: "competence",
    });
    expect(
      financialStateSchema.parse({ version: 1, action: "settle" }),
    ).toEqual({ version: 1, action: "settle" });
  });
});
