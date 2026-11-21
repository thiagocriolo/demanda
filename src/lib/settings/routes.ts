import type { TabItem } from "$lib/ui/Tabs.svelte";

export const preferenceTabs = [
  "dashboard",
  "workspace",
  "registro",
  "pauta",
  "cronograma",
  "agenda",
  "financeiro",
] as const;

export type PreferenceTab = (typeof preferenceTabs)[number];

export const interfaceTabs = ["aparencia", "status", "rotulos"] as const;

export type InterfaceTab = (typeof interfaceTabs)[number];

export const systemTabs = ["geral", "seguranca", "dados", "avancado"] as const;

export type SystemTab = (typeof systemTabs)[number];

function tabsWithRoutes<T extends string>(
  basePath: string,
  items: readonly { id: T; label: string }[],
): TabItem[] {
  return items.map(({ id, label }) => ({
    id,
    label,
    href: `${basePath}/${id}`,
  }));
}

export const preferenceTabItems = tabsWithRoutes("/config/preferencias", [
  { id: "dashboard", label: "Dashboard" },
  { id: "workspace", label: "Workspace" },
  { id: "registro", label: "Registro" },
  { id: "pauta", label: "Pauta" },
  { id: "cronograma", label: "Cronograma" },
  { id: "agenda", label: "Agenda" },
  { id: "financeiro", label: "Financeiro" },
]);

export const interfaceTabItems = tabsWithRoutes("/config/interface", [
  { id: "aparencia", label: "Aparência" },
  { id: "status", label: "Status" },
  { id: "rotulos", label: "Rótulos" },
]);

export const systemTabItems = tabsWithRoutes("/config/sistema", [
  { id: "geral", label: "Geral" },
  { id: "seguranca", label: "Segurança" },
  { id: "dados", label: "Dados" },
  { id: "avancado", label: "Avançado" },
]);
