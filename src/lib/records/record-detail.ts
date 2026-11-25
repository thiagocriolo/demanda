import type { Business } from "$lib/businesses/types";
import type { Contact } from "$lib/contacts/types";
import type { Project } from "$lib/projects/types";
import type { Delivery } from "$lib/deliveries/types";
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
    typeLabel: "Pessoa",
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
        title: "Canais da pessoa",
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

export function contractDetail(contract: {
  id: string;
  name: string;
  businessName: string;
  amountCents: number;
  firstDueDate: string | null;
  paymentMethod: string | null;
  paymentTerms: string | null;
  financeNotes: string | null;
  archivedAt: Date | null;
  updatedAt: Date;
}): RecordDetail {
  return {
    id: contract.id,
    kind: "contrato",
    typeLabel: "Contrato",
    title: contract.name,
    status: contract.archivedAt ? "Arquivado" : "Ativo",
    archived: Boolean(contract.archivedAt),
    updatedAt: date(contract.updatedAt.toISOString()),
    fields: [
      { label: "Negócio", value: contract.businessName },
      {
        label: "Valor",
        value: (contract.amountCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
      },
      { label: "Primeiro vencimento", value: date(contract.firstDueDate) },
      { label: "Forma de pagamento", value: text(contract.paymentMethod) },
    ],
    sections: [
      {
        title: "Financeiro",
        fields: [
          { label: "Condições", value: text(contract.paymentTerms) },
          { label: "Observações", value: text(contract.financeNotes) },
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
      { label: "Contrato", value: text(project.contract?.name) },
      { label: "Negócio", value: project.business.name },
      {
        label: "Frequência",
        value: project.contractType === "recurring" ? "Recorrente" : "Pontual",
      },
      { label: "Início", value: date(project.startDate) },
      { label: "Conclusão", value: date(project.endDate) },
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
          { label: "Tags", value: list(project.tags.map(({ name }) => name)) },
          { label: "Briefing", value: text(project.briefing) },
        ],
      },
    ],
  };
}

export function deliveryDetail(delivery: Delivery): RecordDetail {
  return {
    id: delivery.id,
    kind: "entrega",
    typeLabel: "Entrega",
    title: delivery.name,
    status: delivery.archivedAt ? "Arquivado" : delivery.status,
    archived: Boolean(delivery.archivedAt),
    updatedAt: date(delivery.updatedAt),
    fields: [
      { label: "Negócio", value: delivery.business.name },
      { label: "Projeto", value: delivery.project.name },
      { label: "Prazo", value: date(delivery.dueDate) },
      { label: "Prioridade", value: text(delivery.priority) },
      { label: "Categoria", value: text(delivery.category) },
    ],
    sections: [
      {
        title: "Execução",
        fields: [
          {
            label: "Responsáveis",
            value: list(delivery.responsibles.map(({ name }) => name)),
          },
          { label: "Tags", value: list(delivery.tags.map(({ name }) => name)) },
          { label: "Briefing", value: text(delivery.briefing) },
        ],
      },
      {
        title: "Entregas",
        fields: [
          {
            label: "Itens",
            value: list(
              delivery.tasks.map(({ name, status }) => `${name} (${status})`),
              "Nenhuma task",
            ),
          },
        ],
      },
    ],
  };
}
