export class ProjectNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Projeto nao encontrado.");
    this.name = "ProjectNotFoundError";
  }
}

export class InstitutionalProjectProtectedError extends Error {
  readonly status = 409;

  constructor() {
    super(
      "O projeto institucional e gerenciado pelo sistema e nao pode ser alterado ou excluido.",
    );
    this.name = "InstitutionalProjectProtectedError";
  }
}

export class ServiceNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Servico nao encontrado.");
    this.name = "ServiceNotFoundError";
  }
}

export class ProjectRelationsInvalidError extends Error {
  readonly status = 400;

  constructor() {
    super("Um ou mais vinculos do projeto nao sao validos.");
    this.name = "ProjectRelationsInvalidError";
  }
}

export class ServiceRelationsInvalidError extends Error {
  readonly status = 400;

  constructor() {
    super("Um ou mais vinculos do servico nao sao validos.");
    this.name = "ServiceRelationsInvalidError";
  }
}

export class ServiceNameConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("Ja existe um servico ativo com esse nome.");
    this.name = "ServiceNameConflictError";
  }
}
