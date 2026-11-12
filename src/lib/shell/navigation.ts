import {
  BadgeDollarSign,
  BriefcaseBusiness,
  Calendar,
  CircleUserRound,
  GalleryVerticalEnd,
  Handshake,
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

export type NavigationMode = "workspace" | "config" | "social";

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

export const configNavigation: NavigationItem[] = [
  { label: "Registros", href: "/registros", icon: GalleryVerticalEnd },
  { label: "Modelos", href: "/meunegocio", icon: BriefcaseBusiness },
  { label: "Ferramentas", href: "/ferramentas", icon: Wrench },
  { label: "Financeiro", href: "/financeiro", icon: BadgeDollarSign },
  { label: "Preferências", href: "/preferencias", icon: SlidersHorizontal },
  { label: "Configurações", href: "/config/sistema", icon: MonitorCog },
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
  { label: "Social", href: "/social", icon: Handshake, area: "social" },
  {
    label: "Meu negócio",
    href: "/config",
    icon: Settings2,
    area: "config",
  },
];

export function isConfigPath(pathname: string): boolean {
  const path = decodeURIComponent(pathname).replace(/\/$/, "") || "/";
  return (
    path === "/config" ||
    path.startsWith("/config/") ||
    path === "/preferencias" ||
    path.startsWith("/preferencias/") ||
    path === "/meunegocio" ||
    path.startsWith("/meunegocio/")
  );
}

/** Routes displayed within the Meu negócio navigation area. */
export function isBusinessPath(pathname: string): boolean {
  const path = decodeURIComponent(pathname).replace(/\/$/, "") || "/";
  return (
    isConfigPath(path) ||
    path === "/registros" ||
    path.startsWith("/registros/") ||
    path === "/ferramentas" ||
    path.startsWith("/ferramentas/") ||
    path === "/financeiro" ||
    path.startsWith("/financeiro/")
  );
}

export function navigationMode(pathname: string): NavigationMode {
  const path = decodeURIComponent(pathname);
  if (isBusinessPath(path)) return "config";
  if (path === "/social" || path.startsWith("/social/")) return "social";
  return "workspace";
}

/**
 * Returns the navigation shown in the sidebar. `selectedMode` is intentionally
 * independent from the current route: choosing an area only changes the menu;
 * navigating to one of its entries is what changes the page content.
 */
export function getNavigation(
  pathname: string,
  selectedMode?: NavigationMode,
) {
  const mode = selectedMode ?? navigationMode(pathname);
  return {
    mode,
    primary: modeNavigation[mode],
    secondary: areaNavigation,
  };
}

export const allNavigation = [
  ...workspaceNavigation,
  ...configNavigation,
  ...socialNavigation,
];
