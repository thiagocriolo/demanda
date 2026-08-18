<script lang="ts">
  import type { LucideIcon } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  let {
    title,
    eyebrow,
    icon: Icon,
    actions,
  } = $props<{
    title: string;
    eyebrow?: string;
    icon?: LucideIcon;
    actions?: Snippet;
  }>();
</script>

<header class="page-header">
  <div class="page-header__main">
    {#if Icon}
      <span class="page-header__icon" aria-hidden="true">
        <Icon size={29} strokeWidth={2.15} />
      </span>
    {/if}

    <div class="page-header__copy">
      {#if eyebrow}<span class="page-header__eyebrow">{eyebrow}</span>{/if}
      <h1>{title}</h1>
    </div>
  </div>

  {#if actions}
    <div class="page-header__actions">{@render actions()}</div>
  {/if}
</header>

<style>
  .page-header {
    --page-header-padding: clamp(20px, 2.5vw, 28px);

    position: relative;
    display: flex;
    min-height: 0;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: var(--page-header-padding);
    border: 1px solid rgba(46, 86, 255, 0.14);
    border-radius: var(--radius-xl);
    margin-bottom: 18px;
    overflow: hidden;
    background:
      radial-gradient(
        circle at 92% 8%,
        rgba(46, 86, 255, 0.1),
        transparent 28%
      ),
      linear-gradient(135deg, #ffffff 0%, #ffffff 58%, #f5f7ff 100%);
    box-shadow: 0 10px 32px rgba(15, 23, 42, 0.07);
    isolation: isolate;
  }
  .page-header::after {
    position: absolute;
    z-index: -1;
    right: -52px;
    bottom: -96px;
    width: 220px;
    height: 220px;
    border: 38px solid rgba(46, 86, 255, 0.035);
    border-radius: 50%;
    content: "";
  }
  .page-header__main {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 17px;
  }
  .page-header__copy {
    min-width: 0;
  }
  .page-header__icon {
    display: grid;
    width: 64px;
    height: 64px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.38);
    border-radius: 16px;
    color: #ffffff;
    background: linear-gradient(145deg, #5273ff, var(--brand-600));
    box-shadow:
      0 9px 20px rgba(46, 86, 255, 0.23),
      inset 0 1px 0 rgba(255, 255, 255, 0.25);
  }
  .page-header__actions {
    position: relative;
    z-index: 1;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
  }
  .page-header__eyebrow {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    margin-bottom: 6px;
    padding: 0 9px;
    border: 1px solid var(--brand-100);
    border-radius: var(--radius-pill);
    color: var(--brand-600);
    background: rgba(46, 86, 255, 0.07);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  h1 {
    color: var(--ink-950);
    font-size: clamp(var(--text-2xl), 2.4vw, 30px);
    line-height: 1.08;
    letter-spacing: -0.04em;
  }
  @media (max-width: 640px) {
    .page-header {
      align-items: stretch;
      flex-direction: column;
      padding: 20px;
    }
    .page-header__main {
      gap: 13px;
    }
    .page-header__actions {
      width: 100%;
    }
    .page-header__actions :global(button),
    .page-header__actions :global(a) {
      width: 100%;
    }
  }
</style>
