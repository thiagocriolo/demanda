import type { LucideIcon } from "@lucide/svelte";

export type EntityFieldOption = {
  value: string;
  label: string;
  tone?: "blue" | "green" | "amber" | "red" | "violet" | "gray";
};

export type EntityField = {
  name: string;
  label: string;
  type:
    | "text"
    | "email"
    | "tel"
    | "number"
    | "date"
    | "select"
    | "textarea"
    | "people";
  icon: LucideIcon;
  placeholder?: string;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
  options?: EntityFieldOption[];
  format?: "currency" | "date";
  table?: boolean;
  half?: boolean;
};

export type EntityRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: string;
};

export type EntitySeed = Record<string, string>;

export type EntityConfig = {
  key: "pessoas" | "negocios" | "projetos" | "entregas";
  singular: string;
  plural: string;
  description: string;
  icon: LucideIcon;
  formSectionTitle: string;
  createTitle: string;
  editTitle: string;
  createAction: string;
  fields: EntityField[];
  seeds: EntitySeed[];
};
