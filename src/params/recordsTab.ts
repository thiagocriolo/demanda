import type { ParamMatcher } from "@sveltejs/kit";

const recordsTabs = new Set([
  "pessoas",
  "contatos",
  "negócios",
  "contratos",
  "projetos",
  "entregas",
  "tarefas",
]);

export const match: ParamMatcher = (param) =>
  recordsTabs.has(param.toLocaleLowerCase("pt-BR"));
