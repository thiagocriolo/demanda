<script lang="ts">
  import { onMount } from "svelte";
  import { X, Plus } from "@lucide/svelte";
  import { portal } from "$lib/ui/portal";
  import TabSystem from "$lib/ui/TabSystem.svelte";
  import { listProjects } from "$lib/projects/client";
  import { listDeliveries } from "$lib/deliveries/client";
  import { loadSettingsFromServer } from "$lib/settings/client";
  import { requestJson } from "$lib/http/client";
  import { listServicePackages } from "./client";
  import {
    copyDeliveryBlueprint,
    copyProjectBlueprint,
    deliveryTemplateBlueprint,
    projectTemplateBlueprint,
  } from "./blueprints";
  import type {
    ServicePackageDeliveryInput,
    ServicePackageProjectInput,
  } from "./types";

  let {
    kind,
    onproject,
    ondelivery,
    onclose,
  }: {
    kind: "projects" | "deliveries";
    onproject?: (project: ServicePackageProjectInput) => void;
    ondelivery?: (delivery: ServicePackageDeliveryInput) => void;
    onclose: () => void;
  } = $props();
  type Candidate = {
    id: string;
    name: string;
    origin: string;
    project?: ServicePackageProjectInput;
    delivery?: ServicePackageDeliveryInput;
  };
  const tabs = [
    { id: "library", label: "Biblioteca" },
    { id: "services", label: "Outros serviços" },
    { id: "real", label: "Registros reais" },
  ];
  let source = $state("library");
  let query = $state("");
  let page = $state(1);
  let totalPages = $state(1);
  let candidates = $state<Candidate[]>([]);
  let loading = $state(true);
  let selecting = $state(false);
  let error = $state("");
  let mounted = $state(false);
  let dialog: HTMLDivElement;
  let controller: AbortController | undefined;
  let request = 0;
  const label = $derived(kind === "projects" ? "projeto" : "entrega");
  const visible = $derived(
    source === "real"
      ? candidates
      : candidates.filter((item) =>
          `${item.name} ${item.origin}`
            .toLocaleLowerCase("pt-BR")
            .includes(query.trim().toLocaleLowerCase("pt-BR")),
        ),
  );

  async function load(): Promise<void> {
    controller?.abort();
    controller = new AbortController();
    const token = ++request;
    const signal = controller.signal;
    loading = true;
    error = "";
    candidates = [];
    try {
      let items: Candidate[];
      if (source === "library") {
        const settings = await loadSettingsFromServer();
        items =
          kind === "projects"
            ? settings.serviceTemplates.map((template) => ({
                id: template.id,
                name: template.name,
                origin: "Modelo de projeto · workspace",
                project: projectTemplateBlueprint(
                  template,
                  settings.deliveryTemplates,
                ),
              }))
            : settings.deliveryTemplates.map((template) => ({
                id: template.id,
                name: template.name,
                origin: "Modelo de entrega · workspace",
                delivery: deliveryTemplateBlueprint(template),
              }));
      } else if (source === "services") {
        const result = await listServicePackages({ signal });
        items = result.items.flatMap((pkg) =>
          pkg.projects.flatMap((project): Candidate[] =>
            kind === "projects"
              ? project.isInstitutional
                ? []
                : [
                    {
                      id: `${pkg.id}:${project.id}`,
                      name: project.name,
                      origin: pkg.name,
                      project: copyProjectBlueprint(project),
                    },
                  ]
              : project.deliveries.map((delivery) => ({
                  id: `${pkg.id}:${delivery.id}`,
                  name: delivery.name,
                  origin: `${pkg.name} · ${project.name}`,
                  delivery: copyDeliveryBlueprint(delivery),
                })),
          ),
        );
      } else {
        const result =
          kind === "projects"
            ? await listProjects({
                query,
                page,
                pageSize: 20,
                includeInactive: true,
                signal,
              })
            : await listDeliveries({
                query,
                page,
                pageSize: 20,
                includeInactiveProjects: true,
                signal,
              });
        items = result.items.map((item) => ({
          id: item.id,
          name: item.name,
          origin: `${item.business.name} · Registro real`,
        }));
        if (token === request) totalPages = Math.max(1, result.totalPages);
      }
      if (token === request) candidates = items;
    } catch (cause) {
      if (token === request && !signal.aborted)
        error =
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar as opções.";
    } finally {
      if (token === request) loading = false;
    }
  }

  async function select(candidate: Candidate): Promise<void> {
    if (selecting) return;
    selecting = true;
    error = "";
    try {
      if (kind === "projects") {
        const project =
          candidate.project ??
          (await requestJson<ServicePackageProjectInput>(
            fetch,
            `/api/service-sources/projects/${encodeURIComponent(candidate.id)}`,
            undefined,
            {
              fallbackMessage: "Não foi possível copiar o projeto.",
              createError: (_, message) => new Error(message),
            },
          ));
        if (
          project.deliveries.length > 100 ||
          project.deliveries.some((delivery) => delivery.tasks.length > 30)
        )
          throw new Error(
            "Este projeto excede o limite de 100 entregas ou 30 tarefas por entrega.",
          );
        onproject?.(copyProjectBlueprint(project));
      } else {
        const delivery =
          candidate.delivery ??
          (await requestJson<ServicePackageDeliveryInput>(
            fetch,
            `/api/service-sources/deliveries/${encodeURIComponent(candidate.id)}`,
            undefined,
            {
              fallbackMessage: "Não foi possível copiar a entrega.",
              createError: (_, message) => new Error(message),
            },
          ));
        if (delivery.tasks.length > 30)
          throw new Error("Esta entrega excede o limite de 30 tarefas.");
        ondelivery?.(copyDeliveryBlueprint(delivery));
      }
      onclose();
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível copiar a estrutura.";
    } finally {
      selecting = false;
    }
  }

  $effect(() => {
    if (!mounted) return;
    void source;
    void page;
    if (source === "real") void query;
    request++;
    controller?.abort();
    loading = true;
    candidates = [];
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  });
  onMount(() => {
    mounted = true;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLInputElement>("input")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!selecting) onclose();
      }
      if (event.key === "Tab") {
        const nodes = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input, [tabindex="0"]',
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      request++;
      controller?.abort();
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown, true);
      previous?.focus();
    };
  });
