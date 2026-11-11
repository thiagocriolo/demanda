import { describe, expect, it } from "vitest";
import { ContactApiError } from "../../contacts/client";
import {
  entityPersistenceErrorMessage,
  getEntityPersistenceAdapter,
} from "./index";

describe("entity persistence adapter registry", () => {
  it("routes each server-backed entity to an isolated adapter", () => {
    expect(getEntityPersistenceAdapter("pessoas")).toBeDefined();
    expect(getEntityPersistenceAdapter("negocios")).toBeDefined();
    expect(getEntityPersistenceAdapter("projetos")).toBeDefined();
    expect(getEntityPersistenceAdapter("entregas")).toBeDefined();
    expect(getEntityPersistenceAdapter("local-only")).toBeUndefined();
  });

  it("exposes API messages without leaking unexpected errors", () => {
    expect(
      entityPersistenceErrorMessage(
        new ContactApiError(409, "Contato já alterado."),
      ),
    ).toBe("Contato já alterado.");
    expect(entityPersistenceErrorMessage(new Error("internal details"))).toBe(
      "Não foi possível concluir a operação solicitada.",
    );
  });
});
