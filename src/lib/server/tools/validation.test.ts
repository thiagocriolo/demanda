import { describe, expect, it } from "vitest";
import {
  defaultToolConfig,
  emptyToolUseContent,
  toolKeys,
  type EvaluationToolConfig,
  type IntensityToolConfig,
} from "../../tools/types";
import {
  isUseContentPublishable,
  responseMatchesUse,
  toolConfigSchema,
  toolResponsePayloadSchema,
  visualFileIds,
} from "./validation";

const ids = {
  field: "10000000-0000-4000-8000-000000000001",
  item: "10000000-0000-4000-8000-000000000002",
  alternativeA: "10000000-0000-4000-8000-000000000003",
  alternativeB: "10000000-0000-4000-8000-000000000004",
  scale: "10000000-0000-4000-8000-000000000005",
  fileA: "10000000-0000-4000-8000-000000000006",
  fileB: "10000000-0000-4000-8000-000000000007",
};

const assetA = {
  id: "10000000-0000-4000-8000-000000000008",
  fileId: ids.fileA,
  url: `/api/files/${ids.fileA}/content`,
  name: "referencia-a.png",
};
const assetB = {
  id: "10000000-0000-4000-8000-000000000009",
  fileId: ids.fileB,
  url: `/api/files/${ids.fileB}/content`,
  name: "referencia-b.png",
};

describe("domínio das Ferramentas", () => {
  it("mantém configurações válidas e discriminadas para as quatro Ferramentas", () => {
    for (const toolKey of toolKeys) {
      const config = defaultToolConfig(toolKey);
      expect(config.kind).toBe(toolKey);
      expect(toolConfigSchema.safeParse(config).success).toBe(true);
      expect(emptyToolUseContent(toolKey).kind).toBe(toolKey);
    }
  });

  it("só publica Avaliação e Comparação com o conteúdo visual mínimo", () => {
    expect(isUseContentPublishable({ kind: "evaluation", items: [] })).toBe(
      false,
    );
    expect(
      isUseContentPublishable({
        kind: "evaluation",
        items: [
          {
            id: ids.item,
            title: "Referência",
            description: "",
            assets: [assetA],
          },
        ],
      }),
    ).toBe(true);
    expect(
      isUseContentPublishable({
        kind: "comparison",
        alternatives: [
          {
            id: ids.alternativeA,
            title: "A",
            description: "",
            assets: [assetA],
          },
        ],
      }),
    ).toBe(false);
    const comparison = {
      kind: "comparison" as const,
      alternatives: [
        { id: ids.alternativeA, title: "A", description: "", assets: [assetA] },
        { id: ids.alternativeB, title: "B", description: "", assets: [assetB] },
      ],
    };
    expect(isUseContentPublishable(comparison)).toBe(true);
    expect(visualFileIds(comparison)).toEqual([ids.fileA, ids.fileB]);
  });

  it("distingue Intensidade não respondida do centro escolhido conscientemente", () => {
    const config: IntensityToolConfig = {
      kind: "intensity",
      instructions: "",
      scales: [{ id: ids.scale, leftLabel: "Clássico", rightLabel: "Moderno" }],
    };
    expect(
      responseMatchesUse(
        config,
        { kind: "intensity" },
        { kind: "intensity", values: [] },
      ),
    ).toBe(false);
    expect(
      responseMatchesUse(
        config,
        { kind: "intensity" },
        { kind: "intensity", values: [{ scaleId: ids.scale, value: 50 }] },
      ),
    ).toBe(true);
    expect(
      toolResponsePayloadSchema.safeParse({
        kind: "intensity",
        values: [{ scaleId: ids.scale, value: 52 }],
      }).success,
    ).toBe(false);
  });

  it("valida cada resposta contra o snapshot e o conteúdo do Uso", () => {
    const evaluationConfig: EvaluationToolConfig = {
      kind: "evaluation",
      instructions: "",
      scale: [
        { value: 1, label: "Não gostei" },
        { value: 5, label: "Gostei muito" },
      ],
      attributes: ["Cores"],
      commentRequired: true,
    };
    const content = {
      kind: "evaluation" as const,
      items: [
        {
          id: ids.item,
          title: "Referência",
          description: "",
          assets: [assetA],
        },
      ],
    };
    expect(
      responseMatchesUse(evaluationConfig, content, {
        kind: "evaluation",
        reviews: [
          {
            itemId: ids.item,
            rating: 5,
            attributes: ["Cores"],
            comment: "Boa direção",
          },
        ],
      }),
    ).toBe(true);
    expect(
      responseMatchesUse(evaluationConfig, content, {
        kind: "evaluation",
        reviews: [
          {
            itemId: ids.item,
            rating: 4,
            attributes: ["Tipografia"],
            comment: "",
          },
        ],
      }),
    ).toBe(false);
  });
});
