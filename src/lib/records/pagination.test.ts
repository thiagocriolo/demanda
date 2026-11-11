import { describe, expect, it, vi } from "vitest";
import type { EntityRecord } from "../entities/types";
import {
  createPaginatedRecordsController,
  type PaginatedRecordsResult,
  type PaginatedRecordsState,
} from "./pagination";

type Facets = { all: number };

const parameters = {
  query: "",
  filter: "todos",
  orderBy: "updated" as const,
  showArchived: false,
};

function record(id: string, nome = id): EntityRecord {
  return {
    id,
    nome,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function setup(
  load: (
    request: Parameters<
      Parameters<typeof createPaginatedRecordsController<Facets>>[0]["load"]
    >[0],
  ) => Promise<PaginatedRecordsResult<Facets>>,
) {
  let state: PaginatedRecordsState<Facets> | undefined;
  const controller = createPaginatedRecordsController({
    pageSize: 10,
    initialFacets: { all: 0 },
    load,
    errorMessage: (cause) =>
      cause instanceof Error ? cause.message : "Falha ao carregar.",
    onChange: (nextState) => {
      state = nextState;
    },
  });
  return { controller, state: () => state ?? controller.state };
}

describe("paginated records controller", () => {
  it("loads pages and merges duplicate records by id", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        items: [record("1", "Primeiro"), record("2", "Antigo")],
        total: 3,
        totalPages: 2,
        facets: { all: 3 },
      })
      .mockResolvedValueOnce({
        items: [record("2", "Atualizado"), record("3", "Terceiro")],
        total: 3,
        totalPages: 2,
        facets: { all: 3 },
      });
    const { controller, state } = setup(load);

    await controller.reload(parameters);
    expect(controller.advancePage()).toBe(true);
    await controller.reload(parameters);

    expect(load.mock.calls.map(([request]) => request.page)).toEqual([1, 2]);
    expect(state().items).toEqual([
      record("1", "Primeiro"),
      record("2", "Atualizado"),
      record("3", "Terceiro"),
    ]);
    expect(state()).toMatchObject({
      page: 2,
      total: 3,
      totalPages: 2,
      loading: false,
      error: "",
    });
  });

  it("resets a later page without discarding the current items", async () => {
    const { controller, state } = setup(async () => ({
      items: [record("1")],
      total: 20,
      totalPages: 2,
      facets: { all: 20 },
    }));
    await controller.reload(parameters);
    controller.advancePage();

    expect(controller.resetPage()).toBe(true);
    expect(state().page).toBe(1);
    expect(state().items).toEqual([record("1")]);
    expect(controller.resetPage()).toBe(false);
  });

  it("aborts and ignores a stale response", async () => {
    const first = deferred<PaginatedRecordsResult<Facets>>();
    const second = deferred<PaginatedRecordsResult<Facets>>();
    const signals: AbortSignal[] = [];
    const load = vi.fn((request) => {
      signals.push(request.signal);
      return signals.length === 1 ? first.promise : second.promise;
    });
    const { controller, state } = setup(load);

    const firstReload = controller.reload(parameters);
    const secondReload = controller.reload({ ...parameters, query: "novo" });
    expect(signals[0]?.aborted).toBe(true);

    second.resolve({
      items: [record("novo")],
      total: 1,
      totalPages: 1,
      facets: { all: 1 },
    });
    await secondReload;
    first.resolve({
      items: [record("obsoleto")],
      total: 1,
      totalPages: 1,
      facets: { all: 1 },
    });
    await firstReload;

    expect(state().items).toEqual([record("novo")]);
    expect(state().loading).toBe(false);
  });

  it("exposes an error and clears first-page records on failure", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        items: [record("1")],
        total: 1,
        totalPages: 1,
        facets: { all: 1 },
      })
      .mockRejectedValueOnce(new Error("Servidor indisponível"));
    const { controller, state } = setup(load);

    await controller.reload(parameters);
    await controller.reload(parameters);

    expect(state()).toMatchObject({
      items: [],
      loading: false,
      error: "Servidor indisponível",
    });
  });

  it("aborts the active request when disposed", async () => {
    const pending = deferred<PaginatedRecordsResult<Facets>>();
    let signal: AbortSignal | undefined;
    const { controller } = setup((request) => {
      signal = request.signal;
      return pending.promise;
    });

    void controller.reload(parameters);
    controller.dispose();

    expect(signal?.aborted).toBe(true);
  });
});
