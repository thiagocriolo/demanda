<script lang="ts">
  import type { ComparisonToolConfig } from "../types";

  let { config, onchange } = $props<{
    config: ComparisonToolConfig;
    onchange: (config: ComparisonToolConfig) => void;
  }>();

  function update(values: Partial<ComparisonToolConfig>): void {
    onchange({ ...config, ...values });
  }
</script>

<label class="tool-field tool-field--full">
  <span>Pergunta da comparação</span>
  <input
    value={config.question}
    maxlength="240"
    required
    oninput={(event) => update({ question: event.currentTarget.value })}
  />
</label>
<label class="tool-field tool-field--full">
  <span>Instruções para o participante</span>
  <textarea
    rows="4"
    maxlength="1600"
    value={config.instructions}
    oninput={(event) => update({ instructions: event.currentTarget.value })}
  ></textarea>
</label>
<label class="tool-check">
  <input
    type="checkbox"
    checked={config.commentRequired}
    onchange={(event) =>
      update({ commentRequired: event.currentTarget.checked })}
  />
  <span>Exigir justificativa da escolha</span>
</label>
