<script lang="ts">
  import AuthenticatedShell from "$lib/shell/AuthenticatedShell.svelte";

  let { children, data } = $props();
</script>

{#if data.shellData}
  <AuthenticatedShell shellData={data.shellData}>
    {@render children()}
  </AuthenticatedShell>
{:else}
  {@render children()}
{/if}
