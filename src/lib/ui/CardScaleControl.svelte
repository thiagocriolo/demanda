<script lang="ts">
  import { cardScale } from "./card-scale";

  let { compact = false } = $props<{ compact?: boolean }>();
  let thumbSize = $derived(
    Math.round((12 + (($cardScale - 1) / 9) * 10) * 10) / 10,
  );
</script>

<label
  class:compact
  class="card-scale"
  title="Ajustar tamanho e detalhes dos cards"
>
  <span class="sr-only">Tamanho dos cards</span>
  <input
    type="range"
    min="1"
    max="10"
    step="1"
    bind:value={$cardScale}
    aria-valuetext={`Nível ${$cardScale} de 10`}
    style={`--card-scale-thumb: ${thumbSize}px`}
  />
</label>

<style>
  .card-scale {
    display: inline-flex;
    width: min(240px, 100%);
    min-width: 190px;
    padding: 14px 2px;
    align-items: center;
  }
  .card-scale.compact {
    width: clamp(82px, 13vw, 190px);
    min-width: 82px;
    padding-block: 10px;
  }
  input[type="range"] {
    width: 100%;
    min-width: 0;
    margin: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  }
  input[type="range"]::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--border-strong);
  }
  input[type="range"]::-webkit-slider-thumb {
    width: var(--card-scale-thumb, 16px);
    height: var(--card-scale-thumb, 16px);
    margin-top: calc((4px - var(--card-scale-thumb, 16px)) / 2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    background: var(--ink-800);
    -webkit-appearance: none;
    appearance: none;
    transition:
      width var(--motion-fast),
      height var(--motion-fast),
      margin-top var(--motion-fast);
  }
  input[type="range"]::-moz-range-track {
    height: 4px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--border-strong);
  }
  input[type="range"]::-moz-range-thumb {
    width: var(--card-scale-thumb, 16px);
    height: var(--card-scale-thumb, 16px);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    background: var(--ink-800);
    transition:
      width var(--motion-fast),
      height var(--motion-fast);
  }
  @media (max-width: 560px) {
    .card-scale.compact {
      width: clamp(72px, 24vw, 104px);
      min-width: 72px;
    }
  }
</style>
