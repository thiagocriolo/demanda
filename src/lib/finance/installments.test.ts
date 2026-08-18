import { describe, expect, it } from "vitest";
import {
  addMonthsToFinanceDate,
  buildFinanceInstallments,
  financeInstallmentsTotal,
  rebalanceFinanceInstallments,
} from "./installments";

describe("finance installments", () => {
  it("keeps end-of-month due dates valid", () => {
    expect(addMonthsToFinanceDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToFinanceDate("2026-01-31", 2)).toBe("2026-03-31");
  });

  it("splits the total without losing cents", () => {
    const installments = buildFinanceInstallments(100, 3, "2026-07-13");

    expect(installments.map((item) => item.amount)).toEqual([
      33.33, 33.33, 33.34,
    ]);
    expect(financeInstallmentsTotal(installments)).toBe(100);
    expect(installments.map((item) => item.dueDate)).toEqual([
      "2026-07-13",
      "2026-08-13",
      "2026-09-13",
    ]);
  });

  it("redistributes the remaining value after a manual change", () => {
    const installments = buildFinanceInstallments(100, 3, "2026-07-13");
    const rebalanced = rebalanceFinanceInstallments(installments, 0, 40, 100);

    expect(rebalanced.map((item) => item.amount)).toEqual([40, 30, 30]);
    expect(financeInstallmentsTotal(rebalanced)).toBe(100);
  });
});
