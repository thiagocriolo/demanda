export const contactTypes = ["person", "company", "other"] as const;
export type ContactType = (typeof contactTypes)[number];

export const contactStatuses = [
  "lead",
  "prospect",
  "active",
  "inactive",
] as const;
export type ContactStatus = (typeof contactStatuses)[number];

export const contactPhoneTypes = [
  "mobile",
  "whatsapp",
  "work",
  "home",
  "other",
] as const;
export type ContactPhoneType = (typeof contactPhoneTypes)[number];

export const contactEmailTypes = ["personal", "work", "other"] as const;
export type ContactEmailType = (typeof contactEmailTypes)[number];

export type ContactPhone = {
  id: string;
  type: ContactPhoneType;
  label: string;
  value: string;
  isPrimary: boolean;
};

export type ContactEmail = {
  id: string;
  type: ContactEmailType;
  label: string;
  value: string;
  isPrimary: boolean;
};

export type ContactNote = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type Contact = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  linkedUserId: string | null;
  name: string;
  contactType: ContactType;
  status: ContactStatus;
  profession: string | null;
  phones: ContactPhone[];
  emails: ContactEmail[];
  notes: ContactNote[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContactPhoneInput = Omit<ContactPhone, "id">;
export type ContactEmailInput = Omit<ContactEmail, "id">;
export type ContactNoteInput = { body: string };

export type ContactMutationInput = {
  name: string;
  contactType: ContactType;
  status: ContactStatus;
  profession: string | null;
  linkedUserId: string | null;
  phones: ContactPhoneInput[];
  emails: ContactEmailInput[];
  notes: ContactNoteInput[];
};

export type ContactList = {
  workspaceId: string;
  ownerUserId: string;
  items: Contact[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: {
    all: number;
    lead: number;
    prospect: number;
    active: number;
    inactive: number;
    archived: number;
  };
};
