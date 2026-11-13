import type { Business } from "$lib/businesses/types";
import type { Contact } from "$lib/contacts/types";
import type { Project } from "$lib/projects/types";
import type { Task } from "$lib/tasks/types";
import type { EntityCardKind } from "$lib/ui/entity-card";

export type RecordDetailField = { label: string; value: string };
export type RecordDetailSection = {
  title: string;
  fields: RecordDetailField[];
};
export type RecordDetail = {
  id: string;
  kind: EntityCardKind;
  typeLabel: string;
  title: string;
  status: string;
  archived: boolean;
  updatedAt: string;
  fields: RecordDetailField[];
  sections: RecordDetailSection[];
};

function text(
  value: string | null | undefined,
  fallback = "Não informado",
): string {
  return value?.trim() || fallback;
}

function list(values: string[], fallback = "Não informado"): string {
  return values.filter(Boolean).join(", ") || fallback;
}

function date(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed);
}

export function contactDetail(contact: Contact): RecordDetail {
  return {
    id: contact.id,
    kind: "pessoa",
    typeLabel: "Contato",
    title: contact.name,
    status: contact.archivedAt ? "Arquivado" : contact.status,
    archived: Boolean(contact.archivedAt),
    updatedAt: date(contact.updatedAt),
    fields: [
      { label: "Profissão", value: text(contact.profession) },
      { label: "Tipo", value: contact.contactType },
    ],
    sections: [
      {
        title: "Canais de contato",
        fields: [
          {
            label: "Telefones",
            value: list(contact.phones.map(({ value }) => value)),
          },
          {
            label: "E-mails",
            value: list(contact.emails.map(({ value }) => value)),
          },
        ],
      },
      {
        title: "Notas",
        fields: [
          {
            label: "Observações",
            value: list(contact.notes.map(({ body }) => body)),
          },
        ],
      },
    ],
  };
}

export function businessDetail(business: Business): RecordDetail {
  return {
    id: business.id,
    kind: "negocio",
    typeLabel: "Negócio",
    title: business.name,
    status: business.archivedAt ? "Arquivado" : business.stage,
    archived: Boolean(business.archivedAt),
    updatedAt: date(business.updatedAt),
    fields: [{ label: "Categoria", value: text(business.category) }],
    sections: [
      {
        title: "Responsáveis",
        fields: [
          {
            label: "Pessoas",
            value: list(business.responsibles.map(({ name }) => name)),
          },
        ],
      },
      {
        title: "Notas",
        fields: [
          {
            label: "Observações",
            value: list(business.notes.map(({ body }) => body)),
          },
        ],
      },
    ],
  };
}

export function projectDetail(project: Project): RecordDetail {
  return {
    id: project.id,
    kind: "projeto",
    typeLabel: "Projeto",
    title: project.name,
    status: project.archivedAt ? "Arquivado" : project.status,
    archived: Boolean(project.archivedAt),
    updatedAt: date(project.updatedAt),
    fields: [
      { label: "Negócio", value: project.business.name },
      { label: "Início", value: date(project.startDate) },
      { label: "Conclusão", value: date(project.endDate) },
      {
        label: "Contrato",
        value: project.contractType === "recurring" ? "Recorrente" : "Pontual",
      },
      { label: "Exibição", value: project.isActive ? "On" : "Off" },
    ],
    sections: [
      {
        title: "Execução",
        fields: [
          {
            label: "Serviços",
            value: list(project.services.map(({ name }) => name)),
          },
          {
            label: "Responsáveis",
            value: list(project.responsibles.map(({ name }) => name)),
          },
          { label: "Tags", value: list(project.tags.map(({ name }) => name)) },
          { label: "Briefing", value: text(project.briefing) },
        ],
      },
    ],
  };
}

export function taskDetail(task: Task): RecordDetail {
  return {
    id: task.id,
    kind: "tarefa",
    typeLabel: "Tarefa",
    title: task.name,
    status: task.archivedAt ? "Arquivado" : task.status,
    archived: Boolean(task.archivedAt),
    updatedAt: date(task.updatedAt),
    fields: [
      { label: "Negócio", value: task.business.name },
      { label: "Projeto", value: task.project.name },
      { label: "Prazo", value: date(task.dueDate) },
      { label: "Prioridade", value: text(task.priority) },
      { label: "Categoria", value: text(task.category) },
    ],
    sections: [
      {
        title: "Execução",
        fields: [
          {
            label: "Responsáveis",
            value: list(task.responsibles.map(({ name }) => name)),
          },
          { label: "Tags", value: list(task.tags.map(({ name }) => name)) },
          { label: "Briefing", value: text(task.briefing) },
        ],
      },
      {
        title: "Subtarefas",
        fields: [
          {
            label: "Itens",
            value: list(
              task.subtasks.map(({ name, status }) => `${name} (${status})`),
              "Nenhuma subtask",
            ),
          },
        ],
      },
    ],
  };
}
