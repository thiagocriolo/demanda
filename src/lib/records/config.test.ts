import { describe, expect, it } from "vitest";
import {
  recordsTabFromPath,
  recordsTabRoutes,
  recordsTabs,
} from "./navigation";

describe("records page configuration", () => {
  it("maps canonical and encoded routes to their domain tabs", () => {
    expect(recordsTabFromPath("/registros/contatos")).toBe("pessoas");
    expect(recordsTabFromPath("/registros/neg%C3%B3cios/")).toBe("negocios");
    expect(recordsTabFromPath("/registros/projetos")).toBe("projetos");
    expect(recordsTabFromPath("/registros/tarefas")).toBe("tarefas");
    expect(recordsTabFromPath("/registros/desconhecido")).toBeUndefined();
  });

  it("keeps routes aligned with the visible tabs", () => {
    const tabIds = recordsTabs.map(({ id }) => id);
    expect(tabIds).toEqual(["pessoas", "negocios", "projetos", "tarefas"]);
    expect(Object.keys(recordsTabRoutes)).toEqual(tabIds);
  });
});
