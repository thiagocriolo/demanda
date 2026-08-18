import { describe, expect, it, vi } from "vitest";
import {
  ContactApiError,
  contactToEntityRecord,
  entityValuesToContactInput,
  listAllActiveContacts,
  listContacts,
  type FetchLike,
} from "./client";
import type { Contact } from "./types";

const contact: Contact = {
  id: "80d26625-5e26-4dad-b031-fb43ac831ca9",
  workspaceId: "2e50fbac-2d0b-431e-a4bf-4c249bd90be5",
  ownerUserId: "4ea7b115-5e3d-4e07-a007-e32a27f7413e",
  linkedUserId: null,
  name: "  Maria não normalizada no DTO  ",
  contactType: "person",
  status: "active",
  profession: "Designer",
  phones: [
    {
      id: "0fda50d0-ea0c-46f5-bdd4-41a963754cdc",
      type: "whatsapp",
      label: "WhatsApp",
      value: "+5585981219267",
      isPrimary: true,
    },
  ],
  emails: [
    {
      id: "27a54f21-9a1c-45f5-aae1-6c10936983de",
      type: "work",
      label: "Principal",
      value: "maria@example.com",
      isPrimary: true,
    },
  ],
  notes: [
    {
      id: "c9a36b3f-ae37-4138-a3a1-f761a85ea300",
      body: "Contato importante",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
    },
  ],
  archivedAt: null,
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
};

function entityFormValues(record: ReturnType<typeof contactToEntityRecord>) {
  return {
    nome: record.nome,
    tipo: record.tipo,
    cargo: record.cargo,
    telefone: record.telefone,
    email: record.email,
    observacoes: record.observacoes,
  };
}

