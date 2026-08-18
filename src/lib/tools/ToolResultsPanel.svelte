<script lang="ts">
  import { BarChart3, MessageSquareText, UsersRound } from "@lucide/svelte";
  import type {
    EvaluationReview,
    EvaluationScaleOption,
    FormField,
    IntensityToolResponse,
    ToolResponse,
    ToolUse,
  } from "./types";

  let { use, responses } = $props<{
    use: ToolUse;
    responses: ToolResponse[];
  }>();

  function evaluationAverage(itemId: string): number | null {
    const values: number[] = responses.flatMap(({ payload }: ToolResponse) =>
      payload.kind === "evaluation"
        ? payload.reviews
            .filter((review: EvaluationReview) => review.itemId === itemId)
            .map(({ rating }: EvaluationReview) => rating)
        : [],
    );
    return values.length
      ? values.reduce((total: number, value: number) => total + value, 0) /
          values.length
      : null;
  }

  function intensityAverage(scaleId: string): number | null {
    const values: number[] = responses.flatMap(({ payload }: ToolResponse) =>
      payload.kind === "intensity"
        ? payload.values
            .filter(
              (item: IntensityToolResponse["values"][number]) =>
                item.scaleId === scaleId,
            )
            .map(({ value }: IntensityToolResponse["values"][number]) => value)
        : [],
    );
    return values.length
      ? values.reduce((total: number, value: number) => total + value, 0) /
          values.length
      : null;
  }

  function comparisonCount(alternativeId: string): number {
    return responses.filter(
      ({ payload }: ToolResponse) =>
        payload.kind === "comparison" &&
        payload.alternativeId === alternativeId,
    ).length;
  }
</script>

{#if responses.length === 0}
  <div class="tool-results-empty">
    <BarChart3 size={28} /><strong>Nenhuma resposta ainda</strong><span
      >Os resultados aparecerão aqui de forma estruturada.</span
    >
  </div>
{:else}
  <div class="tool-result-summary">
    <span><UsersRound size={18} /></span>
    <div>
      <strong>{responses.length}</strong><small
        >{responses.length === 1 ? "participante" : "participantes"}</small
      >
    </div>
  </div>
  {#if use.configSnapshot.kind === "form"}
    <div class="tool-result-list">
      {#each use.configSnapshot.fields.filter(({ kind }: FormField) => kind !== "section") as field (field.id)}
        <section class="tool-result-card">
          <h3>{field.label}</h3>
          <div class="tool-answer-list">
            {#each responses as response (response.id)}{#if response.payload.kind === "form"}<article
                >
                  <strong>{response.respondent.name}</strong>
                  <p>
                    {Array.isArray(response.payload.answers[field.id])
                      ? (response.payload.answers[field.id] as string[]).join(
                          ", ",
                        )
                      : String(
                          response.payload.answers[field.id] ?? "Sem resposta",
                        )}
                  </p>
                </article>{/if}{/each}
          </div>
        </section>
      {/each}
    </div>
  {:else if use.configSnapshot.kind === "evaluation" && use.content.kind === "evaluation"}
    <div class="tool-result-list">
      {#each use.content.items as item (item.id)}
        {@const average = evaluationAverage(item.id)}
        <section class="tool-result-card tool-evaluation-result">
          <div class="tool-result-media">
            {#each item.assets.slice(0, 1) as asset}<img
                src={asset.url}
                alt={asset.name}
              />{/each}
          </div>
          <div>
            <span>Média {average === null ? "—" : average.toFixed(1)}</span>
            <h3>{item.title}</h3>
            <div class="tool-answer-list">
              {#each responses as response (response.id)}{@const review =
                  response.payload.kind === "evaluation"
                    ? response.payload.reviews.find(
                        ({ itemId }: EvaluationReview) => itemId === item.id,
                      )
                    : undefined}{#if review}<article>
                    <strong
                      >{response.respondent.name} · {use.configSnapshot.scale.find(
                        ({ value }: EvaluationScaleOption) =>
                          value === review.rating,
                      )?.label ?? review.rating}</strong
                    >{#if review.attributes.length}<small
                        >{review.attributes.join(" · ")}</small
                      >{/if}{#if review.comment}<p>
                        <MessageSquareText size={13} />
                        {review.comment}
                      </p>{/if}
                  </article>{/if}{/each}
            </div>
          </div>
        </section>
      {/each}
    </div>
  {:else if use.configSnapshot.kind === "comparison" && use.content.kind === "comparison"}
    <div class="tool-comparison-results">
      {#each use.content.alternatives as alternative, index (alternative.id)}
        {@const votes = comparisonCount(alternative.id)}
        <article class="tool-result-card">
          <div class="tool-result-media">
            {#each alternative.assets.slice(0, 1) as asset}<img
                src={asset.url}
                alt={asset.name}
              />{/each}
          </div>
          <span>Alternativa {String.fromCharCode(65 + index)}</span>
          <h3>{alternative.title}</h3>
          <strong class="tool-vote-count"
            >{votes} {votes === 1 ? "escolha" : "escolhas"}</strong
          >
        </article>
      {/each}
    </div>
    <div class="tool-answer-list tool-comments">
      {#each responses as response (response.id)}{#if response.payload.kind === "comparison" && response.payload.comment}<article
          >
            <strong>{response.respondent.name}</strong>
            <p>{response.payload.comment}</p>
          </article>{/if}{/each}
    </div>
  {:else if use.configSnapshot.kind === "intensity"}
    <div class="tool-intensity-results">
      {#each use.configSnapshot.scales as scale (scale.id)}
        {@const average = intensityAverage(scale.id)}
        <article class="tool-result-card">
          <div class="tool-result-poles">
            <strong>{scale.leftLabel}</strong><strong>{scale.rightLabel}</strong
            >
          </div>
          <div class="tool-result-track">
            {#if average !== null}<span style={`left:${average}%`}></span>{/if}
          </div>
          <small
            >{average === null
              ? "Sem respostas"
              : `Posição média de ${responses.length} resposta${responses.length === 1 ? "" : "s"}`}</small
          >
        </article>
      {/each}
    </div>
  {/if}
{/if}
