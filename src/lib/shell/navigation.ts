import {
  BadgeDollarSign,
  BriefcaseBusiness,
  Calendar,
  CircleUserRound,
  FileText,
  GalleryVerticalEnd,
  Handshake,
  History,
  LayoutDashboard,
  ListTodo,
  MonitorCog,
  Network,
  Newspaper,
  Settings2,
  SlidersHorizontal,
  Timeline,
  UsersRound,
  Wrench,
} from "@lucide/svelte";

export type NavigationMode = "workspace" | "business" | "config" | "social";

export type NavigationItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  area?: NavigationMode;
};

export const workspaceNavigation: NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  { label: "Pauta", href: "/pauta", icon: ListTodo },
  { label: "Cronograma", href: "/cronograma", icon: Timeline },
  { label: "Agenda", href: "/agenda", icon: Calendar },
];

export const businessNavigation: NavigationItem[] = [
  { label: "Contratos", href: "/contratos", icon: FileText },
  { label: "Clientes", href: "/clientes", icon: GalleryVerticalEnd },
  { label: "Serviços", href: "/meunegocio", icon: BriefcaseBusiness },
  { label: "Ferramentas", href: "/ferramentas", icon: Wrench },
  { label: "Financeiro", href: "/financeiro", icon: BadgeDollarSign },
  { label: "Relatórios", href: "/historico", icon: History },
];

export const configNavigation: NavigationItem[] = [
  {
    label: "Preferências",
    href: "/config/preferencias",
    icon: SlidersHorizontal,
  },
  { label: "Interface", href: "/config/interface", icon: MonitorCog },
  { label: "Sistema", href: "/config/sistema", icon: Settings2 },
];

export const socialNavigation: NavigationItem[] = [
  { label: "Feed", href: "/social/feed", icon: Newspaper },
  { label: "Conexões", href: "/social/conect", icon: Network },
  { label: "Comunidades", href: "/social/comunidade", icon: UsersRound },
  { label: "Portfólio", href: "/social/portfolio", icon: BriefcaseBusiness },
  { label: "Usuário", href: "/social/usuario", icon: CircleUserRound },
];

const modeNavigation: Record<NavigationMode, NavigationItem[]> = {
  workspace: workspaceNavigation,
  business: businessNavigation,
  config: configNavigation,
  social: socialNavigation,
};

export const areaNavigation: NavigationItem[] = [
  {
    label: "Área de trabalho",
    href: "/dashboard",
    icon: LayoutDashboard,
    area: "workspace",
  },
  {
    label: "Meu negócio",
    href: "/contratos",
    icon: BriefcaseBusiness,
    area: "business",
  },
  { label: "Social", href: "/social", icon: Handshake, area: "social" },
  { label: "Configurações", href: "/config", icon: Settings2, area: "config" },
];

export function isConfigPath(pathname: string): boolean {
  const path = decodeURIComponent(pathname).replace(/\/$/, "") || "/";
  return (
    path === "/config" ||
    path.startsWith("/config/") ||
    path === "/preferencias" ||
    path.startsWith("/preferencias/")
  );
}

export function isBusinessPath(pathname: string): boolean {
  const path = decodeURIComponent(pathname).replace(/\/$/, "") || "/";
  return (
    path === "/contratos" ||
    path.startsWith("/contratos/") ||
    path === "/clientes" ||
    path.startsWith("/clientes/") ||
    path === "/meunegocio" ||
    path.startsWith("/meunegocio/") ||
    path === "/ferramentas" ||
    path.startsWith("/ferramentas/") ||
    path === "/financeiro" ||
    path.startsWith("/financeiro/") ||
    path === "/historico" ||
    path.startsWith("/historico/")
  );
}

export function navigationMode(pathname: string): NavigationMode {
  const path = decodeURIComponent(pathname);
  if (isConfigPath(path)) return "config";
  if (isBusinessPath(path)) return "business";
  if (path === "/social" || path.startsWith("/social/")) return "social";
  return "workspace";
}

export function getNavigation(pathname: string, selectedMode?: NavigationMode) {
  const mode = selectedMode ?? navigationMode(pathname);
  return { mode, primary: modeNavigation[mode], secondary: areaNavigation };
}

export const allNavigation = [
  ...workspaceNavigation,
  ...businessNavigation,
  ...configNavigation,
  ...socialNavigation,
];
