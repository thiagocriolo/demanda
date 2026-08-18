import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type UserOfferingSeedProfile = {
  userId: string;
  username: string;
  workspaceId: string;
  serviceCount: number;
  deliveryCount: number;
};

export type UserOfferingSeedProfileTotals = {
  userId: string;
  username: string;
  workspaceId: string;
  services: number;
  deliveries: number;
  deliverySubtasks: number;
};

export type UserOfferingSeedTotals = {
  services: number;
  deliveries: number;
  deliverySubtasks: number;
  profiles: UserOfferingSeedProfileTotals[];
};

type ServiceDefinition = {
  name: string;
  description: string;
  icon: string;
  color: string;
  status: "planejamento" | "execucao" | "alteracao";
  durationDays: number;
  contractType: "one_off" | "recurring";
  amountCents: number;
  installmentCount: number;
  paymentMethod: string;
  paymentTerms: string;
  financeNotes: string;
};

type DeliveryDefinition = {
  name: string;
  description: string;
  category:
    "reuniao" | "planejamento" | "criacao" | "escrita" | "veiculacao" | "outro";
  status: "planejamento" | "fila" | "producao";
  priority: "baixa" | "normal" | "alta" | "emergente" | "urgente";
  subtasks: readonly [
    { name: string; durationMinutes: number },
    { name: string; durationMinutes: number },
  ];
};

const serviceDefinitions: readonly ServiceDefinition[] = [
  {
    name: "Estratégia de marca",
    description:
      "Diagnóstico, posicionamento e plano estratégico para a marca.",
    icon: "compass",
    color: "blue",
    status: "planejamento",
    durationDays: 20,
    contractType: "one_off",
    amountCents: 480_000,
    installmentCount: 2,
    paymentMethod: "Pix",
    paymentTerms: "50% na contratação e 50% na apresentação final.",
    financeNotes: "Pesquisas externas são orçadas separadamente.",
  },
  {
    name: "Identidade visual",
    description:
      "Criação do sistema visual e das principais aplicações da marca.",
    icon: "palette",
    color: "violet",
    status: "execucao",
    durationDays: 30,
    contractType: "one_off",
    amountCents: 720_000,
    installmentCount: 3,
    paymentMethod: "Boleto",
    paymentTerms: "Entrada e duas parcelas mensais iguais.",
    financeNotes: "Inclui duas rodadas de ajustes.",
  },
  {
    name: "Gestão de redes sociais",
    description: "Planejamento, produção e acompanhamento mensal de conteúdo.",
    icon: "messages-square",
    color: "pink",
    status: "execucao",
    durationDays: 30,
    contractType: "recurring",
    amountCents: 390_000,
    installmentCount: 1,
    paymentMethod: "Transferência",
    paymentTerms: "Vencimento no quinto dia útil de cada mês.",
    financeNotes: "Investimento em mídia não está incluído.",
  },
  {
    name: "Landing page",
    description:
      "Estratégia, conteúdo, interface e publicação de página de conversão.",
    icon: "panels-top-left",
    color: "cyan",
    status: "planejamento",
    durationDays: 18,
    contractType: "one_off",
    amountCents: 560_000,
    installmentCount: 2,
    paymentMethod: "Pix",
    paymentTerms: "40% na contratação e 60% antes da publicação.",
    financeNotes:
      "Domínio, hospedagem e integrações pagas não estão incluídos.",
  },
  {
    name: "Campanha de lançamento",
    description: "Concepção e execução dos pontos de contato de uma campanha.",
    icon: "rocket",
    color: "amber",
    status: "planejamento",
    durationDays: 45,
    contractType: "one_off",
    amountCents: 980_000,
    installmentCount: 4,
    paymentMethod: "Boleto",
    paymentTerms: "25% de entrada e três parcelas quinzenais.",
    financeNotes:
      "Produção audiovisual de grande porte depende de orçamento próprio.",
  },
  {
    name: "Produção audiovisual",
    description: "Pré-produção, captação e edição de conteúdo audiovisual.",
    icon: "video",
    color: "red",
    status: "execucao",
    durationDays: 15,
    contractType: "one_off",
    amountCents: 640_000,
    installmentCount: 2,
    paymentMethod: "Pix",
    paymentTerms: "50% para reservar a produção e 50% na aprovação.",
    financeNotes: "Deslocamentos fora da cidade são cobrados à parte.",
  },
  {
    name: "Conteúdo editorial",
    description: "Pesquisa, redação e revisão de conteúdos especializados.",
    icon: "notebook-pen",
    color: "emerald",
    status: "alteracao",
    durationDays: 12,
    contractType: "recurring",
    amountCents: 310_000,
    installmentCount: 1,
    paymentMethod: "Transferência",
    paymentTerms: "Pagamento mensal após aprovação da pauta.",
    financeNotes: "Entrevistas adicionais podem alterar o prazo.",
  },
  {
    name: "Automação de marketing",
    description:
      "Mapeamento e implementação de jornadas automatizadas de relacionamento.",
    icon: "workflow",
    color: "indigo",
    status: "planejamento",
    durationDays: 25,
    contractType: "one_off",
    amountCents: 830_000,
    installmentCount: 3,
    paymentMethod: "Boleto",
    paymentTerms: "30% de entrada e saldo em duas entregas técnicas.",
    financeNotes:
      "Licenças das plataformas são de responsabilidade do cliente.",
  },
  {
    name: "Consultoria comercial",
    description:
      "Análise do processo comercial e implantação de melhorias prioritárias.",
    icon: "handshake",
    color: "orange",
    status: "execucao",
    durationDays: 60,
    contractType: "recurring",
    amountCents: 520_000,
    installmentCount: 1,
    paymentMethod: "Pix",
    paymentTerms: "Mensalidade antecipada no primeiro dia útil.",
    financeNotes: "Inclui uma reunião de acompanhamento por semana.",
  },
  {
    name: "Relatório de performance",
    description:
      "Consolidação de indicadores, aprendizados e recomendações executivas.",
    icon: "chart-no-axes-combined",
    color: "slate",
    status: "alteracao",
    durationDays: 10,
    contractType: "one_off",
    amountCents: 270_000,
    installmentCount: 1,
    paymentMethod: "Transferência",
    paymentTerms: "Pagamento integral na contratação.",
    financeNotes: "Acesso às fontes de dados deve ser fornecido pelo cliente.",
  },
];

