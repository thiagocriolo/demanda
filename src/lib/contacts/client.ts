import type { EntityRecord } from "../entities/types";
import { formatBrazilianMobilePhone } from "../entities/contact-format";
import type {
  Contact,
  ContactEmailInput,
  ContactList,
  ContactMutationInput,
  ContactNoteInput,
  ContactPhoneInput,
  ContactStatus,
} from "./types";

export const CONTACTS_CHANGED_EVENT = "demanda:contacts-changed";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ContactApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ContactApiError";
  }
}

async function requestJson<T>(
  fetcher: FetchLike,
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    let message = "Não foi possível concluir a operação com o contato.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // A mensagem pública genérica também cobre respostas sem JSON.
    }
    throw new ContactApiError(response.status, message);
  }
  return (await response.json()) as T;
}

function jsonRequest(method: "POST" | "PUT", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export type ContactListOptions = {
  page?: number;
  pageSize?: number;
  query?: string;
  status?: ContactStatus;
  orderBy?: "updated" | "name_asc" | "name_desc";
  archived?: "exclude" | "include" | "only";
  includeArchived?: boolean;
  signal?: AbortSignal;
};

async function listUserContacts(
  options: ContactListOptions = {},
  fetcher: FetchLike = fetch,
): Promise<ContactList> {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 50),
  });
  if (options.query?.trim()) params.set("query", options.query.trim());
  if (options.status) params.set("status", options.status);
  if (options.orderBy) params.set("orderBy", options.orderBy);
  params.set(
    "archived",
    options.archived ?? (options.includeArchived ? "include" : "exclude"),
  );
  return requestJson<ContactList>(fetcher, `/api/contacts?${params}`, {
    signal: options.signal,
  });
}

export async function listContacts(
  options: ContactListOptions = {},
  fetcher: FetchLike = fetch,
): Promise<ContactList> {
  return listUserContacts(options, fetcher);
}

export async function listAllActiveContacts(
  options: {
    query?: string;
    orderBy?: "updated" | "name_asc" | "name_desc";
    signal?: AbortSignal;
  } = {},
  fetcher: FetchLike = fetch,
): Promise<Contact[]> {
  const first = await listContacts(
    { ...options, page: 1, pageSize: 100, archived: "exclude" },
    fetcher,
  );
  const workspaceId = first.workspaceId;
  const ownerUserId = first.ownerUserId;
  const contacts: Contact[] = [];
  const seen = new Set<string>();
  const append = (result: ContactList): void => {
    if (
      result.workspaceId !== workspaceId ||
      result.ownerUserId !== ownerUserId ||
      result.items.some(
        (contact) =>
          contact.workspaceId !== workspaceId ||
          contact.ownerUserId !== ownerUserId,
      )
    ) {
      throw new ContactApiError(
        409,
        "O escopo do usuário mudou durante o carregamento dos contatos. Tente novamente.",
      );
    }
    for (const contact of result.items) {
      if (seen.has(contact.id)) continue;
      seen.add(contact.id);
      contacts.push(contact);
    }
  };
  append(first);
  for (let page = 2; page <= first.totalPages; page += 1) {
    const result = await listContacts(
      { ...options, page, pageSize: 100, archived: "exclude" },
      fetcher,
    );
    append(result);
  }
  return contacts;
}

export function getContact(
  contactId: string,
  fetcher: FetchLike = fetch,
): Promise<Contact> {
  return requestJson<Contact>(
    fetcher,
    `/api/contacts/${encodeURIComponent(contactId)}`,
  );
}

export async function createContact(
  input: ContactMutationInput,
  fetcher: FetchLike = fetch,
): Promise<Contact> {
  const contact = await requestJson<Contact>(
    fetcher,
    "/api/contacts",
    jsonRequest("POST", input),
  );
  notifyContactsChanged();
  return contact;
}

export async function updateContact(
  contactId: string,
  input: ContactMutationInput,
  fetcher: FetchLike = fetch,
): Promise<Contact> {
  const contact = await requestJson<Contact>(
    fetcher,
    `/api/contacts/${encodeURIComponent(contactId)}`,
    jsonRequest("PUT", input),
  );
  notifyContactsChanged();
  return contact;
}

export async function archiveContact(
  contactId: string,
  fetcher: FetchLike = fetch,
): Promise<void> {
  await requestJson<{ archived: true }>(
    fetcher,
    `/api/contacts/${encodeURIComponent(contactId)}`,
    { method: "PATCH" },
  );
  notifyContactsChanged();
}

export async function deleteContact(
  contactId: string,
  fetcher: FetchLike = fetch,
): Promise<void> {
  await requestJson<{ deleted: true }>(
    fetcher,
    `/api/contacts/${encodeURIComponent(contactId)}`,
    { method: "DELETE" },
  );
  notifyContactsChanged();
}

function notifyContactsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONTACTS_CHANGED_EVENT));
}

export function observeContacts(onchange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CONTACTS_CHANGED_EVENT, onchange);
  return () => window.removeEventListener(CONTACTS_CHANGED_EVENT, onchange);
}

const statusToLegacy: Record<ContactStatus, string> = {
  lead: "lead",
  prospect: "prospecto",
  active: "ativo",
  inactive: "desativado",
};

const legacyToStatus: Record<string, ContactStatus> = {
  lead: "lead",
  prospect: "prospect",
  prospecto: "prospect",
  active: "active",
  ativo: "active",
  inactive: "inactive",
  desativado: "inactive",
  arquivado: "inactive",
};

function primaryValue<T extends { value: string; isPrimary: boolean }>(
  values: T[],
): string {
  return (
    values.find((value) => value.isPrimary)?.value ?? values[0]?.value ?? ""
  );
}

function displayPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const national =
    digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  return national.length === 11 ? formatBrazilianMobilePhone(national) : value;
}

const CONTACT_PHONES_FIELD = "__contactPhones";
const CONTACT_EMAILS_FIELD = "__contactEmails";
const CONTACT_NOTES_FIELD = "__contactNotes";

function serializedValues<T>(value: string | undefined): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function phoneInputs(contact: Contact): ContactPhoneInput[] {
  return contact.phones.map(({ type, label, value, isPrimary }) => ({
    type,
    label,
    value,
    isPrimary,
  }));
}

function emailInputs(contact: Contact): ContactEmailInput[] {
  return contact.emails.map(({ type, label, value, isPrimary }) => ({
    type,
    label,
    value,
    isPrimary,
  }));
}

function noteInputs(contact: Contact): ContactNoteInput[] {
  return contact.notes.map(({ body }) => ({ body }));
}

function ensureOnePrimary<T extends { isPrimary: boolean }>(values: T[]): T[] {
  if (!values.length) return values;
  const selected = values.findIndex(({ isPrimary }) => isPrimary);
  const primaryIndex = selected >= 0 ? selected : 0;
  return values.map((value, index) => ({
    ...value,
    isPrimary: index === primaryIndex,
  }));
}

function replaceVisibleEndpoint<
  T extends { value: string; isPrimary: boolean },
>(
  stored: T[],
  displayedBefore: string,
  displayedAfter: string,
  create: (value: string) => T,
): T[] {
  if (displayedAfter === displayedBefore) return stored;

  const currentIndex = stored.findIndex(({ isPrimary }) => isPrimary);
  const visibleIndex =
    currentIndex >= 0 ? currentIndex : stored.length ? 0 : -1;
  const next = stored.map((value) => ({ ...value }));

  if (!displayedAfter) {
    if (visibleIndex >= 0) next.splice(visibleIndex, 1);
    return ensureOnePrimary(next);
  }

  if (visibleIndex >= 0) {
    next[visibleIndex] = {
      ...next[visibleIndex],
      value: displayedAfter,
      isPrimary: true,
    };
    return ensureOnePrimary(next);
  }

  return [create(displayedAfter)];
}

function replaceVisibleNote(
  stored: ContactNoteInput[],
  displayedBefore: string,
  displayedAfter: string,
): ContactNoteInput[] {
  if (displayedAfter === displayedBefore) return stored;
  if (!displayedAfter) return stored.slice(1);
  if (!stored.length) return [{ body: displayedAfter }];
  return [{ body: displayedAfter }, ...stored.slice(1)];
}

export function contactToEntityRecord(contact: Contact): EntityRecord {
  return {
    id: contact.id,
    workspaceId: contact.workspaceId,
    ownerUserId: contact.ownerUserId,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    archivedAt: contact.archivedAt ?? "",
    linkedUserId: contact.linkedUserId ?? "",
    contactType: contact.contactType,
    nome: contact.name,
    tipo: contact.archivedAt ? "arquivado" : statusToLegacy[contact.status],
    cargo: contact.profession ?? "",
    telefone: displayPhone(primaryValue(contact.phones)),
    email: primaryValue(contact.emails),
    observacoes: contact.notes[0]?.body ?? "",
    [CONTACT_PHONES_FIELD]: JSON.stringify(phoneInputs(contact)),
    [CONTACT_EMAILS_FIELD]: JSON.stringify(emailInputs(contact)),
    [CONTACT_NOTES_FIELD]: JSON.stringify(noteInputs(contact)),
  };
}

export function entityValuesToContactInput(
  values: Record<string, string>,
  current?: EntityRecord,
  options: { copy?: boolean } = {},
): ContactMutationInput {
  const phone = values.telefone?.trim();
  const email = values.email?.trim();
  const note = values.observacoes?.trim();
  const storedPhones = serializedValues<ContactPhoneInput>(
    current?.[CONTACT_PHONES_FIELD],
  );
  const storedEmails = serializedValues<ContactEmailInput>(
    current?.[CONTACT_EMAILS_FIELD],
  );
  const storedNotes = serializedValues<ContactNoteInput>(
    current?.[CONTACT_NOTES_FIELD],
  );
  const currentPhones =
    storedPhones.length || !current?.telefone
      ? storedPhones
      : [
          {
            type: "whatsapp" as const,
            label: "WhatsApp",
            value: current.telefone,
            isPrimary: true,
          },
        ];
  const currentEmails =
    storedEmails.length || !current?.email
      ? storedEmails
      : [
          {
            type: "work" as const,
            label: "Principal",
            value: current.email,
            isPrimary: true,
          },
        ];
  const currentNotes =
    storedNotes.length || !current?.observacoes
      ? storedNotes
      : [{ body: current.observacoes }];
  return {
    name: values.nome?.trim() ?? "",
    contactType:
      current?.contactType === "company" || current?.contactType === "other"
        ? current.contactType
        : "person",
    status: legacyToStatus[values.tipo] ?? "lead",
    profession: values.cargo?.trim() || null,
    linkedUserId: options.copy ? null : current?.linkedUserId || null,
    phones: replaceVisibleEndpoint(
      currentPhones,
      current?.telefone?.trim() ?? "",
      phone ?? "",
      (value) => ({
        type: "whatsapp",
        label: "WhatsApp",
        value,
        isPrimary: true,
      }),
    ),
    emails: replaceVisibleEndpoint(
      currentEmails,
      current?.email?.trim() ?? "",
      email ?? "",
      (value) => ({
        type: "work",
        label: "Principal",
        value,
        isPrimary: true,
      }),
    ),
    notes: replaceVisibleNote(
      currentNotes,
      current?.observacoes?.trim() ?? "",
      note ?? "",
    ),
  };
}
