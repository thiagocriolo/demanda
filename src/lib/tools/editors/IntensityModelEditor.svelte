<script lang="ts">
  import { Plus, Trash2 } from "@lucide/svelte";
  import type { IntensityScale, IntensityToolConfig } from "../types";

  let { config, onchange } = $props<{
    config: IntensityToolConfig;
    onchange: (config: IntensityToolConfig) => void;
  }>();

  function update(values: Partial<IntensityToolConfig>): void {
    onchange({ ...config, ...values });
  }

  function updateScale(
    index: number,
    values: Partial<IntensityToolConfig["scales"][number]>,
  ): void {
    update({
      scales: config.scales.map((scale: IntensityScale, scaleIndex: number) =>
        scaleIndex === index ? { ...scale, ...values } : scale,
      ),
    });
  }

  function addScale(): void {
    update({
      scales: [
        ...config.scales,
        {
          id: crypto.randomUUID(),
          leftLabel: "Discreto",
          rightLabel: "Ousado",
        },
      ],
    });
  }
</script>

<label class="tool-field tool-field--full">
  <span>Instruções para o participante</span>
  <textarea
    rows="3"
    maxlength="1600"
    value={config.instructions}
    oninput={(event) => update({ instructions: event.currentTarget.value })}
  ></textarea>
</label>

<div class="tool-editor-heading">
  <div>
    <strong>Escalas bipolares</strong><small
      >{config.scales.length} escalas</small
    >
  </div>
  <button class="tool-secondary-button" type="button" onclick={addScale}>
    <Plus size={15} /> Adicionar escala
  </button>
</div>

<div class="tool-stack">
  {#each config.scales as scale, index (scale.id)}
    <article class="tool-editor-card tool-editor-card--compact">
      <div class="tool-editor-card__body">
        <div class="tool-grid tool-grid--poles">
          <label class="tool-field"
            ><span>Extremo esquerdo</span><input
              value={scale.leftLabel}
              maxlength="80"
              required
              oninput={(event) =>
                updateScale(index, { leftLabel: event.currentTarget.value })}
            /></label
          >
          <span class="tool-pole-arrow">↔</span>
          <label class="tool-field"
            ><span>Extremo direito</span><input
              value={scale.rightLabel}
              maxlength="80"
              required
              oninput={(event) =>
                updateScale(index, { rightLabel: event.currentTarget.value })}
            /></label
          >
        </div>
      </div>
      <button
        class="tool-icon-button tool-icon-button--danger"
        type="button"
        aria-label="Remover escala"
        disabled={config.scales.length === 1}
        onclick={() =>
          update({
            scales: config.scales.filter(
              (_scale: IntensityScale, scaleIndex: number) =>
                scaleIndex !== index,
            ),
          })}><Trash2 size={16} /></button
      >
    </article>
  {/each}
</div>