const deliveryDefinitions: readonly DeliveryDefinition[] = [
  {
    name: "Diagnóstico e oportunidades",
    description:
      "Levantamento do cenário atual e priorização de oportunidades.",
    category: "planejamento",
    status: "planejamento",
    priority: "alta",
    subtasks: [
      { name: "Reunir dados do cenário atual", durationMinutes: 90 },
      { name: "Consolidar oportunidades prioritárias", durationMinutes: 90 },
    ],
  },
  {
    name: "Briefing estratégico",
    description:
      "Documento de alinhamento com objetivos, público e critérios de sucesso.",
    category: "reuniao",
    status: "planejamento",
    priority: "normal",
    subtasks: [
      { name: "Conduzir reunião de briefing", durationMinutes: 60 },
      { name: "Documentar decisões e pendências", durationMinutes: 60 },
    ],
  },
  {
    name: "Mapa de públicos",
    description:
      "Definição dos públicos prioritários, necessidades e mensagens centrais.",
    category: "planejamento",
    status: "fila",
    priority: "alta",
    subtasks: [
      { name: "Segmentar públicos prioritários", durationMinutes: 90 },
      { name: "Validar necessidades e mensagens", durationMinutes: 60 },
    ],
  },
  {
    name: "Conceito criativo",
    description:
      "Construção do conceito orientador e de suas possibilidades de aplicação.",
    category: "criacao",
    status: "producao",
    priority: "emergente",
    subtasks: [
      { name: "Desenvolver rotas conceituais", durationMinutes: 120 },
      { name: "Refinar o conceito selecionado", durationMinutes: 90 },
    ],
  },
  {
    name: "Guia visual",
    description: "Organização das regras visuais e exemplos essenciais de uso.",
    category: "criacao",
    status: "fila",
    priority: "normal",
    subtasks: [
      { name: "Diagramar regras visuais", durationMinutes: 120 },
      { name: "Revisar aplicações do guia", durationMinutes: 60 },
    ],
  },
  {
    name: "Kit de peças digitais",
    description:
      "Produção de um conjunto coerente de peças para canais digitais.",
    category: "criacao",
    status: "producao",
    priority: "alta",
    subtasks: [
      { name: "Criar peças principais", durationMinutes: 150 },
      { name: "Adaptar formatos e exportar", durationMinutes: 90 },
    ],
  },
  {
    name: "Calendário editorial",
    description:
      "Distribuição de temas, formatos e datas do ciclo de conteúdo.",
    category: "planejamento",
    status: "planejamento",
    priority: "normal",
    subtasks: [
      { name: "Selecionar temas do ciclo", durationMinutes: 60 },
      { name: "Distribuir formatos e datas", durationMinutes: 90 },
    ],
  },
  {
    name: "Pacote de conteúdo",
    description: "Redação e preparação dos conteúdos definidos para o período.",
    category: "escrita",
    status: "producao",
    priority: "alta",
    subtasks: [
      { name: "Redigir conteúdos planejados", durationMinutes: 180 },
      { name: "Revisar textos e chamadas", durationMinutes: 90 },
    ],
  },
  {
    name: "Roteiros de campanha",
    description: "Roteiros para anúncios, vídeos e demais peças narrativas.",
    category: "escrita",
    status: "fila",
    priority: "emergente",
    subtasks: [
      { name: "Estruturar narrativas da campanha", durationMinutes: 120 },
      { name: "Revisar roteiros por canal", durationMinutes: 90 },
    ],
  },
  {
    name: "Landing page publicada",
    description:
      "Página responsiva revisada, integrada e pronta para divulgação.",
    category: "veiculacao",
    status: "producao",
    priority: "urgente",
    subtasks: [
      { name: "Implementar conteúdo e interface", durationMinutes: 180 },
      { name: "Testar integrações e publicar", durationMinutes: 120 },
    ],
  },
  {
    name: "Configuração de automação",
    description:
      "Configuração técnica de gatilhos, condições e ações automatizadas.",
    category: "outro",
    status: "producao",
    priority: "alta",
    subtasks: [
      { name: "Configurar gatilhos e condições", durationMinutes: 120 },
      { name: "Testar ações automatizadas", durationMinutes: 90 },
    ],
  },
  {
    name: "Fluxo de relacionamento",
    description:
      "Sequência de mensagens para ativação e relacionamento com a base.",
    category: "escrita",
    status: "fila",
    priority: "normal",
    subtasks: [
      { name: "Mapear etapas do relacionamento", durationMinutes: 90 },
      { name: "Redigir mensagens do fluxo", durationMinutes: 150 },
    ],
  },
  {
    name: "Captação audiovisual",
    description:
      "Captação organizada conforme roteiro, plano de cenas e agenda aprovada.",
    category: "criacao",
    status: "producao",
    priority: "urgente",
    subtasks: [
      { name: "Preparar equipamentos e locação", durationMinutes: 90 },
      { name: "Realizar captação planejada", durationMinutes: 240 },
    ],
  },
  {
    name: "Vídeo finalizado",
    description:
      "Vídeo editado, sonorizado, legendado e exportado nos formatos acordados.",
    category: "criacao",
    status: "producao",
    priority: "alta",
    subtasks: [
      { name: "Editar narrativa e acabamento", durationMinutes: 240 },
      { name: "Legendar e exportar versões", durationMinutes: 120 },
    ],
  },
  {
    name: "Apresentação executiva",
    description:
      "Síntese visual das decisões, recomendações e próximos passos.",
    category: "criacao",
    status: "fila",
    priority: "normal",
    subtasks: [
      { name: "Estruturar narrativa executiva", durationMinutes: 90 },
      { name: "Diagramar e revisar apresentação", durationMinutes: 120 },
    ],
  },
  {
    name: "Plano comercial",
    description:
      "Plano de ação com etapas, responsáveis, metas e indicadores comerciais.",
    category: "planejamento",
    status: "planejamento",
    priority: "alta",
    subtasks: [
      { name: "Definir metas e indicadores", durationMinutes: 90 },
      { name: "Organizar plano de execução", durationMinutes: 120 },
    ],
  },
  {
    name: "Materiais de venda",
    description:
      "Materiais de apoio para apresentação, proposta e acompanhamento comercial.",
    category: "criacao",
    status: "fila",
    priority: "normal",
    subtasks: [
      { name: "Preparar conteúdo comercial", durationMinutes: 120 },
      { name: "Diagramar materiais de apoio", durationMinutes: 150 },
    ],
  },
  {
    name: "Relatório de desempenho",
    description:
      "Leitura consolidada dos indicadores e recomendações para o próximo ciclo.",
    category: "outro",
    status: "producao",
    priority: "baixa",
    subtasks: [
      { name: "Consolidar indicadores", durationMinutes: 90 },
      { name: "Registrar análises e recomendações", durationMinutes: 120 },
    ],
  },
  {
    name: "Reunião de resultados",
    description:
      "Apresentação dos resultados com decisões e encaminhamentos registrados.",
    category: "reuniao",
    status: "planejamento",
    priority: "normal",
    subtasks: [
      { name: "Preparar pauta e indicadores", durationMinutes: 60 },
      { name: "Apresentar e registrar decisões", durationMinutes: 90 },
    ],
  },
  {
    name: "Documentação final",
    description:
      "Organização dos arquivos, orientações de uso e histórico da entrega.",
    category: "outro",
    status: "fila",
    priority: "baixa",
    subtasks: [
      { name: "Organizar arquivos finais", durationMinutes: 90 },
      { name: "Documentar orientações de uso", durationMinutes: 90 },
    ],
  },
];

