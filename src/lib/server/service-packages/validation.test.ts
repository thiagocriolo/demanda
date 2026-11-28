import { describe, expect, it } from "vitest";
import { INSTITUTIONAL_PROJECT_NAME } from "../../projects/institutional";
import {
  contractServicePackageSelectionSchema,
  normalizeServicePackageInput,
  servicePackageMutationSchema,
} from "./validation";

describe("service package validation & normalization", () => {
  it("mantém a cobrança financeira independente da recorrência dos projetos", () => {
    const input = servicePackageMutationSchema.parse({
      name: "Mensalidade com implantação",
      contractType: "recurring",
      projects: [
        { name: "Implantação", projectType: "one_off", deliveries: [] },
      ],
    });
    const result = normalizeServicePackageInput(input);
    expect(result.contractType).toBe("recurring");
    expect(result.projects[1].projectType).toBe("one_off");
    expect(
      servicePackageMutationSchema.parse({ name: "Existente" }).contractType,
    ).toBe("one_off");
    expect(
      servicePackageMutationSchema.safeParse({
        name: "Inválido",
        contractType: "weekly",
      }).success,
    ).toBe(false);
  });

  it("aceita escopo avulso sem pacote e exige uma origem ou escopo", () => {
    const input = { responsibleUserId: "22222222-2222-4222-8222-222222222222" };
    expect(contractServicePackageSelectionSchema.safeParse(input).success).toBe(
      false,
    );
    expect(
      contractServicePackageSelectionSchema.safeParse({
        ...input,
        customProjects: [],
      }).success,
    ).toBe(false);
    const result = contractServicePackageSelectionSchema.parse({
      ...input,
      customProjects: [
        { name: "Site", projectType: "one_off", deliveries: [] },
      ],
    });
    expect(result.packageId).toBeUndefined();
    expect(result.customProjects?.[0].name).toBe("Site");
  });
  it("aceita um serviço comercial mínimo sem projetos extras e injeta o Institucional automaticamente", () => {
    const parsed = servicePackageMutationSchema.parse({
      name: "Consultoria Express",
      amountCents: 250_000,
    });

    const normalized = normalizeServicePackageInput(parsed);
    expect(normalized.name).toBe("Consultoria Express");
    expect(normalized.durationMonths).toBeNull();
    expect(normalized.projects).toHaveLength(1);
    expect(normalized.projects[0]?.isInstitutional).toBe(true);
    expect(normalized.projects[0]?.name).toBe(INSTITUTIONAL_PROJECT_NAME);
    expect(normalized.projects[0]?.deliveries).toEqual([]);
  });

  it("permite misturar projetos pontuais e recorrentes no mesmo serviço mantendo o Institucional sempre pontual", () => {
    const parsed = servicePackageMutationSchema.parse({
      name: "Assessoria Full",
      durationMonths: 6,
      projects: [
        {
          isInstitutional: true,
          name: "Qualquer nome ignorado",
          projectType: "one_off",
          deliveries: [
            {
              name: "Reunião de alinhamento",
              recurrenceType: "weekly",
              tasks: [{ name: "Alinhamento", durationMinutes: 60 }],
            },
          ],
        },
        {
          isInstitutional: false,
          name: "Onboarding",
          projectType: "one_off",
          durationDays: 15,
          deliveries: [
            {
              name: "Kickoff",
              // Mesmo que chegue weekly em um projeto pontual, é normalizado para one_off
              recurrenceType: "weekly",
              recurrenceDays: [1, 3],
              tasks: [{ name: "Apresentação", durationMinutes: 90 }],
            },
          ],
        },
        {
          isInstitutional: false,
          name: "Social Media",
          projectType: "recurring",
          deliveries: [
            {
              name: "Calendário editorial",
              recurrenceType: "custom",
              recurrenceUnit: "week",
              recurrenceDays: [5, 1, 1],
              tasks: [{ name: "Roteiro", durationMinutes: 120 }],
            },
          ],
        },
      ],
    });

    const normalized = normalizeServicePackageInput(parsed);
    expect(normalized.projects).toHaveLength(3);
    expect(normalized.projects[0]?.name).toBe(INSTITUTIONAL_PROJECT_NAME);
    expect(normalized.projects[0]?.projectType).toBe("one_off");
    expect(normalized.projects[0]?.deliveries[0]?.recurrenceType).toBe(
      "one_off",
    );
    expect(normalized.projects[1]?.projectType).toBe("one_off");
    expect(normalized.projects[1]?.deliveries[0]?.recurrenceType).toBe(
      "one_off",
    );
    expect(normalized.projects[1]?.deliveries[0]?.recurrenceDays).toEqual([]);
    expect(normalized.projects[2]?.projectType).toBe("recurring");
    expect(normalized.projects[2]?.deliveries[0]?.recurrenceDays).toEqual([
      1, 5,
    ]);
  });

  it("rejeita projeto institucional marcado como recorrente em serviços e contratos", () => {
    const serviceResult = servicePackageMutationSchema.safeParse({
      name: "Serviço inválido",
      projects: [
        {
          isInstitutional: true,
          name: "Institucional",
          projectType: "recurring",
          deliveries: [],
        },
      ],
    });
    expect(serviceResult.success).toBe(false);

    const contractResult = contractServicePackageSelectionSchema.safeParse({
      packageId: "11111111-1111-4111-8111-111111111111",
      responsibleUserId: "22222222-2222-4222-8222-222222222222",
      customProjects: [
        {
          isInstitutional: true,
          name: "Institucional",
          projectType: "recurring",
          deliveries: [],
        },
      ],
    });
    expect(contractResult.success).toBe(false);
  });

  it("rejeita mais de 100 projetos no total (1 institucional + 99 explícitos)", () => {
    const explicit = Array.from({ length: 100 }, (_, index) => ({
      isInstitutional: false,
      name: `Projeto ${index + 1}`,
      projectType: "one_off" as const,
      deliveries: [],
    }));

    const result = servicePackageMutationSchema.safeParse({
      name: "Pacote gigante",
      projects: explicit,
    });

    expect(result.success).toBe(false);
  });

  it("rejeita tarefa com duração fora de múltiplos de 30 minutos", () => {
    const result = servicePackageMutationSchema.safeParse({
      name: "Pacote",
      projects: [
        {
          isInstitutional: false,
          name: "Projeto 1",
          projectType: "one_off",
          deliveries: [
            {
              name: "Entrega 1",
              tasks: [{ name: "Tarefa inválida", durationMinutes: 45 }],
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("valida seleção de serviço no contrato com projetos e entregas customizados", () => {
    const parsed = contractServicePackageSelectionSchema.parse({
      packageId: "11111111-1111-4111-8111-111111111111",
      responsibleUserId: "22222222-2222-4222-8222-222222222222",
      customProjects: [
        {
          isInstitutional: false,
          name: "Site institucional (ajustado)",
          projectType: "one_off",
          durationDays: 20,
          responsibleUserId: "33333333-3333-4333-8333-333333333333",
          deliveries: [
            {
              name: "Layout Home",
              priority: "alta",
              tasks: [{ name: "Protótipo Figma", durationMinutes: 120 }],
            },
          ],
        },
      ],
    });

    expect(parsed.customProjects).toHaveLength(1);
    expect(parsed.customProjects?.[0]?.deliveries[0]?.name).toBe("Layout Home");
  });
});
