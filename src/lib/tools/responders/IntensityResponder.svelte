<script lang="ts">
  import type {
    IntensityScale,
    IntensityToolConfig,
    IntensityToolResponse,
  } from "../types";
  import { untrack } from "svelte";

  let { config, initial, pending, onsubmit } = $props<{
    config: IntensityToolConfig;
    initial?: IntensityToolResponse;
    pending: boolean;
    onsubmit: (payload: IntensityToolResponse) => void;
  }>();
  const seed = untrack(() => initial);
  let values = $state<Record<string, number>>(
    Object.fromEntries(
      seed?.values.map(
        ({ scaleId, value }: IntensityToolResponse["values"][number]) => [
          scaleId,
          value,
        ],
      ) ?? [],
    ),
  );
  let allAnswered = $derived(
    config.scales.every(({ id }: IntensityScale) => values[id] !== undefined),
  );
</script>

<form
  class="tool-response-form"
  onsubmit={(event) => {
    event.preventDefault();
    if (allAnswered)
      onsubmit({
        kind: "intensity",
        values: config.scales.map(({ id }: IntensityScale) => ({
          scaleId: id,
          value: values[id],
        })),
      });
  }}
>
  <div class="tool-intensity-list">
    {#each config.scales as scale (scale.id)}
      <fieldset
        class="tool-intensity-scale"
        class:unanswered={values[scale.id] === undefined}
      >
        <legend
          ><span>{scale.leftLabel}</span><span>{scale.rightLabel}</span></legend
        >
        <div class="tool-range-wrap">
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={values[scale.id] ?? 50}
            aria-label={`${scale.leftLabel} a ${scale.rightLabel}`}
            oninput={(event) =>
              (values[scale.id] = Number(event.currentTarget.value))}
          />
          {#if values[scale.id] === undefined}<span class="tool-range-prompt"
              >Mova para responder</span
            >{/if}
        </div>
      </fieldset>
    {/each}
  </div>
  {#if !allAnswered}<p class="tool-answer-hint">
      Responda a todas as escalas antes de finalizar.
    </p>{/if}
  <button
    class="tool-primary-button tool-submit-response"
    type="submit"
    disabled={pending || !allAnswered}
    >{pending
      ? "Enviando…"
      : initial
        ? "Atualizar posições"
        : "Enviar posições"}</button
  >
</form>