const expectedServiceCounts = [5, 7, 9] as const;
const expectedDeliveryCounts = [15, 17, 19] as const;

function assertExactDistribution(
  values: number[],
  expected: readonly number[],
  label: string,
): void {
  const actual = [...values].sort((left, right) => left - right);
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(
      `A distribuição de ${label} deve ser ${expected.join("/")}.`,
    );
  }
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Os ${label} dos perfis do seed devem ser únicos.`);
  }
}

async function assertPersonalProfile(
  client: PoolClient,
  profile: UserOfferingSeedProfile,
): Promise<void> {
  const username = profile.username.trim();
  if (!username) throw new Error("O username do perfil não pode ficar vazio.");

  const result = await client.query<{ id: string }>(
    `select workspace.id
       from app.workspaces workspace
       inner join app.users seed_user
         on seed_user.id = $1
       inner join app.workspace_members membership
         on membership.workspace_id = workspace.id
        and membership.user_id = seed_user.id
      where workspace.id = $2
        and workspace.kind = 'personal'
        and workspace.name = 'Pessoal'
        and workspace.owner_user_id = seed_user.id
        and membership.role = 'owner'
        and lower(seed_user.username) = lower($3)
      limit 1`,
    [profile.userId, profile.workspaceId, username],
  );
  if (!result.rows[0]) {
    throw new Error(
      `O workspace informado para @${username} não é o workspace pessoal do usuário.`,
    );
  }

  const existing = await client.query<{ services: number; deliveries: number }>(
    `select
       (select count(*)::int from app.services where workspace_id = $1) services,
       (select count(*)::int from app.delivery_templates where workspace_id = $1) deliveries`,
    [profile.workspaceId],
  );
  if (existing.rows[0]?.services || existing.rows[0]?.deliveries) {
    throw new Error(
      `O workspace pessoal de @${username} já possui serviços ou entregas.`,
    );
  }
}

export async function seedUserOfferings(
  client: PoolClient,
  profiles: UserOfferingSeedProfile[],
): Promise<UserOfferingSeedTotals> {
  assertExactDistribution(
    profiles.map(({ serviceCount }) => serviceCount),
    expectedServiceCounts,
    "serviços",
  );
  assertExactDistribution(
    profiles.map(({ deliveryCount }) => deliveryCount),
    expectedDeliveryCounts,
    "entregas",
  );
  assertUnique(
    profiles.map(({ userId }) => userId),
    "IDs de usuário",
  );
  assertUnique(
    profiles.map(({ workspaceId }) => workspaceId),
    "IDs de workspace",
  );
  assertUnique(
    profiles.map(({ username }) => username.trim().toLocaleLowerCase("pt-BR")),
    "usernames",
  );

  const profileTotals: UserOfferingSeedProfileTotals[] = [];

  for (const [profileIndex, profile] of profiles.entries()) {
    await assertPersonalProfile(client, profile);
    const username = profile.username.trim();
    const services: Array<{ id: string; name: string }> = [];

    for (let index = 0; index < profile.serviceCount; index += 1) {
      const definition =
        serviceDefinitions[
          (index + profileIndex * 3) % serviceDefinitions.length
        ]!;
      const service = {
        id: randomUUID(),
        name: `${definition.name} · ${username}`,
      };
      await client.query(
        `insert into app.services (
           id, workspace_id, name, description, default_briefing, icon, color,
           default_status_key, default_duration_days, default_contract_type,
           default_amount_cents, default_installment_count, default_payment_method,
           default_payment_terms, default_finance_notes, sort_order, version
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           $15, $16, 1
         )`,
        [
          service.id,
          profile.workspaceId,
          service.name,
          definition.description,
          `${definition.description} Validar escopo, premissas e aprovações antes do início.`,
          definition.icon,
          definition.color,
          definition.status,
          definition.durationDays,
          definition.contractType,
          definition.amountCents + profileIndex * 25_000,
          definition.installmentCount,
          definition.paymentMethod,
          definition.paymentTerms,
          definition.financeNotes,
          index,
        ],
      );
      await client.query(
        `insert into app.service_responsibles (
           workspace_id, service_id, user_id, sort_order
         ) values ($1, $2, $3, 0)`,
        [profile.workspaceId, service.id, profile.userId],
      );
      services.push(service);
    }

    for (let index = 0; index < profile.deliveryCount; index += 1) {
      const definition =
        deliveryDefinitions[
          (index + profileIndex * 5) % deliveryDefinitions.length
        ]!;
      const service = services[index % services.length]!;
      const deliveryId = randomUUID();
      const totalDuration = definition.subtasks.reduce(
        (total, subtask) => total + subtask.durationMinutes,
        0,
      );
      await client.query(
        `insert into app.delivery_templates (
           id, workspace_id, service_id, name, description, category_key,
           default_status_key, default_priority_key, default_duration_minutes,
           sort_order, version
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1)`,
        [
          deliveryId,
          profile.workspaceId,
          service.id,
          `${definition.name} · ${username}`,
          `${definition.description} Entrega vinculada ao serviço ${service.name}.`,
          definition.category,
          definition.status,
          definition.priority,
          totalDuration,
          index,
        ],
      );
      await client.query(
        `insert into app.delivery_template_responsibles (
           workspace_id, delivery_template_id, user_id, sort_order
         ) values ($1, $2, $3, 0)`,
        [profile.workspaceId, deliveryId, profile.userId],
      );
      for (const [sortOrder, subtask] of definition.subtasks.entries()) {
        await client.query(
          `insert into app.delivery_template_subtasks (
             id, workspace_id, delivery_template_id, name, duration_minutes,
             default_status_key, sort_order
           ) values ($1, $2, $3, $4, $5, 'pendente', $6)`,
          [
            randomUUID(),
            profile.workspaceId,
            deliveryId,
            subtask.name,
            subtask.durationMinutes,
            sortOrder,
          ],
        );
      }
    }

    profileTotals.push({
      userId: profile.userId,
      username,
      workspaceId: profile.workspaceId,
      services: profile.serviceCount,
      deliveries: profile.deliveryCount,
      deliverySubtasks: profile.deliveryCount * 2,
    });
  }

  return profileTotals.reduce<UserOfferingSeedTotals>(
    (totals, profile) => ({
      services: totals.services + profile.services,
      deliveries: totals.deliveries + profile.deliveries,
      deliverySubtasks: totals.deliverySubtasks + profile.deliverySubtasks,
      profiles: [...totals.profiles, profile],
    }),
    { services: 0, deliveries: 0, deliverySubtasks: 0, profiles: [] },
  );
}
