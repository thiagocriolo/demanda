export class FinancialVersionConflictError extends Error {
  readonly status = 409;

  constructor() {
    super(
      "O lançamento financeiro foi alterado em outra sessão. Recarregue e tente novamente.",
    );
    this.name = "FinancialVersionConflictError";
  }
}

export class FinancialEntryNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("O lançamento financeiro não existe neste workspace.");
    this.name = "FinancialEntryNotFoundError";
  }
}

export class FinancialInvalidOperationError extends Error {
  readonly status = 409;

  constructor(message = "A operação financeira não é válida.") {
    super(message);
    this.name = "FinancialInvalidOperationError";
  }
}
