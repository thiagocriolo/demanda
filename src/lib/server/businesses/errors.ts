export class BusinessNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Negocio nao encontrado.");
    this.name = "BusinessNotFoundError";
  }
}

export class BusinessResponsiblesInvalidError extends Error {
  readonly status = 400;

  constructor() {
    super("Um ou mais responsaveis nao sao validos.");
    this.name = "BusinessResponsiblesInvalidError";
  }
}
