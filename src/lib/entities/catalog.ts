import type { FloatingMenuItem } from "$lib/ui/FloatingMenu.svelte";
import WhatsApp from "$lib/ui/icons/WhatsApp.svelte";
import { defaultSettings } from "$lib/settings/defaults";
import {
  BriefcaseBusiness,
  CalendarDays,
  CircleUserRound,
  FileText,
  Flag,
  FolderKanban,
  Mail,
  ListTodo,
  Tag,
  UsersRound,
} from "@lucide/svelte";
import {
  businessSeeds,
  peopleSeeds,
  projectSeeds,
  taskSeeds,
} from "./seed-data";
import type { EntityConfig, EntityFieldOption } from "./types";

const businessCategoryTones: NonNullable<EntityFieldOption["tone"]>[] = [
  "blue",
  "green",
  "amber",
  "gray",
];
const businessStatusTones: NonNullable<EntityFieldOption["tone"]>[] = [
  "blue",
  "green",
  "amber",
  "red",
  "gray",
];
const businessCategoryOptions: EntityFieldOption[] =
  defaultSettings.businessCategories.map(({ key, label }, index) => ({
    value: key,
    label,
    tone: businessCategoryTones[index] ?? "gray",
  }));
const businessStatusOptions: EntityFieldOption[] =
  defaultSettings.businessStatuses.map(({ key, label }, index) => ({
    value: key,
    label,
    tone: businessStatusTones[index] ?? "gray",
  }));
const projectStatusTones: NonNullable<EntityFieldOption["tone"]>[] = [
  "gray",
  "blue",
  "amber",
  "green",
  "gray",
];
const projectStatusOptions: EntityFieldOption[] =
  defaultSettings.projectStatuses.map(({ key, label }, index) => ({
    value: key,
    label,
    tone: projectStatusTones[index] ?? "gray",
  }));

export const peopleConfig: EntityConfig = {
  key: "pessoas",
  singular: "pessoa",
  plural: "Pessoas",
  description: "Centralize clientes, parceiros e integrantes da equipe.",
  icon: UsersRound,
  formSectionTitle: "Pessoa",
  createTitle: "Nova pessoa",
  editTitle: "Editar pessoa",
  createAction: "Criar pessoa",
  fields: [
    {
      name: "nome",
      label: "Nome",
      type: "text",
      icon: CircleUserRound,
      required: true,
      table: true,
      placeholder: "Nome",
    },
    {
      name: "tipo",
      label: "Status",
      type: "select",
      icon: Flag,
      required: true,
      table: true,
      options: [
        { value: "lead", label: "Lead", tone: "blue" },
        { value: "prospecto", label: "Prospecto", tone: "amber" },
        { value: "ativo", label: "Ativo", tone: "green" },
        { value: "desativado", label: "Desativado", tone: "gray" },
        { value: "arquivado", label: "Arquivado", tone: "gray" },
      ],
    },
    {
      name: "cargo",
      label: "Profissão",
      type: "text",
      icon: BriefcaseBusiness,
      placeholder: "Profissão",
    },
    {
      name: "telefone",
      label: "Telefone",
      type: "tel",
      icon: WhatsApp,
      table: true,
      half: true,
      placeholder: "88 9 0000.0000",
    },
    {
      name: "email",
      label: "E-mail",
      type: "email",
      icon: Mail,
      table: true,
      half: true,
      placeholder: "nome@exemplo.com.br",
    },
    {
      name: "observacoes",
      label: "Bio",
      type: "textarea",
      icon: FileText,
      placeholder: "Bio",
    },
  ],
  seeds: peopleSeeds,
};

export const businessConfig: EntityConfig = {
  key: "negocios",
  singular: "negócio",
  plural: "Negócios",
  description: "Acompanhe oportunidades comerciais da pessoa ao fechamento.",
  icon: BriefcaseBusiness,
  formSectionTitle: "Negócio",
  createTitle: "Novo negócio",
  editTitle: "Editar negócio",
  createAction: "Criar negócio",
  fields: [
    {
      name: "nome",
      label: "Negócio",
      type: "text",
      icon: BriefcaseBusiness,
      required: true,
      table: true,
      placeholder: "Nome do negócio",
    },
    {
      name: "responsaveis",
      label: "Responsáveis",
      type: "people",
      icon: UsersRound,
      required: true,
      table: true,
      placeholder: "Selecione uma pessoa ou usuário",
    },
    {
      name: "categoria",
      label: "Categoria",
      type: "select",
      icon: Tag,
      required: true,
      table: true,
      options: businessCategoryOptions,
    },
    {
      name: "etapa",
      label: "Status",
      type: "select",
      icon: Flag,
      required: true,
      table: true,
      options: businessStatusOptions,
    },
    {
      name: "observacoes",
      label: "Resumo do cliente",
      type: "textarea",
      icon: FileText,
      placeholder: "Resumo do cliente",
    },
  ],
  seeds: businessSeeds,
};

export const contractConfig: EntityConfig = {
  key: "contratos",
  singular: "contrato",
  plural: "Contratos",
  description: "Centralize valores, parcelas e condições comerciais de cada negócio.",
  icon: FileText,
  formSectionTitle: "Contrato",
  createTitle: "Novo contrato",
  editTitle: "Editar contrato",
  createAction: "Criar contrato",
  fields: [
    { name: "nome", label: "Contrato", type: "text", icon: FileText, required: true, table: true, placeholder: "Nome do contrato" },
    { name: "negocio", label: "Negócio", type: "text", icon: BriefcaseBusiness, required: true, table: true, placeholder: "Negócio vinculado" },
    { name: "valor", label: "Valor", type: "number", icon: BriefcaseBusiness, min: "0", step: "0.01", format: "currency", placeholder: "Valor" },
    { name: "primeiroVencimento", label: "Primeiro vencimento", type: "date", icon: CalendarDays, format: "date", half: true },
    { name: "condicoes", label: "Condições", type: "textarea", icon: FileText, placeholder: "Condições de pagamento" },
  ],
  seeds: [],
};

