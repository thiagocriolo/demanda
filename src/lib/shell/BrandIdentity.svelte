<script lang="ts">
  let { collapsed } = $props<{ collapsed: boolean }>();
</script>

<a class:collapsed href="/dashboard" aria-label="Demanda — página inicial">
  <span class="mark">D</span>
  <span class="name">Demanda</span>
</a>

<style>
  a {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 11px;
    color: white;
  }
  .mark {
    display: grid;
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    place-items: center;
    border-radius: 11px;
    background: var(--brand-600);
    font-weight: 750;
  }
  .name {
    overflow: hidden;
    font-size: 1.06rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  a.collapsed {
    flex: 0 0 auto;
  }
  .collapsed .name {
    display: none;
  }
</style>
