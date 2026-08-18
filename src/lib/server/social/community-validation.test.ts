import { describe, expect, it } from "vitest";
import { addCommunityMemberSchema, createCommunitySchema } from "./validation";

describe("createCommunitySchema", () => {
  it("normaliza os dados válidos da comunidade", () => {
    const result = createCommunitySchema.parse({
      linkName: "  Design.Produto  ",
      name: "  Design e Produto  ",
      description: "  Espaço para compartilhar referências.  ",
      topic: "  Design  ",
      visibility: "private",
      memberUserIds: [],
    });

    expect(result.name).toBe("Design e Produto");
    expect(result.linkName).toBe("design.produto");
    expect(result.description).toBe("Espaço para compartilhar referências.");
    expect(result.topic).toBe("Design");
  });

  it("recusa arquivos e membros com identificadores inválidos", () => {
    expect(
      createCommunitySchema.safeParse({
        linkName: "Link inválido!",
        name: "Comunidade",
        description: "Descrição",
        topic: "Tema",
        visibility: "public",
        coverFileId: "arquivo",
        memberUserIds: ["pessoa"],
      }).success,
    ).toBe(false);
  });
});

describe("addCommunityMemberSchema", () => {
  it("aceita somente um identificador de usuário válido", () => {
    expect(
      addCommunityMemberSchema.safeParse({
        userId: "815126fb-f8cc-4f55-837f-43207c520660",
      }).success,
    ).toBe(true);
    expect(
      addCommunityMemberSchema.safeParse({ userId: "pessoa" }).success,
    ).toBe(false);
  });
});
