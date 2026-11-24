import { addMonthsToFinanceDate } from "../finance/installments";

export type RecurringContractBillingInput = {
  contractType: "one_off" | "recurring";
  amountCents: number;
  firstDueDate: string | null;
  endDate: string | null;
};

export type GeneratedContractInstallment = {
  number: number;
  dueDate: string;
  amountCents: number;
  status: string;
};

/** Creates one monthly charge for every payment date in the contract term. */
export function recurringContractInstallments(
  input: RecurringContractBillingInput,
): GeneratedContractInstallment[] {
  if (
    input.contractType !== "recurring" ||
    !input.amountCents ||
    !input.firstDueDate ||
    !input.endDate
  )
    return [];

  const installments: GeneratedContractInstallment[] = [];
  for (let index = 0; installments.length <= 999; index += 1) {
    const dueDate = addMonthsToFinanceDate(input.firstDueDate, index);
    if (dueDate > input.endDate) break;
    installments.push({
      number: installments.length + 1,
      dueDate,
      amountCents: input.amountCents,
      status: "pending",
    });
  }
  return installments;
}
