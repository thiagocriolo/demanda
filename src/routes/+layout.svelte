<script lang="ts">
  import "../styles/tokens.css";
  import "../styles/base.css";
  import "../styles/tabs.css";

  let { children } = $props();
</script>

<svelte:head>
  <title>Demanda</title>
  <meta
    name="description"
    content="Organize demandas, prazos e pessoas em um só lugar."
  />
  <link rel="icon" href="/favicon.svg" />
</svelte:head>

{@render children()}
