import { describe, expect, it } from "vitest";
import { contactListQuerySchema, contactMutationSchema } from "./validation";

function validInput() {
  return {
    name: "  Maria   da Silva ",
    contactType: "person",
    status: "active",
    profession: "  Product designer  ",
    linkedUserId: null,
    phones: [
      {
        type: "whatsapp",
        label: " Principal ",
        value: "(85) 9 8121-9267",
        isPrimary: false,
      },
    ],
    emails: [
      {
        type: "work",
        label: " Trabalho ",
        value: " MARIA@EXAMPLE.COM ",
        isPrimary: false,
      },
    ],
    notes: [{ body: "  Prefere contato pela manhã.  " }],
  };
}

describe("validação de contatos", () => {
  it("normaliza texto, telefone, e-mail e contato principal", () => {
    expect(contactMutationSchema.parse(validInput())).toEqual({
      name: "Maria da Silva",
      contactType: "person",
      status: "active",
      profession: "Product designer",
      linkedUserId: null,
      phones: [
        {
          type: "whatsapp",
          label: "Principal",
          value: "+5585981219267",
          isPrimary: true,
        },
      ],
      emails: [
        {
          type: "work",
          label: "Trabalho",
          value: "maria@example.com",
          isPrimary: true,
        },
      ],
      notes: [{ body: "Prefere contato pela manhã." }],
    });
  });

  it("preserva o código de país de números internacionais explícitos", () => {
    const withPlus = validInput();
    withPlus.phones[0].value = "+1 (202) 555-0123";
    expect(contactMutationSchema.parse(withPlus).phones[0]?.value).toBe(
      "+12025550123",
    );

    const withInternationalPrefix = validInput();
    withInternationalPrefix.phones[0].value = "00 44 20 7946 0958";
    expect(
      contactMutationSchema.parse(withInternationalPrefix).phones[0]?.value,
    ).toBe("+442079460958");
  });

  it("rejeita tenant injetado, duplicatas e múltiplos principais", () => {
    expect(
      contactMutationSchema.safeParse({
        ...validInput(),
        workspaceId: "2e50fbac-2d0b-431e-a4bf-4c249bd90be5",
      }).success,
    ).toBe(false);

    const duplicate = validInput();
    duplicate.emails.push({
      ...duplicate.emails[0],
      label: "Outro",
      isPrimary: true,
    });
    const parsed = contactMutationSchema.safeParse(duplicate);
    expect(parsed.success).toBe(false);
  });

  it("limita paginação e filtros públicos", () => {
    expect(
      contactListQuerySchema.parse({
        page: "2",
        pageSize: "100",
        query: "  Maria ",
        status: "lead",
        archived: "include",
      }),
    ).toEqual({
      page: 2,
      pageSize: 100,
      query: "Maria",
      status: "lead",
      orderBy: "updated",
      archived: "include",
    });
    expect(contactListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(
      false,
    );
    expect(
      contactListQuerySchema.safeParse({
        workspaceId: "2e50fbac-2d0b-431e-a4bf-4c249bd90be5",
      }).success,
    ).toBe(false);
  });
});
