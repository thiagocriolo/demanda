<script lang="ts">
  import {
    Bot,
    Check,
    ChevronRight,
    Clipboard,
    Download,
    FileJson2,
    Mic,
    Sparkles,
    Volume2,
  } from "@lucide/svelte";
  import { commandCatalog } from "$lib/assistant/command-catalog";

  const referencePath = "/assistente/demanda-assistant-ai-reference.md";
  const sample = `{
  "protocol": "demanda.commands/v2",
  "commands": [
    {
      "id": "contact-caleb",
      "action": "create",
      "resource": "contact",
      "data": {
        "name": "Caleb"
      }
    },
    {
      "id": "business-macajo",
      "dependsOn": ["contact-caleb"],
      "action": "create",
      "resource": "business",
      "data": {
        "name": "Macajo",
        "responsibleContactRef": "contact-caleb"
      }
    },
    {
      "id": "project-site",
      "dependsOn": ["business-macajo"],
      "action": "create",
      "resource": "project",
      "data": {
        "name": "Site",
        "businessRef": "business-macajo",
        "contractType": "pontual"
      }
    }
  ]
}`;

  let copied = $state(false);

  async function copySample(): Promise<void> {
    await navigator.clipboard.writeText(sample);
    copied = true;
    setTimeout(() => (copied = false), 1800);
  }
</script>

<svelte:head><title>Documentação do Assistente · Demanda</title></svelte:head>

<section class="hero">
  <div class="hero__copy">
    <span class="eyebrow"><Sparkles size={14} />Assistente</span>
    <h1>Transforme voz em comandos do Demanda.</h1>
    <p>
      Use uma IA de sua preferência para interpretar o que você diz, gerar um
      bloco de comandos e colá-lo no Assistente.
    </p>
    <div class="hero__actions">
      <a class="button primary" href={referencePath} download>
        <Download size={17} />Baixar referência para IA
      </a>
      <a class="button secondary" href="#primeiros-passos">
        Ver como usar<ChevronRight size={17} />
      </a>
    </div>
  </div>
  <div class="hero__visual" aria-hidden="true">
    <img src="/images/chat.svg" alt="" />
    <span class="bubble bubble--one"></span><span class="bubble bubble--two"
    ></span>
  </div>
</section>

<section id="primeiros-passos" class="section">
  <div class="section-heading">
    <span>Primeiros passos</span>
    <h2>Fale. Revise. Execute.</h2>
  </div>
  <div class="steps">
    <article>
      <span>1</span><FileJson2 size={22} />
      <h3>Baixe o arquivo</h3>
      <p>
        Envie a referência para um Projeto do ChatGPT ou para a IA que você
        usar.
      </p>
    </article>
    <article>
      <span>2</span><Mic size={22} />
      <h3>Faça seu pedido por áudio</h3>
      <p>Exemplo: “Crie o negócio Macajo para Caleb e um projeto de site”.</p>
    </article>
    <article>
      <span>3</span><Clipboard size={22} />
      <h3>Abra o link de revisão</h3>
      <p>A IA devolve um link; confira a árvore de ações antes de confirmar.</p>
    </article>
  </div>
</section>