describe("cliente de contatos", () => {
  it("consulta a API paginada sem enviar workspaceId", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        workspaceId: contact.workspaceId,
        ownerUserId: contact.ownerUserId,
        items: [contact],
        page: 2,
        pageSize: 25,
        total: 26,
        totalPages: 2,
        facets: {
          all: 26,
          lead: 5,
          prospect: 5,
          active: 15,
          inactive: 1,
          archived: 2,
        },
      }),
    ) as FetchLike;

    const result = await listContacts(
      {
        page: 2,
        pageSize: 25,
        query: "Maria",
        includeArchived: true,
      },
      fetcher,
    );

    expect(result.items).toEqual([contact]);
    const requestedUrl = String(vi.mocked(fetcher).mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("page=2");
    expect(requestedUrl).toContain("query=Maria");
    expect(requestedUrl).toContain("archived=include");
    expect(requestedUrl).not.toContain("workspaceId=");
  });

  it("carrega todos os contatos ativos para seletores relacionais", async () => {
    const secondContact = {
      ...contact,
      id: "de93990d-72df-4fa9-a8f2-757c4ce12c86",
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const page = new URL(String(input), "http://localhost").searchParams.get(
        "page",
      );
      return Response.json({
        workspaceId: contact.workspaceId,
        ownerUserId: contact.ownerUserId,
        items: page === "1" ? [contact] : [secondContact],
        page: Number(page),
        pageSize: 100,
        total: 2,
        totalPages: 2,
        facets: {
          all: 2,
          lead: 0,
          prospect: 0,
          active: 2,
          inactive: 0,
          archived: 0,
        },
      });
    }) as FetchLike;

    expect(await listAllActiveContacts({}, fetcher)).toEqual([
      contact,
      secondContact,
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejeita mistura de proprietários durante paginação relacional", async () => {
    const foreignOwner = "5d2611f6-7082-4545-9f6b-220e2baf8220";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const page = new URL(String(input), "http://localhost").searchParams.get(
        "page",
      );
      return Response.json({
        workspaceId: contact.workspaceId,
        ownerUserId: page === "1" ? contact.ownerUserId : foreignOwner,
        items: page === "1" ? [contact] : [],
        page: Number(page),
        pageSize: 100,
        total: 1,
        totalPages: 2,
        facets: {
          all: 1,
          lead: 0,
          prospect: 0,
          active: 1,
          inactive: 0,
          archived: 0,
        },
      });
    }) as FetchLike;

    await expect(listAllActiveContacts({}, fetcher)).rejects.toEqual(
      new ContactApiError(
        409,
        "O escopo do usuário mudou durante o carregamento dos contatos. Tente novamente.",
      ),
    );
  });

  it("mapeia o DTO para o contrato visual legado", () => {
    expect(contactToEntityRecord(contact)).toMatchObject({
      id: contact.id,
      nome: contact.name,
      tipo: "ativo",
      cargo: "Designer",
      telefone: "85 9 8121.9267",
      email: "maria@example.com",
      observacoes: "Contato importante",
    });
  });

  it("converte o formulário sem incluir campos de tenant", () => {
    const input = entityValuesToContactInput({
      nome: " Maria  ",
      tipo: "prospecto",
      cargo: "  Designer ",
      telefone: "85 9 8121.9267",
      email: "MARIA@EXAMPLE.COM",
      observacoes: "  Retornar amanhã ",
    });

    expect(input).toEqual({
      name: "Maria",
      contactType: "person",
      status: "prospect",
      profession: "Designer",
      linkedUserId: null,
      phones: [
        {
          type: "whatsapp",
          label: "WhatsApp",
          value: "85 9 8121.9267",
          isPrimary: true,
        },
      ],
      emails: [
        {
          type: "work",
          label: "Principal",
          value: "MARIA@EXAMPLE.COM",
          isPrimary: true,
        },
      ],
      notes: [{ body: "Retornar amanhã" }],
    });
    expect(input).not.toHaveProperty("workspaceId");
  });

  it("preserva todos os telefones, e-mails e notas no round-trip visual", () => {
    const completeContact: Contact = {
      ...contact,
      linkedUserId: "815126fb-f8cc-4f55-837f-43207c520660",
      phones: [
        ...contact.phones,
        {
          id: "6e51aed0-dc56-4c6a-be60-aab1f1328da5",
          type: "work",
          label: "Escritório",
          value: "+558532223333",
          isPrimary: false,
        },
      ],
      emails: [
        ...contact.emails,
        {
          id: "8b70ff4a-aee5-40cf-a805-7208ff585991",
          type: "personal",
          label: "Pessoal",
          value: "maria.pessoal@example.com",
          isPrimary: false,
        },
      ],
      notes: [
        ...contact.notes,
        {
          id: "3a22184b-bde4-4b16-8c65-84081762d892",
          body: "Segunda observação preservada",
          createdAt: "2026-07-12T00:00:00.000Z",
          updatedAt: "2026-07-12T00:00:00.000Z",
        },
      ],
    };
    const record = contactToEntityRecord(completeContact);

    const input = entityValuesToContactInput(entityFormValues(record), record);

    expect(input.phones).toEqual(
      completeContact.phones.map(({ id: _id, ...phone }) => phone),
    );
    expect(input.emails).toEqual(
      completeContact.emails.map(({ id: _id, ...email }) => email),
    );
    expect(input.notes).toEqual(
      completeContact.notes.map(
        ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...note }) =>
          note,
      ),
    );
    expect(input.linkedUserId).toBe(completeContact.linkedUserId);
  });

  it("edita o valor visível sem remover os detalhes adicionais", () => {
    const completeContact: Contact = {
      ...contact,
      phones: [
        ...contact.phones,
        {
          id: "6e51aed0-dc56-4c6a-be60-aab1f1328da5",
          type: "work",
          label: "Escritório",
          value: "+558532223333",
          isPrimary: false,
        },
      ],
      notes: [
        ...contact.notes,
        {
          id: "3a22184b-bde4-4b16-8c65-84081762d892",
          body: "Segunda observação preservada",
          createdAt: "2026-07-12T00:00:00.000Z",
          updatedAt: "2026-07-12T00:00:00.000Z",
        },
      ],
    };
    const record = contactToEntityRecord(completeContact);

    const input = entityValuesToContactInput(
      {
        ...entityFormValues(record),
        telefone: "85 9 9999.0000",
        observacoes: "Observação principal atualizada",
      },
      record,
    );

    expect(input.phones).toEqual([
      expect.objectContaining({ value: "85 9 9999.0000", isPrimary: true }),
      expect.objectContaining({
        value: "+558532223333",
        isPrimary: false,
      }),
    ]);
    expect(input.notes).toEqual([
      { body: "Observação principal atualizada" },
      { body: "Segunda observação preservada" },
    ]);
  });

  it("remove o vínculo com usuário ao copiar sem perder os detalhes", () => {
    const linkedContact: Contact = {
      ...contact,
      linkedUserId: "815126fb-f8cc-4f55-837f-43207c520660",
    };
    const record = contactToEntityRecord(linkedContact);

    const copy = entityValuesToContactInput(entityFormValues(record), record, {
      copy: true,
    });

    expect(copy.linkedUserId).toBeNull();
    expect(copy.phones).toHaveLength(linkedContact.phones.length);
    expect(copy.emails).toHaveLength(linkedContact.emails.length);
    expect(copy.notes).toHaveLength(linkedContact.notes.length);
  });

  it("preserva a mensagem pública de falhas da API", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { message: "Dados do contato inválidos." },
        { status: 400 },
      ),
    ) as FetchLike;

    await expect(listContacts({}, fetcher)).rejects.toEqual(
      new ContactApiError(400, "Dados do contato inválidos."),
    );
  });
});
