<script lang="ts">
  let { value } = $props<{ value: number }>();
</script>

<div
  class="progress"
  style={`--progress: ${value}%`}
  aria-label={`${value}% da carga semanal realizada`}
>
  <div><strong>{value}%</strong><span>realizado</span></div>
</div>

<style>
  .progress {
    display: grid;
    width: 122px;
    height: 122px;
    place-items: center;
    border-radius: 50%;
    background: conic-gradient(
      var(--brand-600) 0 var(--progress),
      var(--brand-100) var(--progress) 100%
    );
  }
  .progress::before {
    position: absolute;
    width: 90px;
    height: 90px;
    border-radius: 50%;
    background: white;
    content: "";
  }
  .progress div {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
  }
  strong {
    color: var(--ink-950);
    font-size: 1.35rem;
    letter-spacing: -0.04em;
  }
  span {
    color: var(--ink-400);
    font-size: 0.65rem;
  }
</style>
