import { describe, expect, it } from "vitest";
import { toAgendaCardItem } from "./card-item";
import type { AgendaItem } from "./types";

describe("toAgendaCardItem", () => {
  it("não inventa progresso nem contagem de tarefas para projetos", () => {
    const item: AgendaItem = {
      id: "project-1",
      mode: "projects",
      title: "Site institucional",
      date: "2026-07-31",
      order: 0,
      version: 1,
      status: "execucao",
      statusLabel: "Execução",
      tone: "blue",
      client: "Cliente",
      relation: "Responsável",
      responsible: "Responsável",
      description: "Briefing",
      durationMinutes: 60,
      priority: "normal",
      progress: 0,
      completed: 0,
      total: 0,
    };

    const card = toAgendaCardItem(item);

    expect(card.progress).toBeUndefined();
    expect(card.progressMeta).toBeUndefined();
    expect(card.counts).toBeUndefined();
    expect(card.completion).toBe("31.07.2026");
  });
});
