import type { EntitySeed } from "./types";
import { CURRENT_USER } from "$lib/workspaces/workspace-storage";

const SEED_START = Date.UTC(2026, 6, 13);
const DAY_MS = 86_400_000;

function dateAfter(days: number): string {
  return new Date(SEED_START + days * DAY_MS).toISOString().slice(0, 10);
}

function normalizeEmailPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function expectCount(
  label: string,
  seeds: EntitySeed[],
  expected: number,
): EntitySeed[] {
  if (seeds.length !== expected) {
    throw new Error(
      `Seed de ${label}: esperado ${expected}, recebido ${seeds.length}.`,
    );
  }
  return seeds;
}

const people: [name: string, role: string, status: string][] = [
  ["Marina Costa", "Diretora de marketing", "ativo"],
  ["Rafael Alves", "Designer", "ativo"],
  ["Lívia Souza", "Estrategista", "prospecto"],
  ["João Thiago Martins", "Pesquisador", "ativo"],
  ["Thiago Alves", "Product designer", "ativo"],
  ["Ana Beatriz Lima", "Analista de projetos", "ativo"],
  ["Camila Andrade", "Advogada", "lead"],
  ["Diego Nascimento", "Diretor criativo", "prospecto"],
  ["Fernanda Rocha", "Jornalista", "ativo"],
  ["Gustavo Moreira", "Desenvolvedor", "lead"],
];

export const peopleSeeds = expectCount(
  "contatos",
  people.map(([nome, cargo, tipo], index) => ({
    nome,
    email: `${normalizeEmailPart(nome)}@exemplo.com.br`,
    telefone: `(85) 9${String(8700 + index * 113).padStart(4, "0")}-${String(1200 + index * 197).padStart(4, "0")}`,
    tipo,
    cargo,
    observacoes: `Contato demonstrativo ${index + 1} de ${people.length}.`,
  })),
  10,
);

const clients = [
  "Aurora Alimentos",
  "Norte Labs",
  "Estúdio Atlas",
  "Grupo Horizonte",
  "Casa Amora",
  "Vértice Educação",
  "Clínica Serena",
  "Maresia Hotéis",
  "Caju Tecnologia",
  "Ponte Editorial",
  "Solar Engenharia",
  "Raiz Orgânicos",
  "Lumina Arquitetura",
  "Orbe Consultoria",
  "Viva Eventos",
  "Trama Moda",
  "Farol Logística",
  "Acalanto Saúde",
  "Invento Móveis",
  "Sabiá Turismo",
];

const businessServices = [
  "Estratégia de marca",
  "Campanha de lançamento",
  "Redesign de produto",
  "Portal institucional",
  "Conteúdo para redes",
  "Pesquisa de mercado",
  "Produção audiovisual",
  "Plano de comunicação",
];
const businessCategories = [
  "marca_pessoal",
  "negocio",
  "projeto_alternativo",
  "outro",
];
const businessStages = ["negociacao", "contratacao", "ativo", "encerrado"];

export const businessSeeds = expectCount(
  "negócios",
  clients.map((client, index) => {
    const primaryPerson = people[(index * 3) % people.length][0];
    const secondaryPerson = people[(index * 7 + 2) % people.length][0];
    const service = businessServices[index % businessServices.length];
    return {
      nome: `${client} — ${service}`,
      responsaveis:
        index % 4 === 0
          ? `${primaryPerson}, ${secondaryPerson}`
          : primaryPerson,
      categoria: businessCategories[index % businessCategories.length],
      etapa: businessStages[index % businessStages.length],
      observacoes: `${service} para ${client}. Este negócio possui ${(index % 4) + 1} projeto(s).`,
    };
  }),
  20,
);

const projectInitiatives = [
  "Reposicionamento de marca",
  "Campanha institucional",
  "Novo portal",
  "Lançamento de produto",
  "Programa de conteúdo",
  "Jornada do cliente",
  "Identidade visual",
  "Relatório anual",
  "Série documental",
  "Plataforma de vendas",
];
const projectStatuses = ["planejamento", "execucao", "alteracao", "concluido"];

type ProjectSeedContext = {
  seed: EntitySeed;
  businessIndex: number;
  sequenceInBusiness: number;
};

const projectContexts: ProjectSeedContext[] = businessSeeds.flatMap(
  (business, businessIndex) =>
    Array.from({ length: (businessIndex % 4) + 1 }, (_, sequenceInBusiness) => {
      const index =
        Array.from(
          { length: businessIndex },
          (_, previous) => (previous % 4) + 1,
        ).reduce((sum, count) => sum + count, 0) + sequenceInBusiness;
      const initiative = projectInitiatives[index % projectInitiatives.length];
      const startDate = dateAfter(index * 3);
      const endDate =
        index % 6 === 0 ? "" : dateAfter(index * 3 + 21 + (index % 4) * 7);
      const briefing = `${initiative} para ${business.nome}, organizado como o projeto ${sequenceInBusiness + 1} deste negócio.`;
      return {
        businessIndex,
        sequenceInBusiness,
        seed: {
          nome: `${initiative} — ${clients[businessIndex]}`,
          servicos: businessServices[index % businessServices.length],
          negocioId: `negocios-exemplo-${businessIndex + 1}`,
          negocio: business.nome,
          cliente: clients[businessIndex],
          workspace: "workspace pessoal",
          responsavel: people[(index * 3) % people.length][0],
          dataInicio: startDate,
          dataFim: endDate,
          delivery_date: endDate,
          prazo: endDate,
          status: projectStatuses[index % projectStatuses.length],
          briefing,
          descricao: briefing,
          tags: initiative.toLocaleLowerCase("pt-BR"),
          tipoContrato: index % 3 === 0 ? "Mensal" : "Pontual",
          valor: String(6_000 + ((index * 1_750) % 24_000)),
          primeiroVencimento: startDate,
          parcelas: String(1 + (index % 3)),
        },
      };
    }),
);