export const projectConfig: EntityConfig = {
  key: "projetos",
  singular: "projeto",
  plural: "Projetos",
  description:
    "Organize escopo, entregas e datas de entrega dos trabalhos ativos.",
  icon: FolderKanban,
  formSectionTitle: "Sobre",
  createTitle: "Novo projeto",
  editTitle: "Editar projeto",
  createAction: "Criar projeto",
  fields: [
    {
      name: "nome",
      label: "Projeto",
      type: "text",
      icon: FolderKanban,
      required: true,
      table: true,
      placeholder: "Nome do projeto",
    },
    {
      name: "contractName",
      label: "Contrato",
      type: "text",
      icon: FileText,
      required: true,
      table: true,
      placeholder: "Selecione o contrato",
    },
    {
      name: "negocio",
      label: "Negócio",
      type: "text",
      icon: BriefcaseBusiness,
      table: true,
      placeholder: "Negócio vinculado",
    },
    {
      name: "servicos",
      label: "Serviço",
      type: "text",
      icon: Tag,
      placeholder: "Digite para buscar serviço",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      icon: Flag,
      required: true,
      table: true,
      options: projectStatusOptions,
    },
    {
      name: "dataInicio",
      label: "Data de início",
      type: "date",
      icon: CalendarDays,
      format: "date",
      half: true,
      placeholder: "Data de início",
    },
    {
      name: "dataFim",
      label: "Data de fim",
      type: "date",
      icon: CalendarDays,
      table: true,
      format: "date",
      half: true,
      placeholder: "Data de fim",
    },
    {
      name: "briefing",
      label: "Briefing",
      type: "textarea",
      icon: FileText,
      placeholder: "Briefing",
    },
    {
      name: "tags",
      label: "Tags",
      type: "text",
      icon: Tag,
      placeholder: "Tags",
    },
  ],
  seeds: projectSeeds,
};

export const deliveryConfig: EntityConfig = {
  key: "entregas",
  singular: "entrega",
  plural: "Entregas",
  description: "Organize entregas, prioridades e tarefas dos projetos.",
  icon: ListTodo,
  formSectionTitle: "Entrega",
  createTitle: "Nova entrega",
  editTitle: "Editar entrega",
  createAction: "Criar entrega",
  fields: [
    {
      name: "nome",
      label: "Nome",
      type: "text",
      icon: ListTodo,
      required: true,
      table: true,
      placeholder: "Nome da entrega",
    },
    {
      name: "negocio",
      label: "Negócio",
      type: "text",
      icon: BriefcaseBusiness,
      placeholder: "Negócio",
    },
    {
      name: "projeto",
      label: "Projeto",
      type: "text",
      icon: FolderKanban,
      table: true,
      placeholder: "Projeto",
    },
    {
      name: "categoria",
      label: "Categoria",
      type: "select",
      icon: ListTodo,
      options: [
        { value: "", label: "Categoria", tone: "gray" },
        { value: "reuniao", label: "Reunião", tone: "blue" },
        { value: "planejamento", label: "Planejamento", tone: "green" },
        { value: "criacao", label: "Criação", tone: "amber" },
        { value: "escrita", label: "Escrita", tone: "violet" },
        { value: "veiculacao", label: "Veiculação", tone: "red" },
        { value: "outro", label: "Outros", tone: "gray" },
      ],
    },
    {
      name: "prioridade",
      label: "Prioridade",
      type: "select",
      icon: Flag,
      options: [
        { value: "baixa", label: "Baixa", tone: "gray" },
        { value: "normal", label: "Normal", tone: "blue" },
        { value: "alta", label: "Alta", tone: "amber" },
        { value: "emergente", label: "Emergente", tone: "red" },
        { value: "urgente", label: "Urgente", tone: "red" },
      ],
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      icon: Flag,
      required: true,
      table: true,
      options: [
        { value: "planejamento", label: "Fila", tone: "gray" },
        { value: "fila", label: "A fazer", tone: "blue" },
        { value: "producao", label: "Fazendo", tone: "amber" },
        { value: "conclusao", label: "Feito", tone: "green" },
        { value: "arquivado", label: "Arquivado", tone: "gray" },
      ],
    },
    {
      name: "descricao",
      label: "Briefing",
      type: "textarea",
      icon: FileText,
      placeholder: "Briefing",
    },
  ],
  seeds: taskSeeds,
};

export const entityConfigs = {
  pessoas: peopleConfig,
  negocios: businessConfig,
  contratos: contractConfig,
  projetos: projectConfig,
  entregas: deliveryConfig,
};

export const createMenuItems: FloatingMenuItem[] = [
  {
    id: "contratos",
    label: "Contratos",
    description: "Valores, parcelas e condições comerciais",
    icon: FileText,
  },
  {
    id: "projetos",
    label: "Projetos",
    description: "Escopo, contrato e prazos",
    icon: FolderKanban,
  },
  {
    id: "entregas",
    label: "Entregas",
    description: "Entregas, prioridades e tarefas",
    icon: ListTodo,
  },
];

