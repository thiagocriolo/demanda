import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { businessListQuerySchema, businessMutationSchema } from "./validation";

function validMutation() {
  return {
    name: "  Novo   Negocio  ",
    category: " Marca Pessoal ",
    stage: " Negociacao ",
    responsibleContactIds: [randomUUID()],
    notes: [{ body: "  Resumo do cliente  " }],
  };
}

describe("validacao de negocios", () => {
  it("normaliza textos e chaves configuraveis", () => {
    expect(businessMutationSchema.parse(validMutation())).toMatchObject({
      name: "Novo Negocio",
      category: "marca_pessoal",
      stage: "negociacao",
      notes: [{ body: "Resumo do cliente" }],
    });
    expect(
      businessListQuerySchema.parse({
        category: "Projeto Alternativo",
        stage: "Contratacao",
      }),
    ).toMatchObject({
      category: "projeto_alternativo",
      stage: "contratacao",
    });
  });

  it("rejeita workspaceId e qualquer campo inesperado", () => {
    expect(
      businessMutationSchema.safeParse({
        ...validMutation(),
        workspaceId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      businessListQuerySchema.safeParse({ unknown: "value" }).success,
    ).toBe(false);
  });

  it("reserva arquivado ao endpoint de arquivamento", () => {
    expect(
      businessMutationSchema.safeParse({
        ...validMutation(),
        stage: "arquivado",
      }).success,
    ).toBe(false);
    expect(
      businessListQuerySchema.safeParse({ stage: "arquivado" }).success,
    ).toBe(false);
  });

  it("exige entre um e vinte responsaveis unicos", () => {
    expect(
      businessMutationSchema.safeParse({
        ...validMutation(),
        responsibleContactIds: [],
      }).success,
    ).toBe(false);

    const id = randomUUID();
    expect(
      businessMutationSchema.safeParse({
        ...validMutation(),
        responsibleContactIds: [id, id],
      }).success,
    ).toBe(false);

    expect(
      businessMutationSchema.safeParse({
        ...validMutation(),
        responsibleContactIds: Array.from({ length: 21 }, () => randomUUID()),
      }).success,
    ).toBe(false);

    expect(
      businessMutationSchema.safeParse({
        ...validMutation(),
        responsibleContactIds: [],
        responsibleUserIds: [randomUUID()],
      }).success,
    ).toBe(true);

    expect(
      businessMutationSchema.safeParse({
        ...validMutation(),
        responsibleContactIds: [],
        responsibleUserIds: Array.from({ length: 21 }, () => randomUUID()),
      }).success,
    ).toBe(false);
  });

  it("limita nome, chaves, observacoes e paginacao", () => {
    expect(
      businessMutationSchema.safeParse({
        ...validMutation(),
        name: "x".repeat(121),
      }).success,
    ).toBe(false);
    expect(
      businessMutationSchema.safeParse({
        ...validMutation(),
        category: "!@#$",
      }).success,
    ).toBe(false);
    expect(
      businessMutationSchema.safeParse({
        ...validMutation(),
        category: `a${"b".repeat(64)}`,
      }).success,
    ).toBe(false);
    expect(
      businessMutationSchema.safeParse({
        ...validMutation(),
        notes: [{ body: "x".repeat(4_001) }],
      }).success,
    ).toBe(false);
    expect(businessListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(
      false,
    );
    expect(
      businessListQuerySchema.safeParse({ workspaceId: randomUUID() }).success,
    ).toBe(false);
  });
});
