<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    children,
    compact = false,
    brandFooter = false,
  } = $props<{
    children: Snippet;
    compact?: boolean;
    brandFooter?: boolean;
  }>();
</script>

<main class:compact class:brand-footer={brandFooter} class="auth-page">
  {#if !brandFooter}
    <a class="auth-brand" href="/login" aria-label="Demanda — página de acesso">
      <strong>D</strong><span>emanda</span>
    </a>
  {/if}
  <section class="auth-card">
    {@render children()}
  </section>
  {#if brandFooter}
    <a class="auth-brand" href="/login" aria-label="Demanda — página de acesso">
      <strong>D</strong><span>emanda</span>
    </a>
  {/if}
</main>
