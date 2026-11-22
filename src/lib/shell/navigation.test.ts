import { describe, expect, it, vi } from "vitest";

vi.mock("@lucide/svelte", () => ({
  BadgeDollarSign: {},
  BriefcaseBusiness: {},
  Calendar: {},
  CircleUserRound: {},
  FileText: {},
  GalleryVerticalEnd: {},
  Handshake: {},
  History: {},
  LayoutDashboard: {},
  ListTodo: {},
  MonitorCog: {},
  Network: {},
  Newspaper: {},
  Settings2: {},
  SlidersHorizontal: {},
  Timeline: {},
  UsersRound: {},
  Wrench: {},
}));

import {
  areaNavigation,
  businessNavigation,
  configNavigation,
  getNavigation,
  navigationMode,
  workspaceNavigation,
} from "./navigation";
import { resolvePageTitle, resolveTopbarTitle } from "./page-title";

describe("navegação das áreas", () => {
  it("separa as rotas de Meu negócio das configurações", () => {
    expect(navigationMode("/contratos")).toBe("business");
    expect(navigationMode("/clientes")).toBe("business");
    expect(navigationMode("/ferramentas/recursos")).toBe("business");
    expect(navigationMode("/financeiro")).toBe("business");
    expect(navigationMode("/historico")).toBe("business");
  });

  it("organiza os menus de Meu negócio e Configurações", () => {
    expect(areaNavigation.find(({ area }) => area === "business")?.label).toBe(
      "Meu negócio",
    );
    expect(businessNavigation.map(({ label }) => label)).toEqual([
      "Contratos",
      "Clientes",
      "Serviços",
      "Ferramentas",
      "Financeiro",
      "Relatórios",
    ]);
    expect(configNavigation.map(({ label }) => label)).toEqual([
      "Preferências",
      "Interface",
      "Sistema",
    ]);
    expect(workspaceNavigation.map(({ label }) => label)).not.toContain(
      "Clientes",
    );
  });

  it("permite trocar o menu visível sem mudar a rota", () => {
    expect(getNavigation("/dashboard", "social").mode).toBe("social");
    expect(getNavigation("/dashboard", "social").primary).not.toEqual(
      workspaceNavigation,
    );
    expect(getNavigation("/social/feed", "workspace").mode).toBe(
      "workspace",
    );
  });

  it("usa os títulos reorganizados", () => {
    expect(resolvePageTitle("/meunegocio")).toBe("Serviços");
    expect(resolveTopbarTitle("/meunegocio")).toBe("Serviços");
    expect(resolveTopbarTitle("/preferencias")).toBe("Configurações");
  });
});
