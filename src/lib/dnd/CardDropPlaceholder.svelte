<script lang="ts">
  let {
    height = 92,
    width,
    compact = false,
  } = $props<{
    height?: number;
    width?: number;
    compact?: boolean;
  }>();
</script>

<div
  class:compact
  class="card-drop-placeholder"
  style={`--drop-height: ${Math.max(compact ? 44 : 64, height)}px;${width ? ` --drop-width: ${width}px;` : ""}`}
  role="presentation"
  aria-hidden="true"
>
  <span>Solte o card aqui</span>
</div>

<style>
  .card-drop-placeholder {
    display: grid;
    width: var(--drop-width, 100%);
    min-width: 0;
    height: var(--drop-height);
    flex: 0 0 var(--drop-width, auto);
    border: 2px dashed
      color-mix(
        in srgb,
        var(--column-color, var(--brand-600)) 52%,
        var(--border)
      );
    border-radius: var(--radius-lg);
    color: color-mix(
      in srgb,
      var(--column-color, var(--brand-600)) 74%,
      var(--ink-600)
    );
    background: color-mix(
      in srgb,
      var(--column-color, var(--brand-600)) 8%,
      var(--surface)
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--column-color, var(--brand-600)) 9%, transparent);
    animation: destination-in var(--motion-fast) ease both;
    place-items: center;
    pointer-events: none;
  }

  .card-drop-placeholder span {
    padding: 4px 8px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--surface) 82%, transparent);
    font-size: 10px;
    font-weight: 600;
  }

  .card-drop-placeholder.compact span {
    font-size: 9px;
  }

  @keyframes destination-in {
    from {
      opacity: 0;
      transform: scale(0.985);
    }
  }
</style>
