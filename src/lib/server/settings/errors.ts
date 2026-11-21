import { databaseConstraint } from "../db/helpers";

export class SettingsVersionConflictError extends Error {
  readonly status = 409;

  constructor() {
    super(
      "As configurações foram alteradas em outra sessão. Recarregue e tente novamente.",
    );
    this.name = "SettingsVersionConflictError";
  }
}

export class SettingsRelationsInvalidError extends Error {
  readonly status = 400;

  constructor(
    message = "Uma ou mais configurações relacionadas não são válidas.",
  ) {
    super(message);
    this.name = "SettingsRelationsInvalidError";
  }
}

export class SettingsConflictError extends Error {
  readonly status = 409;

  constructor(
    message = "Já existe uma configuração com o mesmo identificador ou nome.",
  ) {
    super(message);
    this.name = "SettingsConflictError";
  }
}

export function translateSettingsConstraint(error: unknown): never {
  const constraint = databaseConstraint(error);
  if (constraint?.includes("foreign_key")) {
    throw new SettingsRelationsInvalidError();
  }
  if (constraint?.includes("unique")) throw new SettingsConflictError();
  throw error;
}
