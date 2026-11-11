import { describe, expect, it } from "vitest";
import type { RecordsTabConfig } from "../types";
import { archivedMode, baseCard, dynamicStatusFilterOptions } from "./common";

const peopleConfig = {
  kind: "pessoa",
  statusField: "tipo",
  emptyLabel: "contato",
  config: {
    fields: [
      {
        name: "tipo",
        options: [{ value: "ativo", label: "Ativo", tone: "green" }],
      },
    ],
  },
} as unknown as RecordsTabConfig;

const projectConfig = {
  kind: "projeto",
  statusField: "status",
  emptyLabel: "projeto",
  config: {
    fields: [
      {
        name: "status",
        options: [{ value: "planejamento", label: "Planejamento" }],
      },
    ],
  },
} as unknown as RecordsTabConfig;

describe("records domain shared presentation", () => {
  it("resolves the archived query mode", () => {
    expect(archivedMode({ filter: "arquivado", showArchived: false })).toBe(
      "only",
    );
    expect(archivedMode({ filter: "todos", showArchived: true })).toBe(
      "include",
    );
    expect(archivedMode({ filter: "todos", showArchived: false })).toBe(
      "exclude",
    );
  });

  it("keeps configured, dynamic and archived filters with their counts", () => {
    const options = dynamicStatusFilterOptions(
      projectConfig,
      { planejamento: 2, personalizado: 3 },
      7,
      1,
      "Arquivados",
    );

    expect(options[0]).toEqual({ value: "todos", label: "Todos", count: 7 });
    expect(options).toContainEqual({
      value: "personalizado",
      label: "personalizado",
      count: 3,
    });
    expect(options).toContainEqual({
      value: "arquivado",
      label: "Arquivados",
      count: 1,
    });
  });

  it("builds the shared card identity and configured status metadata", () => {
    const card = baseCard(peopleConfig, {
      id: "contact-1",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      nome: "Maria",
      tipo: "ativo",
    });

    expect(card).toMatchObject({
      id: "contact-1",
      kind: "pessoa",
      title: "Maria",
      status: "Ativo",
    });
  });
});
