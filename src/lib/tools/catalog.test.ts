import { describe, expect, it, vi } from "vitest";

vi.mock("@lucide/svelte", () => ({
  ClipboardPenLine: {},
  GitCompareArrows: {},
  ScanSearch: {},
  SlidersHorizontal: {},
}));

import { findToolResource, toolResources } from "./catalog";

describe("catálogo de Ferramentas", () => {
  it("mantém as quatro chaves globais únicas", () => {
    expect(toolResources.map(({ key }) => key)).toEqual([
      "form",
      "evaluation",
      "comparison",
      "intensity",
    ]);
    expect(new Set(toolResources.map(({ key }) => key)).size).toBe(4);
  });

  it("resolve os metadados estáveis de cada ferramenta", () => {
    expect(findToolResource("evaluation").name).toBe("Avaliação");
    expect(findToolResource("intensity").availability).toBe("available");
  });
});
