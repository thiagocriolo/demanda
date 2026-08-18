import { describe, expect, it } from "vitest";
import { findScheduleConflict } from "./conflicts";
import type { ScheduleEntry, ScheduleTask } from "./types";

const entry: ScheduleEntry = {
  date: "2026-07-15",
  startMinutes: 480,
  durationSlots: 2,
};

function task(id: string, responsibleId: string): ScheduleTask {
  return {
    id,
    createdAt: "2026-07-14T12:00:00.000Z",
    updatedAt: "2026-07-14T12:00:00.000Z",
    taskId: id,
    taskNome: id,
    subtaskId: id,
    sequence: 0,
    subtaskCount: 1,
    nome: id,
    duracao: "1",
    responsavel: "Pessoa com mesmo nome",
    responsibleUserIds: JSON.stringify([responsibleId]),
  };
}

describe("BE-11: pré-validação relacional de conflitos", () => {
  it("não confunde usuários diferentes que possuem o mesmo nome", () => {
    const candidate = task(
      "e318b68d-9ee2-41db-96d1-9ed3db285a29",
      "16793c47-dafd-4f45-9a43-a2a0b1ebac2e",
    );
    const other = task(
      "7c25cf68-7c36-4b73-93bd-d65f78099d76",
      "2204fbf3-a693-43af-9215-24322d65aefe",
    );
    expect(
      findScheduleConflict(candidate, entry, [candidate, other], {
        [other.id]: entry,
      }),
    ).toBeUndefined();
  });

  it("detecta o mesmo usuário por ID estável", () => {
    const responsibleId = "16793c47-dafd-4f45-9a43-a2a0b1ebac2e";
    const candidate = task(
      "e318b68d-9ee2-41db-96d1-9ed3db285a29",
      responsibleId,
    );
    const other = task("7c25cf68-7c36-4b73-93bd-d65f78099d76", responsibleId);
    expect(
      findScheduleConflict(candidate, entry, [candidate, other], {
        [other.id]: entry,
      })?.task.id,
    ).toBe(other.id);
  });
});
