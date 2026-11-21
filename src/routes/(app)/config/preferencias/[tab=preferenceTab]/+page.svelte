<script lang="ts">
  import { page } from "$app/state";
  import PreferencesSettings from "../../../preferencias/+page.svelte";
  import type { PreferenceTab } from "$lib/settings/routes";

  let activeTab = $derived(page.params.tab as PreferenceTab);
</script>

<PreferencesSettings initialTab={activeTab} />
