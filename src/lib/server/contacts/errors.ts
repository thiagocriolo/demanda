export class ContactNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Contato não encontrado.");
    this.name = "ContactNotFoundError";
  }
}

export class ContactLinkedUserInvalidError extends Error {
  readonly status = 400;

  constructor() {
    super("O usuário vinculado não é válido.");
    this.name = "ContactLinkedUserInvalidError";
  }
}

export class ContactConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("Já existe um contato seu vinculado a este usuário.");
    this.name = "ContactConflictError";
  }
}
