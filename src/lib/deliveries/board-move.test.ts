import { describe, expect, it } from "vitest";
import type { EntityRecord } from "$lib/entities/types";
import {
  canDropInBoardColumn,
  canMoveBetweenColumns,
  filterWorkspaceActiveBoardRecords,
  isArchiveColumnDrop,
  recordWorkspaceId,
  resolveWorkspaceBeforeId,
} from "./board-move";

function makeRecord(
  id: string,
  workspaceId: string,
  extra: Record<string, string> = {},
): EntityRecord {
  return {
    id,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    workspaceId,
    workspace_id: workspaceId,
    nome: `Entrega ${id}`,
    status: "fila",
    archivedAt: "",
    ...extra,
  };
}

describe("board-move helpers for Pauta", () => {
  it("allows moving cards between columns only in status and priority views", () => {
    expect(canMoveBetweenColumns("status")).toBe(true);
    expect(canMoveBetweenColumns("priority")).toBe(true);
    expect(canMoveBetweenColumns("client")).toBe(false);
    expect(canMoveBetweenColumns("project")).toBe(false);

    expect(canDropInBoardColumn("status", "fila", "a_fazer")).toBe(true);
    expect(canDropInBoardColumn("status", "conclusao", "arquivado")).toBe(true);
    expect(canDropInBoardColumn("status", "arquivado", "producao")).toBe(false);
    expect(canDropInBoardColumn("status", "arquivado", "arquivado")).toBe(false);
    expect(isArchiveColumnDrop("status", "arquivado")).toBe(true);
    expect(isArchiveColumnDrop("status", "conclusao")).toBe(false);
    expect(isArchiveColumnDrop("priority", "arquivado")).toBe(false);
    expect(canDropInBoardColumn("priority", "normal", "alta")).toBe(true);
    expect(canDropInBoardColumn("client", "biz-1", "biz-2")).toBe(false);
    expect(canDropInBoardColumn("client", "biz-1", "biz-1")).toBe(true);
    expect(canDropInBoardColumn("project", "proj-1", "proj-2")).toBe(false);
    expect(canDropInBoardColumn("project", "proj-1", "proj-1")).toBe(true);
  });

  it("isolates active board records to the moved delivery workspace", () => {
    const w1Active = makeRecord("d1", "ws-1");
    const w1Archived = makeRecord("d2", "ws-1", {
      archivedAt: "2026-07-01T00:00:00.000Z",
    });
    const w2Active = makeRecord("d3", "ws-2");

    const filtered = filterWorkspaceActiveBoardRecords(
      [w1Active, w1Archived, w2Active],
      recordWorkspaceId(w1Active),
    );

    expect(filtered.map(({ id }) => id)).toEqual(["d1"]);
  });

  it("resolves beforeId when dropping before a card from another workspace", () => {
    const visualItems = [
      { id: "ws2-a" },
      { id: "ws1-a" },
      { id: "ws2-b" },
      { id: "ws1-b" },
      { id: "ws2-c" },
    ];
    const ws1TargetIds = ["ws1-a", "ws1-b"];

    expect(resolveWorkspaceBeforeId("ws1-b", visualItems, ws1TargetIds)).toBe(
      "ws1-b",
    );
    expect(resolveWorkspaceBeforeId("ws2-a", visualItems, ws1TargetIds)).toBe(
      "ws1-a",
    );
    expect(resolveWorkspaceBeforeId("ws2-b", visualItems, ws1TargetIds)).toBe(
      "ws1-b",
    );
    expect(
      resolveWorkspaceBeforeId("ws2-c", visualItems, ws1TargetIds),
    ).toBeUndefined();
    expect(
      resolveWorkspaceBeforeId(undefined, visualItems, ws1TargetIds),
    ).toBeUndefined();
  });
});
