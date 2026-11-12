import { describe, expect, it } from "vitest";
import {
  commandDocumentFromHash,
  commandDocumentFromUrl,
  commandReviewUrl,
} from "./command-url";

describe("commandReviewUrl", () => {
  it("preserva um documento JSON UTF-8 no link de revisão", () => {
    const document =
      '{"protocol":"demanda.commands/v2","commands":[{"id":"tarefa","data":{"name":"Gestão"}}]}';
    const url = new URL(commandReviewUrl(document), "https://demanda.test");

    expect(commandDocumentFromHash(url.hash)).toBe(document);
  });

  it("rejeita uma carga inválida", () => {
    expect(() => commandDocumentFromUrl("não-é-base64")).toThrow("inválido");
  });
});
