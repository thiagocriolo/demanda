<script lang="ts">
  import { page } from "$app/state";
  import { getContext } from "svelte";
  import CardScaleControl from "$lib/ui/CardScaleControl.svelte";
  import GlobalFilterControls from "$lib/filters/GlobalFilterControls.svelte";
  import {
    CONFIG_SAVE_CONTEXT,
    type ConfigSaveContext,
  } from "$lib/settings/config-save";
  import AccountButton from "./AccountButton.svelte";
  import CronogramaAutoScheduleButton from "./CronogramaAutoScheduleButton.svelte";
  import NotificationButton from "./NotificationButton.svelte";
  import { isConfigPath } from "./navigation";
  import TopbarSaveButton from "./TopbarSaveButton.svelte";
  import type { SettingsState } from "$lib/settings/types";

  let { initialProfile } = $props<{
    initialProfile: SettingsState["profile"];
  }>();
  const configSave = getContext<ConfigSaveContext>(CONFIG_SAVE_CONTEXT);

  let showCardScale = $derived(
    page.url.pathname === "/registros" ||
      page.url.pathname.startsWith("/registros/"),
  );
  let showSave = $derived(
    (isConfigPath(page.url.pathname) ||
      page.url.pathname.replace(/\/$/, "") === "/social/usuario") &&
      configSave.state.active &&
      (configSave.state.dirty || configSave.state.saving),
  );
  let showGlobalFilters = $derived(
    ["/pauta", "/agenda"].includes(page.url.pathname.replace(/\/$/, "")),
  );
  let showCronogramaAutoSchedule = $derived(
    page.url.pathname.replace(/\/$/, "") === "/cronograma",
  );
</script>

<div class="actions">
  {#if showCardScale}<CardScaleControl compact />{/if}
  {#if showSave}<TopbarSaveButton />{/if}
  {#if showCronogramaAutoSchedule}<CronogramaAutoScheduleButton />{/if}
  {#if showGlobalFilters}<GlobalFilterControls />{/if}
  <NotificationButton />
  <span class="divider" aria-hidden="true"></span>
  <AccountButton {initialProfile} />
</div>

<style>
  .actions {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .divider {
    width: 1px;
    height: 28px;
    margin-inline: 3px;
    background: var(--border);
  }
  @media (max-width: 560px) {
    .divider {
      display: none;
    }
  }
</style>
