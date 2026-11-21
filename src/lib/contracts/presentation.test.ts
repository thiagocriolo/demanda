import { describe, expect, it } from "vitest";
import type { Contract } from "./client";
import {
  filterAndSortContracts,
  formatContractPeriod,
  summarizeContractPortfolio,
} from "./presentation";

function sampleContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: "c-1",
    workspaceId: "ws-1",
    ownerUserId: "u-1",
    name: "Identidade Visual",
    business: { id: "b-1", name: "Flor de Mandacaru" },
    contractType: "one_off",
    amountCents: 840000,
    startDate: "2027-03-01",
    endDate: "2027-07-01",
    firstDueDate: "2027-03-01",
    paymentMethod: "Pix",
    paymentTerms: "",
    financeNotes: "",
    projectCount: 2,
    installments: [
      { id: "i-1", number: 1, dueDate: "2027-03-01", amountCents: 420000, status: "pending" },
      { id: "i-2", number: 2, dueDate: "2027-04-01", amountCents: 420000, status: "pending" },
    ],
    archivedAt: null,
    createdAt: "2027-02-01T10:00:00.000Z",
    updatedAt: "2027-02-10T10:00:00.000Z",
    ...overrides,
  };
}

describe("contracts portfolio presentation", () => {
  it("calculates active, one-off, recurring, archived and project totals", () => {
    const summary = summarizeContractPortfolio([
      sampleContract({ id: "1", contractType: "one_off", amountCents: 500000, projectCount: 2 }),
      sampleContract({ id: "2", contractType: "recurring", amountCents: 250000, projectCount: 1 }),
      sampleContract({
        id: "3",
        contractType: "one_off",
        amountCents: 999900,
        projectCount: 4,
        archivedAt: "2027-02-11T00:00:00.000Z",
      }),
    ]);

    expect(summary).toEqual({
      activeCount: 2,
      activeAmountCents: 750000,
      oneOffCount: 1,
      oneOffAmountCents: 500000,
      recurringCount: 1,
      recurringAmountCents: 250000,
      archivedCount: 1,
      linkedProjectsCount: 3,
    });
  });

  it("filters by modality, archive state, workspace and accent-insensitive query", () => {
    const items = [
      sampleContract({ id: "1", name: "Gestão de Redes", contractType: "recurring", workspaceId: "ws-a", amountCents: 300000 }),
      sampleContract({ id: "2", name: "Marca Completa", contractType: "one_off", workspaceId: "ws-b", amountCents: 900000 }),
      sampleContract({ id: "3", name: "Antigo", archivedAt: "2027-02-01T00:00:00.000Z", workspaceId: "ws-a" }),
    ];

    expect(
      filterAndSortContracts(items, {
        filter: "active",
        workspaceId: "all",
        query: "gestao",
        sort: "updated",
      }).map(({ id }) => id),
    ).toEqual(["1"]);

    expect(
      filterAndSortContracts(items, {
        filter: "archived",
        workspaceId: "all",
        query: "",
        sort: "updated",
      }).map(({ id }) => id),
    ).toEqual(["3"]);

    expect(
      filterAndSortContracts(items, {
        filter: "active",
        workspaceId: "all",
        query: "",
        sort: "amount_desc",
      }).map(({ id }) => id),
    ).toEqual(["2", "1"]);
  });

  it("formats contract period ranges and due date fallbacks", () => {
    expect(formatContractPeriod(sampleContract())).toBe("01/03/2027 → 01/07/2027");
    expect(
      formatContractPeriod(
        sampleContract({ startDate: null, endDate: null, firstDueDate: "2027-05-15" }),
      ),
    ).toBe("1º venc. 15/05/2027");
    expect(
      formatContractPeriod(
        sampleContract({ startDate: null, endDate: null, firstDueDate: null }),
      ),
    ).toBe("Período em aberto");
  });
});
