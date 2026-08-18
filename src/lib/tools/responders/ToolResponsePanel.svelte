<script lang="ts">
  import type { ToolResponsePayload, ToolUse } from "../types";
  import ComparisonResponder from "./ComparisonResponder.svelte";
  import EvaluationResponder from "./EvaluationResponder.svelte";
  import FormResponder from "./FormResponder.svelte";
  import IntensityResponder from "./IntensityResponder.svelte";

  let { use, initial, pending, onsubmit } = $props<{
    use: ToolUse;
    initial?: ToolResponsePayload;
    pending: boolean;
    onsubmit: (payload: ToolResponsePayload) => void;
  }>();
</script>

{#if use.configSnapshot.kind === "form" && use.content.kind === "form"}
  <FormResponder
    config={use.configSnapshot}
    initial={initial?.kind === "form" ? initial : undefined}
    {pending}
    {onsubmit}
  />
{:else if use.configSnapshot.kind === "evaluation" && use.content.kind === "evaluation"}
  <EvaluationResponder
    config={use.configSnapshot}
    content={use.content}
    initial={initial?.kind === "evaluation" ? initial : undefined}
    {pending}
    {onsubmit}
  />
{:else if use.configSnapshot.kind === "comparison" && use.content.kind === "comparison"}
  <ComparisonResponder
    config={use.configSnapshot}
    content={use.content}
    initial={initial?.kind === "comparison" ? initial : undefined}
    {pending}
    {onsubmit}
  />
{:else if use.configSnapshot.kind === "intensity" && use.content.kind === "intensity"}
  <IntensityResponder
    config={use.configSnapshot}
    initial={initial?.kind === "intensity" ? initial : undefined}
    {pending}
    {onsubmit}
  />
{/if}
