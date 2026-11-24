import { describe, expect, it } from "vitest";
import { recurringContractInstallments } from "./recurrence";

const recurringContract = {
  contractType: "recurring" as const,
  amountCents: 250_000,
  firstDueDate: "2026-01-31",
  endDate: "2026-05-31",
};

describe("recurring contract billing", () => {
  it("creates a monthly charge on the payment date through the contract end", () => {
    expect(recurringContractInstallments(recurringContract)).toEqual([
      {
        number: 1,
        dueDate: "2026-01-31",
        amountCents: 250_000,
        status: "pending",
      },
      {
        number: 2,
        dueDate: "2026-02-28",
        amountCents: 250_000,
        status: "pending",
      },
      {
        number: 3,
        dueDate: "2026-03-31",
        amountCents: 250_000,
        status: "pending",
      },
      {
        number: 4,
        dueDate: "2026-04-30",
        amountCents: 250_000,
        status: "pending",
      },
      {
        number: 5,
        dueDate: "2026-05-31",
        amountCents: 250_000,
        status: "pending",
      },
    ]);
  });

  it("does not create billing without a payment date or contract end", () => {
    expect(
      recurringContractInstallments({ ...recurringContract, endDate: null }),
    ).toEqual([]);
    expect(
      recurringContractInstallments({
        ...recurringContract,
        firstDueDate: null,
      }),
    ).toEqual([]);
  });
});
