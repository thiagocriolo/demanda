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
  getNavigation,
  navigationMode,
  workspaceNavigation,
} from "./navigation";
import { resolvePageTitle, resolveTopbarTitle } from "./page-title";

describe("navegação da página de ferramentas", () => {
  it("mantém ferramentas na área de trabalho", () => {
    expect(navigationMode("/ferramentas")).toBe("workspace");
    expect(navigationMode("/ferramentas/recursos")).toBe("workspace");
  });

  it("posiciona ferramentas imediatamente antes de financeiro", () => {
    expect(getNavigation("/ferramentas").primary).toEqual(workspaceNavigation);
    const labels = workspaceNavigation.map(({ label }) => label);
    expect(labels.indexOf("Ferramentas")).toBe(
      labels.indexOf("Financeiro") - 1,
    );
  });

  it("usa ferramentas como título da página e da topbar", () => {
    expect(resolveTopbarTitle("/ferramentas")).toBe("Ferramentas");
    expect(resolvePageTitle("/ferramentas")).toBe("Ferramentas");
  });
});
