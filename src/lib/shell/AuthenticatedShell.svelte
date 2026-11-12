<script lang="ts">
  import { browser } from "$app/environment";
  import { type Snippet } from "svelte";
  import EntityCreateProvider from "$lib/entities/EntityCreateProvider.svelte";
  import RecordAssistant from "$lib/assistant/RecordAssistant.svelte";
  import { initializeSettingsSession } from "$lib/settings/client";
  import { mergeSettingsScopes } from "$lib/settings/defaults";
  import type { SettingsSnapshot } from "$lib/settings/types";
  import { initializeWorkspaceSession } from "$lib/workspaces/workspace-storage";
  import AppShell from "./AppShell.svelte";

  type WorkspaceSessionData = Parameters<typeof initializeWorkspaceSession>[0];

  let { children, shellData } = $props<{
    children: Snippet;
    shellData: {
      authenticatedUser: WorkspaceSessionData["authenticatedUser"];
      activeWorkspace: {
        workspace: WorkspaceSessionData["activeWorkspace"];
      } | null;
      settingsSnapshot: SettingsSnapshot;
    };
  }>();

  let initialSettings = $derived(
    mergeSettingsScopes(
      shellData.settingsSnapshot.personal.settings,
      shellData.settingsSnapshot.workspace.settings,
    ),
  );

  function initializeClientSettings(): void {
    if (browser) initializeSettingsSession(shellData.settingsSnapshot);
  }

  initializeClientSettings();

  $effect(() =>
    initializeWorkspaceSession({
      authenticatedUser: shellData.authenticatedUser,
      activeWorkspace: shellData.activeWorkspace?.workspace,
    }),
  );
</script>

<EntityCreateProvider>
  <AppShell {initialSettings}>{@render children()}</AppShell>
  <RecordAssistant />
</EntityCreateProvider>