<section class="two-column">
  <article class="guide-card">
    <div class="card-heading">
      <Volume2 size={20} />
      <h2>Usando com áudio</h2>
    </div>
    <ol>
      <li>
        Abra uma conversa no seu Projeto <strong>Comandos do Demanda</strong>.
      </li>
      <li>Use o microfone do ChatGPT e diga o que deseja fazer.</li>
      <li>Se faltar uma informação, responda à pergunta curta da IA.</li>
      <li>Abra o link de revisão que ela devolver.</li>
      <li>
        Confira a árvore de comandos e confirme somente o que deseja executar.
      </li>
    </ol>
    <p class="notice">
      <Bot size={16} />A IA gera a intenção; o Demanda valida e executa somente
      comandos permitidos.
    </p>
  </article>

  <article class="guide-card code-card">
    <div class="card-heading">
      <FileJson2 size={20} />
      <h2>Exemplo copiável</h2>
      <button
        type="button"
        onclick={copySample}
        aria-label="Copiar exemplo JSON"
      >
        {#if copied}<Check size={16} />Copiado{:else}<Clipboard
            size={16}
          />Copiar{/if}
      </button>
    </div>
    <pre><code>{sample}</code></pre>
  </article>
</section>

<section class="section catalog">
  <div class="section-heading">
    <span>Catálogo de possibilidades</span>
    <h2>O assistente cresce sem mudar a linguagem.</h2>
    <p>
      Verde indica o que já pode ser executado. As demais ações serão liberadas
      por área, com validações próprias.
    </p>
  </div>
  <div class="catalog__grid">
    {#each commandCatalog as item (item.resource)}
      <article class="catalog__item">
        <div>
          <span>{item.area}</span>
          <h3>{item.label}</h3>
        </div>
        <ul>
          {#each item.actions as action}
            <li class:available={item.implemented.includes(action)}>
              {#if item.implemented.includes(action)}<Check
                  size={14}
                />{:else}<span class="pending"></span>{/if}
              {action === "create"
                ? "Criar"
                : action === "update"
                  ? "Modificar"
                  : "Excluir"}
            </li>
          {/each}
        </ul>
      </article>
    {/each}
  </div>
</section>

<section class="section safety">
  <Sparkles size={20} />
  <div>
    <h2>Antes de executar</h2>
    <p>
      Confira o bloco antes de colar. Comandos em lote são executados em ordem e
      param na primeira falha.
    </p>
  </div>
</section>

<style>
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(230px, 0.75fr);
    gap: 24px;
    overflow: hidden;
    padding: clamp(25px, 4vw, 52px);
    border: 1px solid rgba(65, 74, 204, 0.18);
    border-radius: 22px;
    background:
      radial-gradient(
        circle at 92% 4%,
        rgba(31, 198, 255, 0.22),
        transparent 28%
      ),
      linear-gradient(135deg, #28255e, #4b45a8 55%, #2777c7);
    color: #fff;
    box-shadow: var(--shadow-md);
  }
  .hero__copy {
    position: relative;
    z-index: 1;
    max-width: 670px;
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid rgb(255 255 255 / 0.25);
    border-radius: 999px;
    padding: 6px 10px;
    background: rgb(255 255 255 / 0.1);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .hero h1 {
    max-width: 620px;
    margin: 16px 0 12px;
    font-size: clamp(32px, 4.2vw, 52px);
    line-height: 1;
    letter-spacing: -0.055em;
  }
  .hero p {
    max-width: 590px;
    margin: 0;
    color: rgb(255 255 255 / 0.82);
    font-size: var(--text-lg);
    line-height: 1.5;
  }
  .hero__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 24px;
  }
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 10px;
    padding: 11px 14px;
    font-size: var(--text-md);
    font-weight: 700;
    text-decoration: none;
    transition:
      transform var(--motion-fast) ease,
      background var(--motion-fast) ease;
  }
  .button:hover {
    transform: translateY(-1px);
  }
  .button.primary {
    color: #2f2a70;
    background: #fff;
  }
  .button.secondary {
    border: 1px solid rgb(255 255 255 / 0.3);
    color: #fff;
    background: rgb(255 255 255 / 0.1);
  }
  .hero__visual {
    position: relative;
    display: grid;
    min-height: 220px;
    place-items: center;
  }
  .hero__visual img {
    position: relative;
    z-index: 1;
    width: min(210px, 70%);
    filter: drop-shadow(0 22px 24px rgb(0 0 0 / 0.24));
  }
  .bubble {
    position: absolute;
    border: 1px solid rgb(255 255 255 / 0.18);
    border-radius: 50%;
    background: rgb(255 255 255 / 0.08);
  }
  .bubble--one {
    width: 250px;
    height: 250px;
  }
  .bubble--two {
    width: 340px;
    height: 340px;
    opacity: 0.55;
  }
  .section {
    margin-top: 24px;
    padding: clamp(20px, 3vw, 32px);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }
  .section-heading span {
    color: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .section-heading h2 {
    margin: 6px 0 0;
    color: var(--ink-950);
    font-size: var(--text-2xl);
    letter-spacing: -0.035em;
  }
  .section-heading p {
    max-width: 720px;
    margin: 9px 0 0;
    color: var(--ink-500);
    line-height: 1.45;
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-top: 22px;
  }
  .steps article {
    position: relative;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--canvas);
  }
  .steps article > span {
    position: absolute;
    top: 13px;
    right: 13px;
    color: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 800;
  }
  .steps :global(svg),
  .card-heading :global(svg) {
    color: var(--brand-600);
  }
  .steps h3 {
    margin: 13px 0 6px;
    color: var(--ink-800);
    font-size: var(--text-lg);
  }
  .steps p {
    margin: 0;
    color: var(--ink-500);
    font-size: var(--text-md);
    line-height: 1.45;
  }
  .two-column {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    margin-top: 24px;
  }
  .guide-card {
    overflow: hidden;
    padding: 22px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }
  .card-heading {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .card-heading h2 {
    margin: 0;
    color: var(--ink-800);
    font-size: var(--text-xl);
  }
  .card-heading button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    border: 0;
    border-radius: 8px;
    padding: 7px 9px;
    color: var(--brand-700);
    background: var(--brand-50);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 700;
    cursor: pointer;
  }
  .guide-card ol {
    display: grid;
    gap: 10px;
    margin: 18px 0;
    padding-left: 20px;
    color: var(--ink-700);
    font-size: var(--text-md);
    line-height: 1.45;
  }
  .notice {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 0;
    padding: 11px;
    border-radius: 9px;
    color: var(--ink-700);
    background: var(--surface-soft);
    font-size: var(--text-sm);
    line-height: 1.4;
  }
  .notice :global(svg) {
    flex: none;
    color: var(--violet-500);
  }
  .code-card {
    background: #17182b;
  }
  .code-card .card-heading h2 {
    color: #fff;
  }
  .code-card .card-heading :global(svg) {
    color: #9ea5ff;
  }
  .code-card .card-heading button {
    color: #dce0ff;
    background: rgb(255 255 255 / 0.1);
  }
  .code-card pre {
    max-height: 320px;
    overflow: auto;
    margin: 17px 0 0;
    color: #dce0ff;
    font:
      12px/1.55 ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    white-space: pre-wrap;
  }
  .catalog__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 22px;
  }
  .catalog__item {
    display: flex;
    min-height: 145px;
    flex-direction: column;
    justify-content: space-between;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 13px;
  }
  .catalog__item > div > span {
    color: var(--ink-400);
    font-size: var(--text-xs);
    text-transform: capitalize;
  }
  .catalog__item h3 {
    margin: 4px 0 0;
    color: var(--ink-800);
    font-size: var(--text-md);
  }
  .catalog__item ul {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
  }
  .catalog__item li {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 7px;
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  .catalog__item li.available {
    border-color: rgb(93 172 131 / 0.32);
    color: #347655;
    background: rgb(93 172 131 / 0.1);
  }
  .pending {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ink-400);
  }
  .safety {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    color: #6e5000;
    background: #fff8e1;
    border-color: #f2d98a;
  }
  .safety :global(svg) {
    flex: none;
    color: #c68b00;
  }
  .safety h2 {
    margin: 0;
    font-size: var(--text-lg);
  }
  .safety p {
    margin: 4px 0 0;
    line-height: 1.4;
  }
  @media (max-width: 820px) {
    .hero {
      grid-template-columns: 1fr;
    }
    .hero__visual {
      min-height: 130px;
    }
    .hero__visual img {
      width: 130px;
    }
    .bubble--one {
      width: 170px;
      height: 170px;
    }
    .bubble--two {
      width: 225px;
      height: 225px;
    }
    .steps,
    .two-column {
      grid-template-columns: 1fr;
    }
    .catalog__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 530px) {
    .hero {
      padding: 23px;
    }
    .hero h1 {
      font-size: 34px;
    }
    .hero__actions {
      flex-direction: column;
    }
    .button {
      width: 100%;
    }
    .section {
      padding: 18px;
    }
    .catalog__grid {
      grid-template-columns: 1fr;
    }
  }
</style>
