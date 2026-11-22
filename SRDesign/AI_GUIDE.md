# SRDesign — Guia Oficial para Agentes de IA (`AI_GUIDE.md`)

> **Instrução para a IA:** Este projeto usa o **SRDesign** como sistema de design oficial.  
> Sempre reutilize os tokens (`--sr-*`), classes (`.sr-*`) e comportamentos (`data-sr-*`) documentados abaixo em vez de inventar estilos paralelos. Consulte `catalog.json` e os exemplos completos em `components/*.html` sempre que precisar da anatomia exata de um componente.

---

## 1. Regras de Ouro Estéticas

### FAÇA (Obrigatório)
- Importe `SRDesign/core/sr-design.css` (ou os módulos de `core/components/`).
- Use exclusivamente variáveis `--sr-*` para cores, tipografia, raios, sombras e espaçamento.
- Mantenha o fundo principal em `--sr-main-background` (tint suave da cor primária) com superfícies elevadas em branco (`--sr-surface` / `--sr-panel`) e bordas sutis (`1px solid var(--sr-border)`).
- Use a fonte **Pogonia** (`var(--sr-font-sans)`) e pesos `400` (corpo), `500` (abas/destaques leves), `600` (títulos/labels/botões).
- Mantenha raios generosos e consistentes (`--sr-radius-md` = 12px, `--sr-radius-lg` = 14px, `--sr-radius-xl` = 16px, `--sr-radius-pill` = 999px).
- Para qualquer tela autenticada, use a casca `.sr-shell` (Sidebar recolhível + Topbar + MobileDock abaixo de 920px).
- Para telas de Login/Cadastro/Recuperação de senha, use `.sr-auth-page` + `.sr-auth-card`.

### NÃO FAÇA (Proibido)
- **Não** adicione Tailwind, Bootstrap, Material UI ou outra biblioteca de estilos por cima do SRDesign.
- **Não** use cores hardcoded soltas quando houver token semântico (`--sr-primary`, `--sr-accent`, `--sr-warning`, `--sr-danger`, `--sr-ink-*`).
- **Não** crie sombras pesadas em cards comuns — o SRDesign usa superfícies limpas com bordas finas e reserva sombras (`--sr-shadow-md` / `--sr-shadow-lg`) para elementos flutuantes (menus, dropdowns, modais e PageHeader).
- **Não** use classes sem prefixo que colidam com o projeto; siga o prefixo `.sr-*`.

---

## 2. Como Integrar em Qualquer Stack

### HTML / PHP / Vanilla JS
```html
<link rel="stylesheet" href="SRDesign/core/sr-design.css" />
<script src="SRDesign/core/sr-icons.js"></script>
<script src="SRDesign/core/sr-core.js"></script>
```
Se renderizar HTML dinamicamente após o load, chame `window.SRDesign.init(container)` para hidratar ícones e eventos.

### Svelte / React / Vue / Next / Vite
- Importe `SRDesign/core/sr-design.css` no layout raiz da aplicação (verifique o caminho das fontes em `core/sr-base.css` caso o bundler copie assets).
- Reutilize exatamente as mesmas classes `.sr-*` e anatomia HTML dos componentes.
- Substitua os gatilhos JS imperativos (`data-sr-*`) pelo estado reativo nativo do framework, preservando **classes de estado** (`.is-collapsed`, `.is-active`, `.is-open`, `.is-dirty`, `.is-saved`, `.is-invalid`, `.is-disabled`) e atributos ARIA (`aria-selected`, `aria-expanded`, `aria-checked`, `hidden`).

---

## 3. Mapa Rápido de Tokens (`core/sr-tokens.css`)

- **Marca:** `--sr-primary` (padrão `#2e56ff`), `--sr-brand-50`, `--sr-brand-100`, `--sr-brand-600`, `--sr-brand-700`
- **Semântica:** `--sr-accent` (`#5dac83`), `--sr-warning` (`#eab308`), `--sr-danger` (`#dc2626`), `--sr-violet` (`#7c5ce5`)
- **Superfícies:** `--sr-canvas` (`#f7f7f7`), `--sr-panel` / `--sr-surface` (`#ffffff`), `--sr-surface-soft`, `--sr-surface-hover`, `--sr-main-background`
- **Texto:** `--sr-ink-950`, `--sr-ink-800`, `--sr-ink-700`, `--sr-ink-500`, `--sr-ink-400`
- **Tipografia:** `--sr-text-xs` (11px), `--sr-text-sm` (12px), `--sr-text-md` (14px), `--sr-text-lg` (16px), `--sr-text-xl` (18px), `--sr-text-2xl` (24px)
- **Layout:** `--sr-sidebar-width` (280px), `--sr-sidebar-collapsed-width` (70px), `--sr-topbar-height` (70px), `--sr-main-padding` (22px)

---

## 4. Contrato dos Componentes

