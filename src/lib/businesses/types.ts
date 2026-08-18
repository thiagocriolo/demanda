import type { ContactStatus, ContactType } from "../contacts/types";

type BusinessResponsibleBase = {
  name: string;
  archivedAt: string | null;
};

export type BusinessResponsibleContact = BusinessResponsibleBase & {
  /** Ausente apenas em respostas antigas, anteriores a responsáveis usuários. */
  kind?: "contact";
  contactId: string;
  userId?: null;
  contactType: ContactType;
  status: ContactStatus;
  profession: string | null;
  username?: null;
  email?: null;
  avatarUrl?: null;
};

export type BusinessResponsibleUser = BusinessResponsibleBase & {
  kind: "user";
  contactId: null;
  userId: string;
  contactType: null;
  status: null;
  profession: null;
  username: string;
  email: string;
  avatarUrl: string | null;
};

export type BusinessResponsible =
  BusinessResponsibleContact | BusinessResponsibleUser;

export type BusinessResponsibleUserOption = {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  current: boolean;
};

export type BusinessNote = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type Business = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  name: string;
  category: string;
  stage: string;
  responsibles: BusinessResponsible[];
  notes: BusinessNote[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BusinessMutationInput = {
  name: string;
  category: string;
  stage: string;
  responsibleContactIds: string[];
  responsibleUserIds?: string[];
  notes: { body: string }[];
};

export type BusinessList = {
  workspaceId: string;
  ownerUserId: string;
  items: Business[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: {
    all: number;
    archived: number;
    stages: Record<string, number>;
    categories: Record<string, number>;
  };
};
