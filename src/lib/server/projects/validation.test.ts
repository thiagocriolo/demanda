import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  projectFromServiceSchema,
  projectListQuerySchema,
  projectMutationSchema,
  projectTagKey,
  serviceMutationSchema,
} from "./validation";

function validProject() {
  return {
    name: "  Projeto   Aurora  ",
    businessId: randomUUID(),
    serviceIds: [randomUUID()],
    status: " Em execução ",
    startDate: "2028-02-29",
    endDate: "2028-03-31",
    briefing: "Briefing",
    tagLabels: ["  Identidade   visual  ", "Site"],
    responsibleUserIds: [randomUUID()],
    contractType: "one_off",
    amountCents: 10_001,
    firstDueDate: "2028-03-05",
    paymentMethod: "Pix",
    paymentTerms: "Na entrega",
    financeNotes: "",
    installments: [
      {
        number: 1,
        dueDate: "2028-03-05",
        amountCents: 5_000,
        status: "Pendente",
      },
      {
        number: 2,
        dueDate: "2028-04-05",
        amountCents: 5_001,
        status: "Pendente",
      },
    ],
  };
}

function validService() {
  return {
    name: "Identidade visual",
    description: "Projeto de marca",
    icon: "palette",
    color: "violet",
    defaultStatus: "Planejamento",
    defaultDurationDays: 30,
    defaultBriefing: "Briefing do modelo",
    tagLabels: ["Branding"],
    responsibleUserIds: [randomUUID()],
    defaultContractType: "one_off",
    defaultAmountCents: 12_500_00,
    defaultInstallmentCount: 3,
    defaultPaymentMethod: "Pix",
    defaultPaymentTerms: "40/30/30",
    defaultFinanceNotes: "Duas rodadas",
  };
}

describe("validacao de projetos e servicos", () => {
  it("normaliza textos, chaves e tags", () => {
    const parsed = projectMutationSchema.parse(validProject());
    expect(parsed).toMatchObject({
      name: "Projeto Aurora",
      status: "em_execucao",
      tagLabels: ["Identidade visual", "Site"],
    });
    expect(parsed.installments.map(({ status }) => status)).toEqual([
      "pendente",
      "pendente",
    ]);
    expect(projectTagKey("  Identidade Vísual ")).toBe("identidade_visual");
  });

  it("rejeita workspaceId e campos inesperados", () => {
    expect(
      projectMutationSchema.safeParse({
        ...validProject(),
        workspaceId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      serviceMutationSchema.safeParse({ ...validService(), extra: true })
        .success,
    ).toBe(false);
    expect(projectListQuerySchema.safeParse({ unknown: "x" }).success).toBe(
      false,
    );
    const workspaceId = randomUUID();
    expect(projectListQuerySchema.parse({ workspaceId }).workspaceId).toBe(
      workspaceId,
    );
    expect(
      projectListQuerySchema.safeParse({ workspaceId: "global" }).success,
    ).toBe(false);
  });

  it("aceita data bissexta real e rejeita datas impossiveis", () => {
    expect(projectMutationSchema.safeParse(validProject()).success).toBe(true);
    for (const date of ["2027-02-29", "2028-02-30", "31/03/2028"]) {
      expect(
        projectMutationSchema.safeParse({
          ...validProject(),
          startDate: date,
        }).success,
      ).toBe(false);
    }
  });

  it("rejeita fim anterior ao inicio e intervalos invertidos", () => {
    expect(
      projectMutationSchema.safeParse({
        ...validProject(),
        endDate: "2028-02-28",
      }).success,
    ).toBe(false);
    expect(
      projectListQuerySchema.safeParse({
        startFrom: "2028-04-01",
        startTo: "2028-03-01",
      }).success,
    ).toBe(false);
  });

  it("rejeita dinheiro inexato, negativo ou fora do limite", () => {
    for (const amountCents of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        projectMutationSchema.safeParse({
          ...validProject(),
          amountCents,
        }).success,
      ).toBe(false);
    }
  });

  it("exige responsaveis membros unicos", () => {
    expect(
      projectMutationSchema.safeParse({
        ...validProject(),
        responsibleUserIds: [],
      }).success,
    ).toBe(false);
    const userId = randomUUID();
    expect(
      projectMutationSchema.safeParse({
        ...validProject(),
        responsibleUserIds: [userId, userId],
      }).success,
    ).toBe(false);
  });

  it("valida ordem, vencimentos e soma das parcelas", () => {
    const base = validProject();
    const mutations = [
      { installments: [{ ...base.installments[0], number: 2 }] },
      {
        installments: [
          base.installments[0],
          { ...base.installments[1], dueDate: "2028-03-01" },
        ],
      },
      {
        installments: [
          base.installments[0],
          { ...base.installments[1], amountCents: 5_000 },
        ],
      },
      { firstDueDate: "2028-03-06" },
      { installments: [] },
    ];
    for (const mutation of mutations) {
      expect(
        projectMutationSchema.safeParse({ ...base, ...mutation }).success,
      ).toBe(false);
    }
  });

  it("valida modelo de servico e overrides sem workspace", () => {
    expect(serviceMutationSchema.safeParse(validService()).success).toBe(true);
    expect(
      projectFromServiceSchema.safeParse({
        serviceId: randomUUID(),
        businessId: randomUUID(),
        name: "Projeto do modelo",
        startDate: "2028-01-31",
      }).success,
    ).toBe(true);
    expect(
      projectFromServiceSchema.safeParse({
        serviceId: randomUUID(),
        businessId: randomUUID(),
        name: "Projeto",
        startDate: "2028-01-31",
        workspaceId: randomUUID(),
      }).success,
    ).toBe(false);
    const serviceId = randomUUID();
    expect(
      projectFromServiceSchema.safeParse({
        serviceId,
        additionalServiceIds: [serviceId],
        businessId: randomUUID(),
        name: "Projeto",
        startDate: "2028-01-31",
      }).success,
    ).toBe(false);
  });
});
