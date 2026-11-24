export const businessStages = [
  "negociacao",
  "contratacao",
  "ativo",
  "encerrado",
  "arquivado",
] as const;

export type BusinessStage = (typeof businessStages)[number];
export type ActiveBusinessStage = Exclude<BusinessStage, "arquivado">;

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

/** Maps display labels and supported Portuguese spellings to persisted keys. */
export function canonicalBusinessStage(
  value: string,
): BusinessStage | undefined {
  const aliases: Record<string, BusinessStage> = {
    negociacao: "negociacao",
    contratacao: "contratacao",
    ativo: "ativo",
    ativado: "ativo",
    encerrado: "encerrado",
    arquivado: "arquivado",
  };
  return aliases[normalized(value)];
}

export function isActiveBusinessStage(
  value: string,
): value is ActiveBusinessStage {
  return (
    (businessStages as readonly string[]).includes(value) &&
    value !== "arquivado"
  );
}