</script>

<div
  class="scope-import-backdrop"
  use:portal
  role="presentation"
  onclick={(event) =>
    event.target === event.currentTarget && !selecting && onclose()}
>
  <div
    bind:this={dialog}
    class="scope-import-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="scope-import-title"
    aria-busy={selecting}
  >
    <header>
      <div>
        <h2 id="scope-import-title">Selecionar {label}</h2>
        <p>Uma cópia editável será adicionada ao escopo atual.</p>
      </div>
      <button
        type="button"
        aria-label="Fechar seleção"
        disabled={selecting}
        onclick={onclose}><X size={20} /></button
      >
    </header>
    <TabSystem
      items={tabs}
      bind:value={source}
      onchange={() => {
        page = 1;
        query = "";
      }}
      idPrefix="scope-source"
      ariaLabel="Origem da estrutura"
    >
      <label class="search"
        ><span class="sr-only">Buscar {label}</span><input
          type="search"
          placeholder={`Buscar ${label}...`}
          bind:value={query}
          oninput={() => (page = 1)}
        /></label
      >
      {#if source === "real"}<p class="hint">
          Use um registro cadastrado como referência. A cópia não será incluída
          na biblioteca de modelos.
        </p>{/if}
      {#if error}<div role="alert" class="error">
          {error}<button
            type="button"
            disabled={loading || selecting}
            onclick={() => void load()}>Tentar novamente</button
          >
        </div>{/if}
      <div class="candidates" aria-busy={loading}>
        {#if loading}<p role="status">Carregando opções…</p>
        {:else if !visible.length}<p>Nenhum {label} encontrado nesta origem.</p>
        {:else}{#each visible as candidate (candidate.id)}<button
              class="candidate"
              type="button"
              disabled={selecting}
              onclick={() => void select(candidate)}
              ><span
                ><strong>{candidate.name}</strong><small
                  >{candidate.origin}</small
                ></span
              ><Plus size={18} /></button
            >{/each}{/if}
      </div>
      {#if source === "real" && totalPages > 1}<nav
          aria-label="Páginas dos registros"
        >
          <button
            type="button"
            disabled={page <= 1 || loading || selecting}
            onclick={() => page--}>Anterior</button
          ><span>{page} / {totalPages}</span><button
            type="button"
            disabled={page >= totalPages || loading || selecting}
            onclick={() => page++}>Próxima</button
          >
        </nav>{/if}
    </TabSystem>
  </div>
</div>

<style>
  .scope-import-backdrop {
    position: fixed;
    inset: 0;
    z-index: 5000;
    display: grid;
    place-items: center;
    padding: 20px;
    background: var(--overlay, rgba(15, 23, 42, 0.45));
    backdrop-filter: blur(6px);
  }
  .scope-import-dialog {
    width: min(760px, 100%);
    max-height: 90dvh;
    overflow-y: auto;
    padding: 24px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
    box-shadow: var(--shadow-md);
  }
  header,
  nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  h2 {
    margin: 0 0 6px;
    font-size: var(--text-xl);
  }
  p {
    color: var(--muted);
  }
  header p {
    margin: 0;
  }
  button {
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 9px 12px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .search {
    display: block;
    margin-block: 14px;
  }
  input {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--canvas);
    color: var(--text);
  }
  .hint,
  small {
    font-size: var(--text-sm);
    color: var(--muted);
  }
  .candidates {
    display: grid;
    gap: 8px;
    min-height: 120px;
  }
  .candidate {
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-align: left;
    gap: 12px;
    padding: 14px;
  }
  .candidate span {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  strong,
  small {
    overflow-wrap: anywhere;
  }
  .candidate:hover {
    border-color: var(--primary);
    background: var(--surface-soft);
  }
  nav {
    margin-block: 16px 0;
  }
  .error {
    color: var(--danger);
    margin-block: 12px;
  }
</style>
