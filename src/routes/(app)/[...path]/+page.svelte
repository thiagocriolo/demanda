<script lang="ts">
  import { page } from "$app/state";
  import PlaceholderPage from "$lib/ui/PlaceholderPage.svelte";
  import { allNavigation } from "$lib/shell/navigation";
  import { resolvePageTitle } from "$lib/shell/page-title";

  let pathname = $derived(decodeURIComponent(page.url.pathname));
  let title = $derived(resolvePageTitle(pathname));
  let item = $derived(
    allNavigation.find(
      ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
    ),
  );
</script>

<svelte:head><title>{title} · Demanda</title></svelte:head>

<PlaceholderPage
  {title}
  icon={item?.icon}
  description="A estrutura desta área já está pronta. O conteúdo será implementado na próxima etapa."
/>
