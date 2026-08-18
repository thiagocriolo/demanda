<script lang="ts">
  import { Check } from "@lucide/svelte";
  import { untrack } from "svelte";
  import type {
    EvaluationReview,
    EvaluationToolConfig,
    EvaluationToolResponse,
    EvaluationUseContent,
  } from "../types";

  let { config, content, initial, pending, onsubmit } = $props<{
    config: EvaluationToolConfig;
    content: EvaluationUseContent;
    initial?: EvaluationToolResponse;
    pending: boolean;
    onsubmit: (payload: EvaluationToolResponse) => void;
  }>();
  const seed = untrack(() => ({ content, initial }));
  let reviews = $state<Record<string, EvaluationReview>>(
    Object.fromEntries(
      seed.content.items.map((item: EvaluationUseContent["items"][number]) => {
        const saved = seed.initial?.reviews.find(
          ({ itemId }: EvaluationReview) => itemId === item.id,
        );
        return [
          item.id,
          saved
            ? structuredClone(saved)
            : { itemId: item.id, rating: 0, attributes: [], comment: "" },
        ];
      }),
    ),
  );

  function toggle(itemId: string, attribute: string): void {
    const review = reviews[itemId];
    if (!review) return;
    review.attributes = review.attributes.includes(attribute)
      ? review.attributes.filter((item) => item !== attribute)
      : [...review.attributes, attribute];
  }
</script>

<form
  class="tool-response-form"
  onsubmit={(event) => {
    event.preventDefault();
    onsubmit({
      kind: "evaluation",
      reviews: content.items.map(
        ({ id }: EvaluationUseContent["items"][number]) => reviews[id],
      ),
    });
  }}
>
  <div class="tool-review-list">
    {#each content.items as item, index (item.id)}
      {@const review = reviews[item.id]}
      <article class="tool-review-card">
        <div class="tool-review-card__index">
          {index + 1} de {content.items.length}
        </div>
        <div class="tool-review-media">
          {#each item.assets as asset}<img
              src={asset.url}
              alt={asset.name}
            />{/each}
        </div>
        <div class="tool-review-copy">
          <h3>{item.title}</h3>
          {#if item.description}<p>{item.description}</p>{/if}
        </div>
        <fieldset class="tool-rating">
          <legend>Como você avalia esta referência?</legend>
          <div>
            {#each config.scale as option}<label
                class:active={review.rating === option.value}
                ><input
                  type="radio"
                  name={`rating-${item.id}`}
                  value={option.value}
                  required
                  checked={review.rating === option.value}
                  onchange={() => (review.rating = option.value)}
                /><span
                  >{#if review.rating === option.value}<Check
                      size={14}
                    />{/if}<strong>{option.label}</strong></span
                ></label
              >{/each}
          </div>
        </fieldset>
        {#if config.attributes.length}<fieldset class="tool-attributes">
            <legend>Do que você gostou?</legend>
            <div>
              {#each config.attributes as attribute}<label
                  class:active={review.attributes.includes(attribute)}
                  ><input
                    type="checkbox"
                    checked={review.attributes.includes(attribute)}
                    onchange={() => toggle(item.id, attribute)}
                  /><span>{attribute}</span></label
                >{/each}
            </div>
          </fieldset>{/if}
        <label class="tool-field"
          ><span>Comentário {config.commentRequired ? "*" : "(opcional)"}</span
          ><textarea
            rows="3"
            required={config.commentRequired}
            bind:value={review.comment}></textarea></label
        >
      </article>
    {/each}
  </div>
  <button
    class="tool-primary-button tool-submit-response"
    type="submit"
    disabled={pending}
    >{pending
      ? "Enviando…"
      : initial
        ? "Atualizar avaliação"
        : "Enviar avaliação"}</button
  >
</form>
