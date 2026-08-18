<script lang="ts">
  import { FileCheck2, SlidersHorizontal } from "@lucide/svelte";
  import type { ToolConfig, ToolUseContent } from "../types";
  import ComparisonUseEditor from "./ComparisonUseEditor.svelte";
  import EvaluationUseEditor from "./EvaluationUseEditor.svelte";

  let { config, content, onchange } = $props<{
    config: ToolConfig;
    content: ToolUseContent;
    onchange: (content: ToolUseContent) => void;
  }>();
</script>

{#if config.kind === "evaluation" && content.kind === "evaluation"}
  <EvaluationUseEditor {content} {onchange} />
{:else if config.kind === "comparison" && content.kind === "comparison"}
  <ComparisonUseEditor {content} {onchange} />
{:else if config.kind === "form" && content.kind === "form"}
  <div class="tool-content-inherited">
    <FileCheck2 size={25} />
    <div>
      <strong>Estrutura herdada do Modelo</strong>
      <p>
        As perguntas já estão prontas. Este Uso receberá respostas sem alterar o
        Modelo original.
      </p>
    </div>
  </div>
{:else if config.kind === "intensity" && content.kind === "intensity"}
  <div class="tool-content-inherited">
    <SlidersHorizontal size={25} />
    <div>
      <strong>{config.scales.length} escalas herdadas do Modelo</strong>
      <p>
        As posições escolhidas pelos participantes serão registradas
        separadamente neste Uso.
      </p>
    </div>
  </div>
{/if}
