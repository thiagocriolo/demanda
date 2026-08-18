import type {
  PersonalSettingsState,
  SettingsState,
  StyledChoice,
  WorkspaceSettingsState,
} from "./types";
import { workspaceSettingsKeys } from "./types";
import {
  DEFAULT_AVATAR_COLOR,
  DEFAULT_AVATAR_ID,
} from "../avatar/avatar-options";

const colors = ["#2E56FF", "#5DAC83", "#F59E0B", "#EF4444", "#64748B"];

function statuses(items: [string, string, string][]): StyledChoice[] {
  return items.map(([key, label, icon], index) => ({
    key,
    label,
    icon,
    color: colors[index] ?? colors[0],
  }));
}

export const defaultSettings: SettingsState = {
  startPage: "dashboard",
  rememberLastTab: true,
  autoSaveFilters: true,
  theme: "light",
  interfaceDensity: "default",
  sidebarDefault: "expanded",
  interfaceAnimations: true,
  compactHeaders: false,
  primaryColor: "#2E56FF",
  secondaryColor: "#5DAC83",
  customPalette: [],
  fontFamily: "pogonia",
  fontScale: 100,
  dashboardDefaultPeriod: "week",
  dashboardShowMetrics: true,
  dashboardShowTodaySchedule: true,
  dashboardShowWorkload: true,
  dashboardShowRecentActivity: true,
  workspaceOrderBy: "active",
  workspaceShowInactive: true,
  workspaceShowProjectPreviews: true,
  workspaceShowCollaborators: true,
  workspaceIncludeArchivedProjects: false,
  recordsDefaultTab: "pessoas",
  recordsOrderBy: "updated",
  recordsShowArchived: false,
  recordsCardLevel: 5,
  defaultTaskDuration: "1",
  pautaScope: "assigned",
  pautaGroupBy: "status",
  pautaOrderBy: "priority",
  pautaShowDone: false,
  pautaShowArchived: false,
  pautaShowCardDetails: true,
  agendaDefaultView: "week",
  agendaDefaultMode: "projects",
  agendaDrawerDefault: "collapsed",
  agendaShowWeekends: true,
  agendaRememberLastView: true,
  cronogramaDefaultView: "week",
  cronogramaDrawerDefault: "collapsed",
  cronogramaDays: "saturday",
  cronogramaShowCurrentTime: true,
  workdayShifts: [
    { start: "08:00", end: "12:00" },
    { start: "14:00", end: "18:00" },
  ],
  taskReminderMinutes: "30",
  notifyTaskReminders: false,
  financeDefaultTab: "painel",
  financeInitialPeriod: "current",
  financePlanningMonths: "3",
  financeShowSettled: true,
  financeShowPaused: true,
  financeShowDashboardValues: true,
  language: "pt-BR",
  timezone: "America/Fortaleza",
  dateFormat: "d.m.Y",
  timeFormat: "24h",
  weekStart: "monday",
  profile: {
    photo: "",
    cover: "",
    avatarImage: DEFAULT_AVATAR_ID,
    avatarColor: DEFAULT_AVATAR_COLOR,
    username: "thiago",
    name: "Thiago",
    profession: "Administrador",
    email: "",
    phone: "",
    bio: "",
  },
  statusColors: colors,
  personStatuses: statuses([
    ["lead", "Lead", "user-plus"],
    ["prospecto", "Prospecto", "target"],
    ["ativo", "Cliente", "check"],
    ["desativado", "Desativado", "ban"],
    ["arquivado", "Arquivado", "archive"],
  ]),
  businessStatuses: statuses([
    ["negociacao", "Negociação", "messages-square"],
    ["contratacao", "Contratação", "file-check-2"],
    ["ativo", "Ativado", "play"],
    ["encerrado", "Encerrado", "circle-stop"],
    ["arquivado", "Arquivado", "archive-x"],
  ]),
  projectStatuses: statuses([
    ["planejamento", "Planejamento", "sparkles"],
    ["execucao", "Execução", "rocket"],
    ["alteracao", "Desdobramentos", "git-branch"],
    ["concluido", "Conclusão", "check-check"],
    ["arquivado", "Arquivado", "folder-archive"],
  ]),
  taskStatuses: statuses([
    ["planejamento", "Fila", "clipboard-list"],
    ["fila", "A fazer", "list-todo"],
    ["producao", "Fazendo", "loader-circle"],
    ["conclusao", "Feito", "circle-check-big"],
    ["arquivado", "Arquivado", "archive-restore"],
  ]),
  businessCategories: [
    {
      key: "marca_pessoal",
      label: "Marca pessoal",
      icon: "user-round",
      color: "#2E56FF",
    },
    {
      key: "negocio",
      label: "Empreendimento",
      icon: "building-2",
      color: "#5DAC83",
    },
    {
      key: "projeto_alternativo",
      label: "Projeto alternativo",
      icon: "lightbulb",
      color: "#F59E0B",
    },
    { key: "outro", label: "Outros", icon: "tag", color: "#64748B" },
  ],
  taskCategories: [
    { key: "reuniao", label: "Reunião", icon: "users-round", color: "#2E56FF" },
    {
      key: "planejamento",
      label: "Planejamento",
      icon: "clipboard-list",
      color: "#5DAC83",
    },
    { key: "criacao", label: "Criação", icon: "palette", color: "#F59E0B" },
    { key: "escrita", label: "Escrita", icon: "pen-line", color: "#8B5CF6" },
    {
      key: "veiculacao",
      label: "Veiculação",
      icon: "megaphone",
      color: "#EC4899",
    },
    { key: "outro", label: "Outros", icon: "tag", color: "#64748B" },
  ],
  taskPriorities: [
    { key: "baixa", label: "Baixa" },
    { key: "normal", label: "Normal" },
    { key: "alta", label: "Alta" },
    { key: "emergente", label: "Emergente" },
    { key: "urgente", label: "Urgente" },
  ],
  tags: [],
  revenueCategories: [
    {
      key: "contratos",
      label: "Contratos",
      icon: "file-text",
      color: "#2E56FF",
    },
    {
      key: "alteracoes",
      label: "Alterações",
      icon: "file-pen-line",
      color: "#5DAC83",
    },
    { key: "fees", label: "Fees", icon: "hand-coins", color: "#8B5CF6" },
    {
      key: "bonus",
      label: "Bônus",
      icon: "badge-dollar-sign",
      color: "#F59E0B",
    },
    { key: "outros", label: "Outros", icon: "wallet", color: "#64748B" },
  ],
  expenseCategories: [
    { key: "impostos", label: "Impostos", icon: "scale", color: "#EF4444" },
    {
      key: "ferramentas",
      label: "Ferramentas",
      icon: "wrench",
      color: "#8B5CF6",
    },
    {
      key: "assinaturas",
      label: "Assinaturas",
      icon: "credit-card",
      color: "#0EA5E9",
    },
    { key: "recursos", label: "Recursos", icon: "package", color: "#F97316" },
    { key: "outros", label: "Outros", icon: "receipt-text", color: "#64748B" },
  ],
  templateGalleryVersion: 1,
  services: [],
  serviceTemplates: [
    {
      id: "modelo-servico-identidade-visual",
      name: "Identidade visual completa",
      icon: "palette",
      color: "violet",
      briefing:
        "Estratégia, conceito e sistema visual para consolidar uma marca reconhecível e consistente.",
      tags: "branding, identidade visual",
      status: "execucao",
      responsible: "Marina Costa",
      duration: "30",
      contractType: "Projeto fechado",
      amount: "12500",
      installments: "3",
      paymentMethod: "Pix ou transferência",
      paymentTerms: "40% na entrada, 30% na aprovação e 30% na entrega",
      financeNotes: "Inclui duas rodadas de ajustes por etapa.",
      tasks: [
        {
          id: "tarefa-identidade-imersao",
          templateId: "modelo-entrega-imersao-estrategica",
          name: "Imersão e briefing estratégico",
        },
        {
          id: "tarefa-identidade-rotas",
          templateId: "modelo-entrega-rotas-criativas",
          name: "Apresentação das rotas criativas",
        },
      ],
    },
    {
      id: "modelo-servico-lancamento-digital",
      name: "Lançamento de produto digital",
      icon: "rocket",
      color: "blue",
      briefing:
        "Planejamento e produção dos principais pontos de contato para uma campanha de lançamento.",
      tags: "lançamento, campanha",
      status: "planejamento",
      responsible: "Lucas Andrade",
      duration: "20",
      contractType: "Escopo por campanha",
      amount: "8900",
      installments: "2",
      paymentMethod: "Boleto ou Pix",
      paymentTerms: "50% na contratação e 50% antes da publicação",
      financeNotes:
        "Mídia paga e desenvolvimento avançado são orçados separadamente.",
      tasks: [
        {
          id: "tarefa-lancamento-landing-page",
          templateId: "modelo-entrega-landing-page",
          name: "Landing page de lançamento",
        },
      ],
    },
    {
      id: "modelo-servico-conteudo-mensal",
      name: "Conteúdo para redes sociais",
      icon: "megaphone",
      color: "pink",
      briefing:
        "Operação mensal de pauta, criação e acompanhamento de conteúdo para canais sociais.",
      tags: "conteúdo, redes sociais",
      status: "alteracao",
      responsible: "Camila Rocha",
      duration: "15",
      contractType: "Recorrência mensal",
      amount: "4200",
      installments: "1",
      paymentMethod: "Transferência",
      paymentTerms: "Vencimento no quinto dia útil de cada mês",
      financeNotes: "Captação externa e impulsionamento não estão incluídos.",
      tasks: [
        {
          id: "tarefa-conteudo-calendario",
          templateId: "modelo-entrega-calendario-editorial",
          name: "Calendário editorial mensal",
        },
        {
          id: "tarefa-conteudo-relatorio",
          templateId: "modelo-entrega-relatorio-desempenho",
          name: "Relatório de desempenho",
        },
      ],
    },
  ],
  deliveryTemplates: [
    {
      id: "modelo-entrega-imersao-estrategica",
      projectTemplateId: "",
      name: "Imersão e briefing estratégico",
      category: "planejamento",
      briefing:
        "Conduzir a imersão inicial e consolidar objetivos, público, referências e diferenciais.",
      subtasks: [],
      status: "planejamento",
      priority: "alta",
      tags: "briefing, estratégia",
      responsible: "Marina Costa",
      duration: "6",
    },
    {
      id: "modelo-entrega-rotas-criativas",
      projectTemplateId: "",
      name: "Apresentação das rotas criativas",
      category: "criacao",
      briefing:
        "Preparar as alternativas conceituais com racional, aplicações e recomendação de direção.",
      subtasks: [],
      status: "producao",
      priority: "emergente",
      tags: "direção criativa, apresentação",
      responsible: "Marina Costa",
      duration: "12",
    },
    {
      id: "modelo-entrega-landing-page",
      projectTemplateId: "",
      name: "Landing page de lançamento",
      category: "criacao",
      briefing:
        "Estruturar conteúdo, interface e chamada para ação da página principal da campanha.",
      subtasks: [],
      status: "fila",
      priority: "alta",
      tags: "landing page, conversão",
      responsible: "Lucas Andrade",
      duration: "8",
    },
    {
      id: "modelo-entrega-calendario-editorial",
      projectTemplateId: "",
      name: "Calendário editorial mensal",
      category: "planejamento",
      briefing:
        "Distribuir temas e formatos no mês, considerando datas relevantes e objetivos dos canais.",
      subtasks: [],
      status: "producao",
      priority: "normal",
      tags: "conteúdo, calendário",
      responsible: "Camila Rocha",
      duration: "6",
    },
    {
      id: "modelo-entrega-relatorio-desempenho",
      projectTemplateId: "",
      name: "Relatório de desempenho",
      category: "outro",
      briefing:
        "Apresentar indicadores, conteúdos de destaque e recomendações para o próximo ciclo.",
      subtasks: [],
      status: "conclusao",
      priority: "baixa",
      tags: "métricas, relatório",
      responsible: "Camila Rocha",
      duration: "4",
    },
  ],
};

export function freshSettings(): SettingsState {
  return structuredClone(defaultSettings);
}

export function defaultWorkspaceSettings(): WorkspaceSettingsState {
  return workspaceSettingsFromState(defaultSettings);
}

export function defaultPersonalSettings(): PersonalSettingsState {
  return personalSettingsFromState(defaultSettings);
}

export function workspaceSettingsFromState(
  settings: SettingsState,
): WorkspaceSettingsState {
  return Object.fromEntries(
    workspaceSettingsKeys.map((key) => [key, structuredClone(settings[key])]),
  ) as WorkspaceSettingsState;
}

export function personalSettingsFromState(
  settings: SettingsState,
): PersonalSettingsState {
  const shared = new Set<string>(workspaceSettingsKeys);
  return Object.fromEntries(
    Object.entries(settings)
      .filter(([key]) => !shared.has(key))
      .map(([key, value]) => [key, structuredClone(value)]),
  ) as PersonalSettingsState;
}

export function mergeSettingsScopes(
  personal: PersonalSettingsState,
  workspace: WorkspaceSettingsState,
): SettingsState {
  return {
    ...freshSettings(),
    ...structuredClone(personal),
    ...structuredClone(workspace),
  };
}
