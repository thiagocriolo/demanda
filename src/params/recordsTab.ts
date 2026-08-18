import type { ParamMatcher } from "@sveltejs/kit";

const recordsTabs = new Set(["contatos", "negócios", "projetos", "tarefas"]);

export const match: ParamMatcher = (param) =>
  recordsTabs.has(param.toLocaleLowerCase("pt-BR"));
