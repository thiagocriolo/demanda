# SRDesign — Manual do Sistema de Design

**SRDesign** (*Sara Design*) é um Design System e UI Kit portátil em **HTML + CSS + JavaScript puro**, extraído da linguagem visual do projeto **Demanda**.  
Ele foi criado para ser copiado e colado em qualquer outro projeto — sem servidor, sem banco de dados, sem etapa de build e sem dependências externas.

---

## Como abrir e navegar agora

1. Abra **`index.html`** diretamente no navegador (duplo clique no arquivo) para explorar a **Aplicação Oca (Showcase)** com todos os componentes integrados.
2. Para inspecionar ou evoluir qualquer componente isoladamente, abra o arquivo correspondente na pasta **`components/`**.

---

## Como reutilizar em um novo projeto

1. Copie a pasta inteira **`design-system/`** para dentro do novo projeto.
2. Carregue os 3 arquivos do núcleo na sua página (ou importe o CSS no seu bundler):

```html
<link rel="stylesheet" href="design-system/core/sr-design.css" />
<script src="design-system/core/sr-icons.js"></script>
<script src="design-system/core/sr-core.js"></script>
```

3. **Usando com IA:** diga ao agente de IA:
   > *"Leia `docs/design-system/AI_GUIDE.md` e `docs/design-system/catalog.json` e construa a interface deste projeto usando exclusivamente o SRDesign."*

---

## Estrutura da Pasta

| Caminho | Função |
| --- | --- |
| `index.html` | Aplicação oca completa (Shell + vitrine navegável + teste de cor de marca) |
| `AI_GUIDE.md` | Contrato e manual técnico otimizado para agentes de IA |
| `catalog.json` | Índice estruturado em JSON de todos os componentes e arquivos |
| `assets/fonts/pogonia/` | Fonte local **Pogonia** (Light 300, Regular 400, Medium 500, Semibold 600) |
| `core/sr-design.css` | Ponto de entrada único que importa tokens, base e todos os componentes |
| `core/sr-tokens.css` | Variáveis CSS (`--sr-*`) de cores, tipografia, raios, sombras e layout |
| `core/sr-base.css` | Reset, `@font-face`, foco acessível e utilitários de layout |
| `core/sr-icons.js` | Ícones SVG offline (`<span data-sr-icon="nome" data-size="18">`) |
| `core/sr-core.js` | Comportamentos interativos (`window.SRDesign`, inicialização automática) |
| `core/components/*.css` | Folhas de estilo modulares por família de componente |
| `components/*.html` | 14 páginas isoladas de demonstração e teste visual |

---

## Personalizando a Marca (Rebranding)

Todo o tema deriva da variável `--sr-primary` em `core/sr-tokens.css`.  
Para adaptar o SRDesign a outra identidade visual, basta sobrescrever uma linha no seu CSS:

```css
:root {
  --sr-primary: #7c5ce5; /* Tints, hovers, bordas e sombras se ajustam via color-mix() */
}
```

Ou via JavaScript em tempo de execução:

```js
SRDesign.setPrimaryColor("#5dac83");
```

---

## Catálogo de Componentes

1. **Tokens & Tipografia** — `components/tokens.html` (`core/sr-tokens.css`, `core/sr-base.css`)
2. **AppShell (Sidebar + Topbar + MobileDock)** — `components/shell.html` (`core/components/sr-shell.css`)
3. **PageHeader** — `components/page-header.html` (`core/components/sr-page-header.css`)
4. **Botões & TopbarSaveButton** — `components/buttons.html` (`core/components/sr-buttons.css`)
5. **TabSystem (Abas)** — `components/tabs.html` (`core/components/sr-tabs.css`)
6. **FilterBar** — `components/filter-bar.html` (`core/components/sr-filter-bar.css`)
7. **FloatingMenu & Context Popover** — `components/floating-menu.html` (`core/components/sr-menus.css`)
8. **GlobalSelector (Combobox)** — `components/global-selector.html` (`core/components/sr-selector.css`)
9. **EntityCards, Escala 1–10, StatCard & NextStep** — `components/cards.html` (`core/components/sr-cards.css`)
10. **CardDrawer (Gaveta Inferior)** — `components/card-drawer.html` (`core/components/sr-drawer.css`)
11. **Formulários & SettingsCard** — `components/forms-settings.html` (`core/components/sr-forms.css`)
12. **Modais & AlertDialog** — `components/modals.html` (`core/components/sr-modals.css`)
13. **Avatares, Badges, Avisos & EmptyState** — `components/avatars-badges.html` (`core/components/sr-forms.css`)
14. **AuthShell (Login / Cadastro)** — `components/auth.html` (`core/components/sr-auth.css`)
