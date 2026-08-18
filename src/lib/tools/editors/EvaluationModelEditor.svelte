<script lang="ts">
  import type { EvaluationScaleOption, EvaluationToolConfig } from "../types";

  let { config, onchange } = $props<{
    config: EvaluationToolConfig;
    onchange: (config: EvaluationToolConfig) => void;
  }>();

  function update(values: Partial<EvaluationToolConfig>): void {
    onchange({ ...config, ...values });
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

<div class="tool-section-card">
  <div class="tool-editor-heading">
    <div>
      <strong>Escala visual</strong><small
        >Da menor para a maior avaliação</small
      >
    </div>
  </div>
  <div class="tool-rating-editor">
    {#each config.scale as option, index (option.value)}
      <label class="tool-field">
        <span>Nível {index + 1}</span>
        <input
          value={option.label}
          maxlength="80"
          required
          oninput={(event) =>
            update({
              scale: config.scale.map((item: EvaluationScaleOption) =>
                item.value === option.value
                  ? { ...item, label: event.currentTarget.value }
                  : item,
              ),
            })}
        />
      </label>
    {/each}
  </div>
</div>

<label class="tool-field tool-field--full">
  <span>Características selecionáveis <small>uma por linha</small></span>
  <textarea
    rows="5"
    value={config.attributes.join("\n")}
    placeholder="Tipografia&#10;Cores&#10;Formas"
    oninput={(event) =>
      update({
        attributes: event.currentTarget.value
          .split("\n")
          .map((attribute) => attribute.trim())
          .filter(Boolean),
      })}></textarea>
</label>

<label class="tool-check">
  <input
    type="checkbox"
    checked={config.commentRequired}
    onchange={(event) =>
      update({ commentRequired: event.currentTarget.checked })}
  />
  <span>Exigir comentário em cada referência</span>
</label>
