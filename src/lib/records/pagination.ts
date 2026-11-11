import type { EntityRecord } from "../entities/types";
import type { RecordsListRequest } from "./types";

export type RecordsListParameters = Omit<
  RecordsListRequest,
  "page" | "pageSize" | "signal"
>;

export type PaginatedRecordsResult<F> = {
  items: EntityRecord[];
  total: number;
  totalPages: number;
  facets: F;
};

export type PaginatedRecordsState<F> = PaginatedRecordsResult<F> & {
  page: number;
  loading: boolean;
  error: string;
};

type PaginatedRecordsControllerOptions<F> = {
  pageSize: number;
  initialFacets: F;
  load(request: RecordsListRequest): Promise<PaginatedRecordsResult<F>>;
  errorMessage(cause: unknown): string;
  onChange(state: PaginatedRecordsState<F>): void;
};

export type PaginatedRecordsController<F> = {
  readonly state: PaginatedRecordsState<F>;
  advancePage(): boolean;
  resetPage(): boolean;
  reload(parameters: RecordsListParameters): Promise<void>;
  dispose(): void;
};

export function createInitialPaginatedRecordsState<F>(
  initialFacets: F,
): PaginatedRecordsState<F> {
  return {
    items: [],
    page: 1,
    total: 0,
    totalPages: 1,
    loading: false,
    error: "",
    facets: initialFacets,
  };
}

function mergeRecords(
  current: EntityRecord[],
  incoming: EntityRecord[],
): EntityRecord[] {
  const merged = new Map(current.map((record) => [record.id, record]));
  for (const record of incoming) merged.set(record.id, record);
  return [...merged.values()];
}

export function createPaginatedRecordsController<F>(
  options: PaginatedRecordsControllerOptions<F>,
): PaginatedRecordsController<F> {
  let state = createInitialPaginatedRecordsState(options.initialFacets);
  let activeRequest: AbortController | undefined;

  function update(patch: Partial<PaginatedRecordsState<F>>): void {
    state = { ...state, ...patch };
    options.onChange(state);
  }

  return {
    get state() {
      return state;
    },

    advancePage() {
      if (state.loading || state.error || state.page >= state.totalPages) {
        return false;
      }
      update({ page: state.page + 1, loading: true });
      return true;
    },

    resetPage() {
      if (state.page === 1) return false;
      update({ page: 1 });
      return true;
    },

    async reload(parameters) {
      activeRequest?.abort();
      const controller = new AbortController();
      const requestedPage = state.page;
      activeRequest = controller;
      update({
        loading: true,
        error: "",
        ...(requestedPage === 1 ? { items: [] } : {}),
      });

      try {
        const result = await options.load({
          ...parameters,
          page: requestedPage,
          pageSize: options.pageSize,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        if (result.totalPages > 0 && requestedPage > result.totalPages) {
          update({ page: result.totalPages });
          return;
        }

        update({
          items:
            requestedPage === 1
              ? result.items
              : mergeRecords(state.items, result.items),
          total: result.total,
          totalPages: Math.max(1, result.totalPages),
          facets: result.facets,
        });
      } catch (cause) {
        if (controller.signal.aborted) return;
        update({
          error: options.errorMessage(cause),
          ...(requestedPage === 1 ? { items: [] } : {}),
        });
      } finally {
        if (activeRequest === controller) update({ loading: false });
      }
    },

    dispose() {
      activeRequest?.abort();
      activeRequest = undefined;
    },
  };
}
