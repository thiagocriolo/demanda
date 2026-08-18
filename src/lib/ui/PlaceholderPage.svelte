<script lang="ts">
  import { LayoutDashboard } from "@lucide/svelte";
  import NextStepCard from "./NextStepCard.svelte";
  import PageHeader from "./PageHeader.svelte";

  let {
    title,
    description,
    icon = LayoutDashboard,
  } = $props<{
    title: string;
    description: string;
    icon?: typeof LayoutDashboard;
  }>();
</script>

<PageHeader eyebrow="Módulo preparado" {title} {icon} />

<section aria-label={`Conteúdo de ${title}`}>
  <div class="placeholder-body">
    <p>{description}</p>
    <NextStepCard />
  </div>
</section>

<style>
  section {
    position: relative;
    width: 100%;
    min-height: 250px;
    overflow: hidden;
    padding: clamp(26px, 5vw, 54px);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    isolation: isolate;
  }
  section::after {
    position: absolute;
    top: -110px;
    right: -90px;
    width: 310px;
    height: 310px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--brand-100), transparent 68%);
    content: "";
    opacity: 0.72;
  }
  .placeholder-body {
    position: relative;
    z-index: 1;
  }
  p {
    max-width: 540px;
    color: var(--ink-500);
    font-size: var(--text-sm);
    line-height: 1.65;
  }
</style>
