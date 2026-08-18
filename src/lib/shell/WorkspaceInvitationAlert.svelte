<script lang="ts">
  import {
    loadPendingWorkspaceInvitations,
    observeWorkspaces,
  } from "$lib/workspaces/workspace-storage";
  import { MailWarning } from "@lucide/svelte";
  import { onMount } from "svelte";

  let count = $state(0);
  function refresh(): void {
    count = loadPendingWorkspaceInvitations().length;
  }
  onMount(() => {
    refresh();
    return observeWorkspaces(refresh);
  });
</script>

{#if count > 0}
  <a
    href="/dashboard?dashboard_control=pendencias"
    aria-label={`${count} convite(s) de workspace aguardando aceite`}
    title="Convites de workspace pendentes"
  >
    <MailWarning size={18} />
    <span>{count}</span>
  </a>
{/if}

<style>
  a {
    position: relative;
    display: grid;
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--amber-500) 35%, var(--border));
    border-radius: 11px;
    color: #9a5d00;
    background: color-mix(in srgb, var(--amber-500) 11%, white);
  }
  a:hover {
    border-color: var(--amber-500);
    background: color-mix(in srgb, var(--amber-500) 17%, white);
  }
  span {
    position: absolute;
    top: -5px;
    right: -5px;
    display: grid;
    min-width: 18px;
    height: 18px;
    place-items: center;
    padding-inline: 4px;
    border: 2px solid white;
    border-radius: 20px;
    color: white;
    background: var(--red-500);
    font-size: 9px;
    font-weight: 800;
  }
</style>
