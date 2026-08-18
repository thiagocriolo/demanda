<script lang="ts">
  import AuthenticatedShell from "$lib/shell/AuthenticatedShell.svelte";
  let { children, data } = $props();
</script>

<AuthenticatedShell shellData={data}>{@render children()}</AuthenticatedShell>
