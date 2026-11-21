<script lang="ts">
  import { page } from "$app/state";
  import SystemSettings from "../+page.svelte";
  import type { ActionData, PageData } from "./$types";
  import type { SystemTab } from "$lib/settings/routes";

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let activeTab = $derived(page.params.tab as SystemTab);
</script>

<SystemSettings {data} {form} initialTab={activeTab} />
