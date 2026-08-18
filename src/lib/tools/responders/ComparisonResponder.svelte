<script lang="ts">
  import { CheckCircle2 } from "@lucide/svelte";
  import { untrack } from "svelte";
  import type {
    ComparisonToolConfig,
    ComparisonToolResponse,
    ComparisonUseContent,
  } from "../types";

  let { config, content, initial, pending, onsubmit } = $props<{
    config: ComparisonToolConfig;
    content: ComparisonUseContent;
    initial?: ComparisonToolResponse;
    pending: boolean;
    onsubmit: (payload: ComparisonToolResponse) => void;
  }>();
  const seed = untrack(() => initial);
  let alternativeId = $state(seed?.alternativeId ?? "");
  let comment = $state(seed?.comment ?? "");
</script>

<form
  class="tool-response-form"
  onsubmit={(event) => {
    event.preventDefault();
    onsubmit({ kind: "comparison", alternativeId, comment });
  }}
>
  <h3 class="tool-comparison-question">{config.question}</h3>
  <div class="tool-comparison-grid">
    {#each content.alternatives as alternative, index (alternative.id)}
      <label
        class="tool-comparison-option"
        class:active={alternativeId === alternative.id}
      >
        <input
          type="radio"
          name="alternative"
          value={alternative.id}
          required
          bind:group={alternativeId}
        />
        <div class="tool-comparison-media">
          {#each alternative.assets as asset}<img
              src={asset.url}
              alt={asset.name}
            />{/each}
        </div>
        <div class="tool-comparison-copy">
          <span>Alternativa {String.fromCharCode(65 + index)}</span><strong
            >{alternative.title}</strong
          >{#if alternative.description}<p>{alternative.description}</p>{/if}
        </div>
        <span class="tool-choice-mark"><CheckCircle2 size={20} /></span>
      </label>
    {/each}
  </div>
  <label class="tool-field tool-field--full"
    ><span
      >Por que você escolheu esta alternativa? {config.commentRequired
        ? "*"
        : "(opcional)"}</span
    ><textarea rows="4" required={config.commentRequired} bind:value={comment}
    ></textarea></label
  >
  <button
    class="tool-primary-button tool-submit-response"
    type="submit"
    disabled={pending}
    >{pending
      ? "Enviando…"
      : initial
        ? "Atualizar escolha"
        : "Enviar escolha"}</button
  >
</form>
