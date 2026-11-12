import { describe, expect, it, vi } from "vitest";

vi.mock("@lucide/svelte", () => ({
  BadgeDollarSign: {},
  Blocks: {},
  BriefcaseBusiness: {},
  Calendar: {},
  ChartNoAxesCombined: {},
  CircleUserRound: {},
  GalleryVerticalEnd: {},
  Handshake: {},
  LayoutDashboard: {},
  ListTodo: {},
  MonitorCog: {},
  Network: {},
  Newspaper: {},
  Settings2: {},
  SlidersHorizontal: {},
  SquareStack: {},
  Timeline: {},
  UsersRound: {},
  Wrench: {},
}));

import {
  areaNavigation,
  configNavigation,
  getNavigation,
  navigationMode,
  workspaceNavigation,
} from "./navigation";
import { resolvePageTitle, resolveTopbarTitle } from "./page-title";

describe("navegação das áreas", () => {
  it("mantém os itens operacionais em Meu negócio", () => {
    expect(navigationMode("/registros")).toBe("config");
    expect(navigationMode("/ferramentas/recursos")).toBe("config");
    expect(navigationMode("/financeiro")).toBe("config");
  });

  it("organiza os rótulos e os itens da área Meu negócio", () => {
    expect(areaNavigation.find(({ area }) => area === "config")?.label).toBe(
      "Meu negócio",
    );
    expect(configNavigation.map(({ label }) => label)).toEqual([
      "Registros",
      "Modelos",
      "Ferramentas",
      "Financeiro",
      "Preferências",
      "Configurações",
    ]);
    expect(workspaceNavigation.map(({ label }) => label)).not.toContain(
      "Registros",
    );
  });

  it("permite trocar apenas o menu visível sem mudar a rota", () => {
    expect(getNavigation("/dashboard", "social").mode).toBe("social");
    expect(getNavigation("/dashboard", "social").primary).not.toEqual(
      workspaceNavigation,
    );
    expect(getNavigation("/social/feed", "workspace").mode).toBe(
      "workspace",
    );
  });

  it("mantém o título de ferramentas após a mudança de área", () => {
    expect(resolveTopbarTitle("/ferramentas")).toBe("Ferramentas");
    expect(resolvePageTitle("/ferramentas")).toBe("Ferramentas");
  });

  it("usa Modelos e Meu negócio nos títulos apropriados", () => {
    expect(resolvePageTitle("/meunegocio")).toBe("Modelos");
    expect(resolveTopbarTitle("/meunegocio")).toBe("Modelos");
    expect(resolveTopbarTitle("/preferencias")).toBe("Meu negócio");
  });
});
