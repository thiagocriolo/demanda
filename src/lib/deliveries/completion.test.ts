import { describe, expect, it } from "vitest";
import {
  areAllDeliveryTasksCompleted,
  resolveDeliveryStatusAfterTaskUpdate,
} from "./completion";

describe("delivery completion rules", () => {
  it("detects when all tasks are completed", () => {
    expect(areAllDeliveryTasksCompleted([])).toBe(false);
    expect(areAllDeliveryTasksCompleted(["pendente"])).toBe(false);
    expect(areAllDeliveryTasksCompleted(["concluida", "pendente"])).toBe(false);
    expect(areAllDeliveryTasksCompleted(["concluida"])).toBe(true);
    expect(areAllDeliveryTasksCompleted(["concluida", "concluida"])).toBe(true);
  });

  it("moves automatically to conclusao when the last pending task is completed", () => {
    expect(
      resolveDeliveryStatusAfterTaskUpdate({
        previousStatus: "producao",
        requestedStatus: "producao",
        previousTaskStatuses: ["concluida", "pendente"],
        nextTaskStatuses: ["concluida", "concluida"],
      }),
    ).toBe("conclusao");
  });

  it("preserves manual status changes even when all tasks become completed", () => {
    expect(
      resolveDeliveryStatusAfterTaskUpdate({
        previousStatus: "producao",
        requestedStatus: "fila",
        previousTaskStatuses: ["pendente"],
        nextTaskStatuses: ["concluida"],
      }),
    ).toBe("fila");
  });

  it("allows moving manually to conclusao with pending tasks", () => {
    expect(
      resolveDeliveryStatusAfterTaskUpdate({
        previousStatus: "producao",
        requestedStatus: "conclusao",
        previousTaskStatuses: ["pendente"],
        nextTaskStatuses: ["pendente"],
      }),
    ).toBe("conclusao");
  });

  it("does not override manual reopening when all tasks were already completed", () => {
    expect(
      resolveDeliveryStatusAfterTaskUpdate({
        previousStatus: "conclusao",
        requestedStatus: "producao",
        previousTaskStatuses: ["concluida", "concluida"],
        nextTaskStatuses: ["concluida", "concluida"],
      }),
    ).toBe("producao");

    expect(
      resolveDeliveryStatusAfterTaskUpdate({
        previousStatus: "producao",
        requestedStatus: "producao",
        previousTaskStatuses: ["concluida", "concluida"],
        nextTaskStatuses: ["concluida", "concluida"],
      }),
    ).toBe("producao");
  });
});
