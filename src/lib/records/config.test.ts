import { describe, expect, it } from "vitest";
import {
  recordsTabFromPath,
  recordsTabRoutes,
  recordsTabs,
} from "./navigation";

describe("records page configuration", () => {
  it("maps canonical and encoded routes to their domain tabs", () => {
    expect(recordsTabFromPath("/clientes/contatos")).toBe("pessoas");
    expect(recordsTabFromPath("/clientes/neg%C3%B3cios/")).toBe("negocios");
    expect(recordsTabFromPath("/clientes/projetos")).toBe("projetos");
    expect(recordsTabFromPath("/clientes/tarefas")).toBe("tarefas");
    expect(recordsTabFromPath("/clientes/desconhecido")).toBeUndefined();
  });

  it("keeps routes aligned with the visible tabs", () => {
    const tabIds = recordsTabs.map(({ id }) => id);
    expect(tabIds).toEqual([
      "pessoas",
      "negocios",
      "contratos",
      "projetos",
      "tarefas",
    ]);
    expect(Object.keys(recordsTabRoutes)).toEqual(tabIds);
  });
});
