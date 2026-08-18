export type WorkspacePage<T, TFacets> = {
  workspaceId: string;
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: TFacets;
};

type GlobalListOptions<T, TFacets> = {
  workspaceIds: string[];
  page: number;
  pageSize: number;
  loadPage: (
    workspaceId: string,
    page: number,
    pageSize: number,
  ) => Promise<WorkspacePage<T, TFacets>>;
  compare: (left: T, right: T) => number;
  mergeFacets: (facets: TFacets[]) => TFacets;
};

/**
 * Carrega os tenants autorizados separadamente e pagina o conjunto unido.
 * Isso preserva o isolamento do servidor e entrega uma paginacao global real,
 * em vez de concatenar uma pagina incompleta de cada workspace.
 */
export async function loadGlobalWorkspaceList<T, TFacets>(
  options: GlobalListOptions<T, TFacets>,
): Promise<WorkspacePage<T, TFacets>> {
  const perWorkspace = await Promise.all(
    options.workspaceIds.map(async (workspaceId) => {
      const first = await options.loadPage(workspaceId, 1, 100);
      const pages = [first];
      for (let page = 2; page <= first.totalPages; page += 1) {
        pages.push(await options.loadPage(workspaceId, page, 100));
      }
      return pages;
    }),
  );
  const firstPages = perWorkspace.map(([first]) => first).filter(Boolean);
  const items = perWorkspace
    .flatMap((pages) => pages.flatMap(({ items }) => items))
    .toSorted(options.compare);
  const total = items.length;
  const start = (options.page - 1) * options.pageSize;
  return {
    workspaceId: "global",
    items: items.slice(start, start + options.pageSize),
    page: options.page,
    pageSize: options.pageSize,
    total,
    totalPages: Math.ceil(total / options.pageSize),
    facets: options.mergeFacets(firstPages.map(({ facets }) => facets)),
  };
}

export function mergeCountRecords(
  records: Array<Record<string, number>>,
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return merged;
}

export function compareNullableDatesDescending(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  return (right ?? "").localeCompare(left ?? "");
}