| Componente | Classe Raiz | Atributo JS | Referência HTML |
| --- | --- | --- | --- |
| **AppShell** | `.sr-shell` (`.is-collapsed`) | `data-sr-shell`, `data-sr-sidebar-toggle` | `components/shell.html` |
| **PageHeader** | `.sr-page-header` (`--has-body`) | — | `components/page-header.html` |
| **Botões** | `.sr-btn` (`--primary`, `--accent`, `--success`, `--warning`, `--danger`, `--soft`, `--ghost`, `--sm`, `--lg`, `--block`, `--icon`) | — | `components/buttons.html` |
| **Save Button** | `.sr-save-btn` (`.is-dirty`, `.is-saved`) | — | `components/buttons.html` |
| **TabSystem** | `.sr-tabs` + `.sr-tab-list` (`--overlapping`) + `.sr-tab` + `.sr-tab-panel` | `data-sr-tabs`, `data-sr-tab`, `data-sr-tab-panel` | `components/tabs.html` |
| **FilterBar** | `.sr-filter-bar` | `data-sr-filter-bar`, `data-sr-filter-option`, `data-sr-filter-input`, `data-sr-filter-clear`, `data-sr-filter-target` | `components/filter-bar.html` |
| **FloatingMenu** | `.sr-menu` (`--end`, `--side`, `--fill`, `--compact`, `--sidebar`) | `data-sr-dropdown`, `data-sr-dropdown-trigger`, `data-sr-dropdown-menu` | `components/floating-menu.html` |
| **Context Popover** | `.sr-popover` + `.sr-popover__trigger` + `.sr-popover__menu` | `data-sr-dropdown` | `components/floating-menu.html` |
| **GlobalSelector** | `.sr-selector` | `data-sr-selector`, `data-mode="single\|multiple\|chooser"`, `data-items='[...]'` | `components/global-selector.html` |
| **EntityCards** | `.sr-card-collection[data-sr-card-level="1..10"]` + `.sr-card-grid` + `.sr-card` | `data-sr-card-scale="#target"` | `components/cards.html` |
| **StatCard / NextStep / Empty** | `.sr-stat-card`, `.sr-next-step`, `.sr-empty-state` | — | `components/cards.html` |
| **CardDrawer** | `.sr-drawer` (`.is-open`) | `data-sr-drawer`, `data-sr-drawer-toggle`, `data-sr-drawer-list` | `components/card-drawer.html` |
| **SettingsCard & Forms** | `.sr-settings-card`, `.sr-field-grid`, `.sr-input`, `.sr-select`, `.sr-textarea`, `.sr-switch`, `.sr-toggle-row`, `.sr-choice-row`, `.sr-range-row` | `data-sr-range="outputId"` | `components/forms-settings.html` |
| **Modal & AlertDialog** | `.sr-modal-backdrop` + `.sr-modal` / `.sr-alert-dialog` | `data-sr-modal-open="id"`, `data-sr-modal-close` | `components/modals.html` |
| **Avatares, Badges, Notices** | `.sr-avatar`, `.sr-avatar-stack`, `.sr-badge`, `.sr-notice` | — | `components/avatars-badges.html` |
| **AuthShell** | `.sr-auth-page` + `.sr-auth-card` | `data-sr-password-toggle` | `components/auth.html` |

---

## 5. Receitas de Composição de Páginas

### Receita A — Dashboard / Visão Geral
`sr-shell` → `sr-page-header` → `sr-grid-4` com `.sr-stat-card` → `.sr-surface` com tabela ou `.sr-card-grid`.

### Receita B — Tela de Listagem / Registros
`sr-shell` → `sr-page-header` (com `.sr-card-scale` em ações) → `.sr-tabs` → dentro do `.sr-tab-panel`: `.sr-filter-bar` + `.sr-card-collection` + `.sr-empty-state` (oculto até filtro zerar).

### Receita C — Tela de Configurações
`sr-shell` → `sr-page-header` (com `.sr-save-btn` na topbar/ações) → `.sr-tabs` (com `.sr-tab-list--overlapping`) → pilha de `.sr-settings-card` (com `.sr-field-grid`, `.sr-toggle-row`, `.sr-choice-row`, `.sr-range-row` e `.sr-settings-card--danger` no fim).

### Receita D — Criação / Edição e Confirmação
Botão `.sr-btn--primary` com `data-sr-modal-open` → `.sr-modal` dividido em `.sr-modal__section` com `.sr-modal__control`. Ação destrutiva abre `.sr-alert-dialog`.

### Receita E — Autenticação
Página dedicada fora do `.sr-shell` usando `.sr-auth-page` + `.sr-auth-brand` + `.sr-auth-card`.

---

## 6. Ícones Disponíveis em `core/sr-icons.js`
Use `<span data-sr-icon="NOME" data-size="18"></span>`. Nomes incluídos:
`alert-triangle`, `archive`, `arrow-left`, `arrow-right`, `bell`, `briefcase`, `building`, `calendar`, `check`, `chevron-down`, `code`, `compass`, `copy`, `ellipsis-vertical`, `external-link`, `eye`, `eye-off`, `file-text`, `filter`, `folder`, `grid`, `home`, `inbox`, `info`, `layers`, `layout-dashboard`, `list-todo`, `lock`, `log-out`, `mail`, `menu`, `palette`, `panel-bottom`, `pencil`, `phone`, `plus`, `save`, `search`, `settings`, `shield`, `sliders`, `sparkles`, `tag`, `trash`, `user`, `users`, `x`.
