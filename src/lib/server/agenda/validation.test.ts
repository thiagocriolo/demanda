import { describe, expect, it } from "vitest";
import { agendaQuerySchema } from "./validation";

describe("filtros de leitura da Agenda", () => {
  it("aceita somente um workspace UUID opcional", () => {
    const workspaceId = "078ef345-0bdf-4ddb-9135-13a824ec4f6d";
    expect(agendaQuerySchema.parse({ workspaceId })).toEqual({ workspaceId });
    expect(agendaQuerySchema.safeParse({ workspaceId: "global" }).success).toBe(
      false,
    );
  });
});
