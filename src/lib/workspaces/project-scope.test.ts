import { describe, expect, it } from "vitest";
import type { EntityRecord } from "$lib/entities/types";
import { deliveryBelongsToProjects } from "./project-scope";

const project: EntityRecord = {
  id: "project-server-id",
  nome: "Site institucional",
  workspaceId: "workspace-server-id",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

describe("deliveryBelongsToProjects", () => {
  it("aceita somente o ID exato e nunca associa pelo nome", () => {
    expect(
      deliveryBelongsToProjects(
        {
          ...project,
          id: "delivery-with-id",
          projetoId: project.id,
          projeto: project.nome,
        },
        [project],
      ),
    ).toBe(true);

    expect(
      deliveryBelongsToProjects(
        {
          ...project,
          id: "legacy-delivery",
          projetoId: "",
          projeto: project.nome,
        },
        [project],
      ),
    ).toBe(false);
  });
});