export const projectSeeds = expectCount(
  "projetos",
  projectContexts.map(({ seed }) => seed),
  50,
);

const taskActions = [
  "Consolidar briefing",
  "Mapear referências",
  "Validar escopo",
  "Preparar cronograma",
  "Criar primeira versão",
  "Revisar conteúdo",
  "Ajustar solução",
  "Fazer controle de qualidade",
  "Obter aprovação",
  "Organizar entrega",
];
const subtaskActions = [
  "Reunir insumos",
  "Analisar requisitos",
  "Definir abordagem",
  "Produzir rascunho",
  "Revisar internamente",
  "Aplicar ajustes",
  "Validar com responsável",
  "Preparar versão final",
  "Documentar resultado",
  "Concluir entrega",
];
const taskCategories = [
  "reuniao",
  "planejamento",
  "criacao",
  "escrita",
  "veiculacao",
  "outro",
];
const taskPriorities = ["baixa", "normal", "alta", "emergente", "urgente"];

type SerializedSubtask = {
  id: string;
  nome: string;
  duracao: string;
  status: string;
};

function taskSubtasks(taskIndex: number): SerializedSubtask[] {
  const count = (taskIndex % 10) + 1;
  const allCompleted = taskIndex % 11 === 0;
  const completedBeforeCurrent = allCompleted
    ? count
    : Math.min(count - 1, taskIndex % 3);
  return Array.from({ length: count }, (_, sequence) => ({
    id: `subtarefa-${sequence + 1}`,
    nome: `${String(sequence + 1).padStart(2, "0")} · ${subtaskActions[sequence]}`,
    duracao: String(1 + (sequence % 4) * 0.5),
    status:
      allCompleted || sequence < completedBeforeCurrent
        ? "concluida"
        : "pendente",
  }));
}

const taskSeedsGenerated: EntitySeed[] = [];
for (const [projectIndex, project] of projectSeeds.entries()) {
  const taskCount = (projectIndex % 5) + 2;
  for (
    let sequenceInProject = 0;
    sequenceInProject < taskCount;
    sequenceInProject += 1
  ) {
    const taskIndex = taskSeedsGenerated.length;
    const subtasks = taskSubtasks(taskIndex);
    const allCompleted = subtasks.every(({ status }) => status === "concluida");
    const dueDate = taskIndex % 5 === 0 ? "" : dateAfter(7 + taskIndex);
    const projectContext = projectContexts[projectIndex];
    const duration = subtasks.reduce(
      (total, subtask) => total + Number(subtask.duracao),
      0,
    );
    taskSeedsGenerated.push({
      nome: `${taskActions[taskIndex % taskActions.length]} — ${project.nome}`,
      negocioId: `negocios-exemplo-${projectContext.businessIndex + 1}`,
      negocio: businessSeeds[projectContext.businessIndex].nome,
      projetoId: `projetos-exemplo-${projectIndex + 1}`,
      projeto: project.nome,
      responsavel: CURRENT_USER.name,
      responsavelId: CURRENT_USER.id,
      assigned_user_id: CURRENT_USER.id,
      dataEntrega: dueDate,
      data_entrega: dueDate,
      dueDate,
      due_date: dueDate,
      data: dueDate,
      status: allCompleted
        ? "conclusao"
        : taskIndex % 3 === 0
          ? "producao"
          : taskIndex % 3 === 1
            ? "fila"
            : "planejamento",
      categoria: taskCategories[taskIndex % taskCategories.length],
      prioridade: taskPriorities[taskIndex % taskPriorities.length],
      descricao: `Tarefa ${sequenceInProject + 1} de ${taskCount} do projeto ${project.nome}.`,
      duracao: String(duration),
      duration: String(duration),
      subtarefas: JSON.stringify(subtasks),
    });
  }
}

export const taskSeeds = expectCount("tarefas", taskSeedsGenerated, 200);

function assertRelationRange(
  label: string,
  counts: Map<string, number>,
  expectedParents: string[],
  minimum: number,
  maximum: number,
): void {
  for (const parentId of expectedParents) {
    const count = counts.get(parentId) ?? 0;
    if (count < minimum || count > maximum) {
      throw new Error(
        `Seed de ${label}: ${parentId} possui ${count}; esperado entre ${minimum} e ${maximum}.`,
      );
    }
  }
}

function validateSeedRelations(): void {
  const projectsByBusiness = new Map<string, number>();
  for (const project of projectSeeds) {
    projectsByBusiness.set(
      project.negocioId,
      (projectsByBusiness.get(project.negocioId) ?? 0) + 1,
    );
  }
  assertRelationRange(
    "projetos por negócio",
    projectsByBusiness,
    businessSeeds.map((_, index) => `negocios-exemplo-${index + 1}`),
    1,
    4,
  );

  const tasksByProject = new Map<string, number>();
  for (const task of taskSeeds) {
    tasksByProject.set(
      task.projetoId,
      (tasksByProject.get(task.projetoId) ?? 0) + 1,
    );
    const subtasks = JSON.parse(task.subtarefas) as unknown[];
    if (subtasks.length < 1 || subtasks.length > 10) {
      throw new Error(
        `Seed de subtarefas: ${task.nome} possui ${subtasks.length}; esperado entre 1 e 10.`,
      );
    }
  }
  assertRelationRange(
    "tarefas por projeto",
    tasksByProject,
    projectSeeds.map((_, index) => `projetos-exemplo-${index + 1}`),
    2,
    6,
  );
}

validateSeedRelations();
