import { describe, expect, it } from "vitest";
import { contractDetail, projectDetail } from "./record-detail";

describe("contractDetail", () => {
  it("prepara os dados financeiros para a página de visualização", () => {
    const detail = contractDetail({
      id: "eaf06398-1486-4aa2-aed3-5710e20e7ad2",
      name: "Identidade visual",
      businessName: "Estúdio Aurora",
      amountCents: 125_050,
      firstDueDate: "2026-11-20",
      paymentMethod: "Pix",
      paymentTerms: "50% na entrada e 50% na entrega",
      financeNotes: "Emitir nota fiscal.",
      archivedAt: null,
      updatedAt: new Date("2026-11-18T12:00:00.000Z"),
    });

    expect(detail).toMatchObject({
      id: "eaf06398-1486-4aa2-aed3-5710e20e7ad2",
      kind: "contrato",
      typeLabel: "Contrato",
      title: "Identidade visual",
      status: "Ativo",
      archived: false,
      fields: [
        { label: "Negócio", value: "Estúdio Aurora" },
        { label: "Valor", value: "R$ 1.250,50" },
        { label: "Primeiro vencimento", value: "20/11/2026" },
        { label: "Forma de pagamento", value: "Pix" },
      ],
      sections: [
        {
          title: "Financeiro",
          fields: [
            { label: "Condições", value: "50% na entrada e 50% na entrega" },
            { label: "Observações", value: "Emitir nota fiscal." },
          ],
        },
      ],
    });
  });

  it("identifica contratos arquivados", () => {
    const detail = contractDetail({
      id: "eaf06398-1486-4aa2-aed3-5710e20e7ad2",
      name: "Contrato anterior",
      businessName: "Estúdio Aurora",
      amountCents: 0,
      firstDueDate: null,
      paymentMethod: null,
      paymentTerms: null,
      financeNotes: null,
      archivedAt: new Date("2026-11-18T12:00:00.000Z"),
      updatedAt: new Date("2026-11-18T12:00:00.000Z"),
    });

    expect(detail.status).toBe("Arquivado");
    expect(detail.archived).toBe(true);
  });
});

describe("projectDetail", () => {
  it("exibe o contrato vinculado sem responsáveis nem modalidade financeira legada", () => {
    const detail = projectDetail({
      id: "8d7a8408-5138-40e6-82b9-cf78595e0803",
      workspaceId: "2e50fbac-2d0b-431e-a4bf-4c249bd90be5",
      sourceServiceId: null,
      contract: {
        id: "eaf06398-1486-4aa2-aed3-5710e20e7ad2",
        name: "Contrato anual Aurora",
      },
      isInstitutional: false,
      isActive: true,
      name: "Site institucional",
      business: {
        id: "c9ad3fab-41c2-4d61-b5fb-946778633b5d",
        name: "Estúdio Aurora",
        archivedAt: null,
      },
      services: [],
      status: "planejamento",
      startDate: "2026-11-20",
      endDate: "2026-12-20",
      briefing: "Escopo do site",
      tags: [],
      responsibles: [],
      contractType: "one_off",
      amountCents: 0,
      firstDueDate: null,
      paymentMethod: "",
      paymentTerms: "",
      financeNotes: "",
      installments: [],
      archivedAt: null,
      createdAt: "2026-11-18T12:00:00.000Z",
      updatedAt: "2026-11-18T12:00:00.000Z",
    });

    expect(detail.fields).toEqual([
      { label: "Contrato", value: "Contrato anual Aurora" },
      { label: "Negócio", value: "Estúdio Aurora" },
      { label: "Início", value: "20/11/2026" },
      { label: "Conclusão", value: "20/12/2026" },
      { label: "Exibição", value: "On" },
    ]);
    expect(detail.sections).toEqual([
      {
        title: "Execução",
        fields: [
          { label: "Serviços", value: "Não informado" },
          { label: "Tags", value: "Não informado" },
          { label: "Briefing", value: "Escopo do site" },
        ],
      },
    ]);
  });
});
