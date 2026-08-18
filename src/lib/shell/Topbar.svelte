<script lang="ts">
  import { page } from "$app/state";
  import CronogramaWeekNav from "./CronogramaWeekNav.svelte";
  import TopbarActions from "./TopbarActions.svelte";
  import WorkspaceInvitationAlert from "./WorkspaceInvitationAlert.svelte";
  import type { SettingsState } from "$lib/settings/types";
  import { navigationMode } from "./navigation";
  import { resolveTopbarTitle } from "./page-title";

  let { initialProfile } = $props<{
    initialProfile: SettingsState["profile"];
  }>();

  let title = $derived(resolveTopbarTitle(page.url.pathname));
  let showWorkspaceAlert = $derived(
    navigationMode(page.url.pathname) === "workspace",
  );
  let showCronogramaNavigation = $derived(
    decodeURIComponent(page.url.pathname).replace(/\/$/, "") === "/cronograma",
  );
</script>

<header class:cronograma={showCronogramaNavigation}>
  <div class="topbar-left">
    <strong>{title}</strong>
    {#if showWorkspaceAlert}
      <WorkspaceInvitationAlert />
    {/if}
  </div>

  {#if showCronogramaNavigation}
    <div class="week-navigation"><CronogramaWeekNav /></div>
  {:else}
    <a
      class="wordmark"
      href="/dashboard"
      aria-label="D Manda — ir para o dashboard"
    >
      <span class="d">D</span><span class="dot" aria-hidden="true">•</span><span
        class="manda">Manda</span
      >
    </a>
  {/if}

  <div class="topbar-right">
    <TopbarActions {initialProfile} />
  </div>
</header>

<style>
  header {
    position: relative;
    z-index: 15;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    height: var(--topbar-height);
    flex: 0 0 var(--topbar-height);
    align-items: center;
    gap: 10px;
    padding: 0 var(--card-padding);
    border-bottom: 1px solid var(--border);
    border-left: 1px solid var(--border);
    background: var(--panel);
  }
  .topbar-left {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    justify-self: start;
  }
  .topbar-left strong {
    display: block;
    max-width: 100%;
    overflow: hidden;
    color: var(--text);
    font-size: 18px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wordmark {
    display: inline-flex;
    align-items: baseline;
    justify-self: center;
    color: var(--text);
    font-size: 24px;
    line-height: 1;
    white-space: nowrap;
  }
  .week-navigation {
    justify-self: center;
  }
  .d {
    font-weight: 600;
  }
  .dot {
    margin-inline: 0.18em;
    font-weight: 400;
    transform: translateY(-0.04em);
  }
  .manda {
    font-weight: 300;
  }
  .topbar-right {
    display: flex;
    align-items: center;
    justify-self: end;
  }
  @media (max-width: 920px) {
    header {
      grid-template-columns: minmax(0, 1fr) auto;
      padding-inline: var(--main-padding);
      border-left: 0;
    }
    .wordmark {
      display: none;
    }
    .week-navigation {
      grid-column: 2;
    }
    header.cronograma .topbar-left {
      display: none;
    }
    header.cronograma .week-navigation {
      grid-column: 1;
      justify-self: start;
    }
    .topbar-left strong {
      font-size: 16px;
    }
  }
</style>
