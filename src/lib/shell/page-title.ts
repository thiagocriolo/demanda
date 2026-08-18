import { allNavigation, isConfigPath } from "./navigation";

const rootTitles: Record<string, string> = {
  "/": "Dashboard",
  "/config": "Configurações",
  "/ferramentas": "Ferramentas",
  "/social": "Social",
};

/** Mantém a tradução entre rota e título fora do componente da topbar. */
export function resolvePageTitle(pathname: string): string {
  const path = decodeURIComponent(pathname).replace(/\/$/, "") || "/";
  if (rootTitles[path]) return rootTitles[path];

  const item = allNavigation.find(
    ({ href }) => path === href || path.startsWith(`${href}/`),
  );
  return item?.label ?? "Demanda";
}

/** Usa o nome da área somente no título à esquerda da topbar. */
export function resolveTopbarTitle(pathname: string): string {
  const path = decodeURIComponent(pathname).replace(/\/$/, "") || "/";
  if (path === "/social" || path.startsWith("/social/")) {
    return rootTitles["/social"];
  }
  if (isConfigPath(path)) {
    return rootTitles["/config"];
  }
  if (path === "/ferramentas" || path.startsWith("/ferramentas/")) {
    return rootTitles["/ferramentas"];
  }
  return resolvePageTitle(path);
}
