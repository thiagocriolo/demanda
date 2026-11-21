<script lang="ts">
  import { page } from "$app/state";
  import InterfaceSettings from "../+page.svelte";
  import type { PageData } from "./$types";
  import type { InterfaceTab } from "$lib/settings/routes";

  let { data }: { data: PageData } = $props();
  let activeTab = $derived(page.params.tab as InterfaceTab);
</script>

<InterfaceSettings {data} initialTab={activeTab} />
