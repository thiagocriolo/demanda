import type {
  ServiceDeliveryRecurrenceType,
  ServiceDeliveryRecurrenceUnit,
  ServiceProjectNature,
} from "$lib/service-packages/types";

export type ContractScopeTaskDraft = {
  localId: string;
  id?: string;
  name: string;
  durationMinutes: number;
};

export type ContractScopeDeliveryDraft = {
  localId: string;
  id?: string;
  name: string;
  description: string;
  priority: string;
  recurrenceType: ServiceDeliveryRecurrenceType;
  recurrenceUnit: ServiceDeliveryRecurrenceUnit | null;
  recurrenceDays: number[];
  tasks: ContractScopeTaskDraft[];
};

export type ContractScopeProjectDraft = {
  localId: string;
  id?: string;
  isInstitutional: boolean;
  included: boolean;
  name: string;
  briefing: string;
  projectType: ServiceProjectNature;
  durationDays: string;
  responsibleUserId: string;
  deliveries: ContractScopeDeliveryDraft[];
};
