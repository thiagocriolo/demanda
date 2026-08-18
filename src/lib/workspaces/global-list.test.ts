import { describe, expect, it } from "vitest";
import {
  loadGlobalWorkspaceList,
  mergeCountRecords,
  type WorkspacePage,
} from "./global-list";

type Item = { id: string; name: string };
type Facets = { all: number; statuses: Record<string, number> };

describe("loadGlobalWorkspaceList", () => {
  it("une, ordena e pagina todos os workspaces concretos", async () => {
    const source: Record<string, Item[]> = {
      a: [
        { id: "a-2", name: "Delta" },
        { id: "a-1", name: "Alfa" },
      ],
      b: [
        { id: "b-2", name: "Eco" },
        { id: "b-1", name: "Beta" },
      ],
    };
    const loadPage = async (
      workspaceId: string,
      page: number,
      pageSize: number,
    ): Promise<WorkspacePage<Item, Facets>> => {
      const items = source[workspaceId] ?? [];
      return {
        workspaceId,
        items: items.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: items.length,
        totalPages: Math.ceil(items.length / pageSize),
        facets: { all: items.length, statuses: { aberto: items.length } },
      };
    };

    const result = await loadGlobalWorkspaceList({
      workspaceIds: ["a", "b"],
      page: 2,
      pageSize: 2,
      loadPage,
      compare: (left, right) => left.name.localeCompare(right.name),
      mergeFacets: (facets) => ({
        all: facets.reduce((total, item) => total + item.all, 0),
        statuses: mergeCountRecords(facets.map(({ statuses }) => statuses)),
      }),
    });

    expect(result.workspaceId).toBe("global");
    expect(result.items.map(({ id }) => id)).toEqual(["a-2", "b-2"]);
    expect(result.total).toBe(4);
    expect(result.totalPages).toBe(2);
    expect(result.facets).toEqual({ all: 4, statuses: { aberto: 4 } });
  });
});
