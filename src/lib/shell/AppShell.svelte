<script lang="ts">
  import { page } from "$app/state";
  import { onMount, setContext, untrack, type Snippet } from "svelte";
  import {
    GLOBAL_FILTERS_CONTEXT,
    GlobalFiltersState,
  } from "$lib/filters/global-filters.svelte";
  import {
    CONFIG_SAVE_CONTEXT,
    type ConfigSaveContext,
    type ConfigSaveState,
  } from "$lib/settings/config-save";
  import { currentSettings, savePersonalSettings } from "$lib/settings/client";
  import type { SettingsState } from "$lib/settings/types";
  import { cardScale } from "$lib/ui/card-scale";
  import { refreshWorkspaceSnapshot } from "$lib/workspaces/workspace-storage";
  import MobileDock from "./MobileDock.svelte";
  import { navigationMode, type NavigationMode } from "./navigation";
  import Sidebar from "./Sidebar.svelte";
  import Topbar from "./Topbar.svelte";

  let { children, initialSettings } = $props<{
    children: Snippet;
    initialSettings: SettingsState;
  }>();
  const globalFilters = untrack(() => new GlobalFiltersState(initialSettings));
  function initiallyCollapsed(): boolean {
    return initialSettings.sidebarDefault === "collapsed";
  }

  let collapsed = $state(initiallyCollapsed());
  // Selecting an area is a local navigation decision. It deliberately does
  // not change the route, so the current content remains visible.
  let selectedNavigationMode = $state<NavigationMode | null>(null);
  let configSaveState = $state<ConfigSaveState>({
    active: false,
    dirty: false,
    saved: false,
    saving: false,
  });
  let configSaveHandler: (() => void | Promise<void>) | undefined;
  let configSaveRegistration: symbol | undefined;
  let saveFeedbackTimeout: ReturnType<typeof setTimeout> | undefined;
  // A página estrutural é naturalmente fluida e sempre recebe o espaçamento da
  // casca. Apenas experiências que ocupam o viewport inteiro (Agenda e
  // Cronograma) preservam uma altura definida para seus painéis internos.
  let hasFixedViewportContent = $derived(
    ["/agenda", "/cronograma"].includes(page.url.pathname.replace(/\/$/, "")),
  );

  const configSaveContext: ConfigSaveContext = {
    state: configSaveState,
    register: (onsave) => {
      const registration = Symbol("config-save-registration");
      if (saveFeedbackTimeout) clearTimeout(saveFeedbackTimeout);
      saveFeedbackTimeout = undefined;
      configSaveRegistration = registration;
      configSaveHandler = onsave;
      configSaveState.active = true;
      configSaveState.dirty = false;
      configSaveState.saved = false;
      configSaveState.saving = false;

      return {
        setDirty: (dirty) => {
          if (configSaveRegistration !== registration) return;
          configSaveState.dirty = dirty;
          if (dirty) configSaveState.saved = false;
        },
        unregister: () => {
          if (configSaveRegistration !== registration) return;
          if (saveFeedbackTimeout) clearTimeout(saveFeedbackTimeout);
          saveFeedbackTimeout = undefined;
          configSaveRegistration = undefined;
          configSaveHandler = undefined;
          configSaveState.active = false;
          configSaveState.dirty = false;
          configSaveState.saved = false;
          configSaveState.saving = false;
        },
      };
    },
    save: async () => {
      if (
        !configSaveState.active ||
        !configSaveHandler ||
        configSaveState.saving
      )
        return;
      configSaveState.saving = true;
      configSaveState.saved = false;
      try {
        await configSaveHandler();
        configSaveState.dirty = false;
        configSaveState.saved = true;
        if (saveFeedbackTimeout) clearTimeout(saveFeedbackTimeout);
        saveFeedbackTimeout = setTimeout(() => {
          configSaveState.saved = false;
          saveFeedbackTimeout = undefined;
        }, 1800);
      } catch {
        configSaveState.saved = false;
      } finally {
        configSaveState.saving = false;
      }
    },
  };

  setContext(CONFIG_SAVE_CONTEXT, configSaveContext);
  setContext(GLOBAL_FILTERS_CONTEXT, globalFilters);

  // A conventional navigation (a deep link, browser history, or a link in the
  // content) should still reveal the menu belonging to its destination. Area
  // selection itself leaves the URL untouched, so it does not re-run this.
  $effect(() => {
    selectedNavigationMode = navigationMode(page.url.pathname);
  });

  onMount(() => {
    cardScale.set(initialSettings.recordsCardLevel);
    void refreshWorkspaceSnapshot();

    return () => {
      if (saveFeedbackTimeout) clearTimeout(saveFeedbackTimeout);
    };
  });

  function toggleSidebar(): void {
    collapsed = !collapsed;
    const settings = currentSettings();
    settings.sidebarDefault = collapsed ? "collapsed" : "expanded";
    void savePersonalSettings(settings);
  }

  function selectNavigationMode(mode: NavigationMode): void {
    selectedNavigationMode = mode;
  }
</script>

<div class:collapsed class="app-shell">
  <Sidebar
    {collapsed}
    onToggle={toggleSidebar}
    selectedMode={selectedNavigationMode}
    onSelectMode={selectNavigationMode}
  />

  <div class="workspace">
    <Topbar initialProfile={initialSettings.profile} />
    <main
      class:fixed-viewport-page={hasFixedViewportContent}
      id="conteudo-principal"
      tabindex="-1"
    >
      <div class="page-width">{@render children()}</div>
    </main>
  </div>

  <MobileDock
    selectedMode={selectedNavigationMode}
    onSelectMode={selectNavigationMode}
  />
</div>

<style>
  .app-shell {
    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    width: 100%;
    height: 100dvh;
    overflow: hidden;
    transition: grid-template-columns var(--motion-base) ease;
  }
  .app-shell.collapsed {
    grid-template-columns: var(--sidebar-collapsed-width) minmax(0, 1fr);
  }
  .workspace {
    display: flex;
    min-width: 0;
    height: 100dvh;
    flex-direction: column;
  }
  main {
    --shell-content-padding: var(--main-padding);
    --shell-content-padding-block-end: var(--main-padding);

    min-height: 0;
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--main-background);
    scroll-behavior: smooth;
  }
  .page-width {
    box-sizing: border-box;
    width: 100%;
    min-height: 100%;
    min-width: 0;
    padding: var(--shell-content-padding);
    padding-bottom: var(--shell-content-padding-block-end);
  }
  main.fixed-viewport-page .page-width {
    height: 100%;
  }
  @media (max-width: 920px) {
    .app-shell,
    .app-shell.collapsed {
      grid-template-columns: minmax(0, 1fr);
    }
    main {
      --shell-content-padding: 10px;
      --shell-content-padding-block-end: calc(
        86px + env(safe-area-inset-bottom)
      );
    }
  }
</style>
