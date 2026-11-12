import { describe, expect, it } from "vitest";
import {
  recordPageHref,
  recordPageHrefForEntity,
  recordTabFromRoute,
} from "./record-page";

const id = "eaf06398-1486-4aa2-aed3-5710b20e7ad2";

describe("URLs canônicas dos registros", () => {
  it("cria uma página estável para cada tipo de card", () => {
    expect(recordPageHref("pessoa", id)).toBe(`/registros/contatos/${id}`);
    expect(recordPageHref("negocio", id)).toBe(`/registros/negócios/${id}`);
    expect(recordPageHref("projeto", id)).toBe(`/registros/projetos/${id}`);
    expect(recordPageHref("tarefa", id)).toBe(`/registros/tarefas/${id}`);
  });

  it("alinha as chaves de persistência aos links de detalhe", () => {
    expect(recordPageHrefForEntity("pessoas", id)).toBe(
      recordPageHref("pessoa", id),
    );
    expect(recordPageHrefForEntity("negocios", id)).toBe(
      recordPageHref("negocio", id),
    );
    expect(recordPageHrefForEntity("projetos", id)).toBe(
      recordPageHref("projeto", id),
    );
    expect(recordPageHrefForEntity("entregas", id)).toBe(
      recordPageHref("tarefa", id),
    );
  });

  it("reconhece somente os quatro tipos expostos pelas rotas", () => {
    expect(recordTabFromRoute("contatos")).toBe("pessoas");
    expect(recordTabFromRoute("negócios")).toBe("negocios");
    expect(recordTabFromRoute("projetos")).toBe("projetos");
    expect(recordTabFromRoute("tarefas")).toBe("tarefas");
    expect(recordTabFromRoute("outro")).toBeUndefined();
  });
});
