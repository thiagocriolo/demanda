<script lang="ts">
  import type { ToolConfig } from "../types";
  import ComparisonModelEditor from "./ComparisonModelEditor.svelte";
  import EvaluationModelEditor from "./EvaluationModelEditor.svelte";
  import FormModelEditor from "./FormModelEditor.svelte";
  import IntensityModelEditor from "./IntensityModelEditor.svelte";

  let { config, onchange } = $props<{
    config: ToolConfig;
    onchange: (config: ToolConfig) => void;
  }>();
</script>

{#if config.kind === "form"}
  <FormModelEditor {config} {onchange} />
{:else if config.kind === "evaluation"}
  <EvaluationModelEditor {config} {onchange} />
{:else if config.kind === "comparison"}
  <ComparisonModelEditor {config} {onchange} />
{:else}
  <IntensityModelEditor {config} {onchange} />
{/if}
