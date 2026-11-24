import { describe, expect, it } from "vitest";
import type { ProjectResponsible } from "$lib/projects/types";
import {
  canSelectDeliveryResponsible,
  currentRecordResponsiblesForWorkspace,
  hasDeliveryResponsibleWorkspace,
  resolveDeliveryResponsibleSelection,
} from "./responsible-scope";

const alice: ProjectResponsible = {
  userId: "user-alice",
  name: "Alice",
  email: "alice@example.com",
  avatarUrl: null,
  role: "admin",
};

const bob: ProjectResponsible = {
  userId: "user-bob",
  name: "Bob",
  email: "bob@example.com",
  avatarUrl: null,
  role: "member",
};

const carol: ProjectResponsible = {
  userId: "user-carol",
  name: "Carol",
  email: "carol@example.com",
  avatarUrl: null,
  role: "member",
};

describe("delivery modal responsible scope", () => {
  it("enables responsible selection as soon as the contract workspace is loaded, even without a project", () => {
    const hasContractWorkspace = hasDeliveryResponsibleWorkspace({
      contractId: "contract-1",
      contractWorkspaceId: "ws-1",
      optionsWorkspaceId: "ws-1",
    });

    expect(hasContractWorkspace).toBe(true);
    expect(
      canSelectDeliveryResponsible({
        viewOnly: false,
        hasContractWorkspace,
        hasProject: false,
        contractsLoading: false,
        projectLoading: false,
        contractsError: false,
        projectError: false,
      }),
    ).toBe(true);
  });

  it("keeps responsible selection disabled before a contract is selected or while workspace options load", () => {
    expect(
      hasDeliveryResponsibleWorkspace({
        contractId: "",
        contractWorkspaceId: undefined,
        optionsWorkspaceId: "",
      }),
    ).toBe(false);

    expect(
      canSelectDeliveryResponsible({
        viewOnly: false,
        hasContractWorkspace: false,
        hasProject: false,
        contractsLoading: false,
        projectLoading: false,
        contractsError: false,
        projectError: false,
      }),
    ).toBe(false);

    expect(
      canSelectDeliveryResponsible({
        viewOnly: false,
        hasContractWorkspace: true,
        hasProject: false,
        contractsLoading: false,
        projectLoading: true,
        contractsError: false,
        projectError: false,
      }),
    ).toBe(false);
  });

  it("rejects mismatched contract workspace and loaded options workspace", () => {
    expect(
      hasDeliveryResponsibleWorkspace({
        contractId: "contract-2",
        contractWorkspaceId: "ws-2",
        optionsWorkspaceId: "ws-1",
      }),
    ).toBe(false);
  });

  it("exposes contract workspace members and preserves chosen responsible without a selected project", () => {
    const result = resolveDeliveryResponsibleSelection({
      hasContractWorkspace: true,
      hasProject: false,
      workspaceMembers: [alice, bob],
      currentRecordResponsibles: [],
      selectedResponsibleIds: [bob.userId],
    });

    expect(result.members).toEqual([alice, bob]);
    expect(result.selectedResponsible).toEqual(bob);
  });

  it("clears members and responsible when neither contract workspace nor project is selected", () => {
    const result = resolveDeliveryResponsibleSelection({
      hasContractWorkspace: false,
      hasProject: false,
      workspaceMembers: [alice],
      currentRecordResponsibles: [alice],
      selectedResponsibleIds: [alice.userId],
    });

    expect(result.members).toEqual([]);
    expect(result.selectedResponsible).toBeUndefined();
  });

  it("excludes record responsibles from another workspace when switching to a contract in a different workspace", () => {
    expect(
      currentRecordResponsiblesForWorkspace({
        currentRecordResponsibles: [alice],
        recordWorkspaceId: "ws-1",
        activeWorkspaceId: "ws-2",
      }),
    ).toEqual([]);

    const result = resolveDeliveryResponsibleSelection({
      hasContractWorkspace: true,
      hasProject: false,
      workspaceMembers: [carol],
      currentRecordResponsibles: [alice],
      recordWorkspaceId: "ws-1",
      activeWorkspaceId: "ws-2",
      selectedResponsibleIds: [alice.userId],
    });

    expect(result.members).toEqual([carol]);
    expect(result.selectedResponsible).toBeUndefined();
  });

  it("preserves legacy record responsibles when staying in the record workspace", () => {
    const result = resolveDeliveryResponsibleSelection({
      hasContractWorkspace: true,
      hasProject: true,
      workspaceMembers: [bob],
      currentRecordResponsibles: [alice],
      recordWorkspaceId: "ws-1",
      activeWorkspaceId: "ws-1",
      selectedResponsibleIds: [],
      fallbackResponsibleId: alice.userId,
    });

    expect(result.members).toEqual([bob]);
    expect(result.selectedResponsible).toEqual(alice);
  });
});
