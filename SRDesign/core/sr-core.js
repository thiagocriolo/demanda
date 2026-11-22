/* ==========================================================================
   SRDesign — Core JavaScript (Comportamentos Interativos Agnósticos)
   Funciona 100% offline, inclusive via file:// (sem ES Modules / CORS).
   Inicialização automática em DOMContentLoaded ou via window.SRDesign.init()
   ========================================================================== */

(function (global) {
  "use strict";

  var SRDesign = {};

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function getInitials(label) {
    return String(label || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0);
      })
      .join("")
      .toUpperCase();
  }

  /* ------------------------------------------------------------------------
     1. AppShell — Sidebar recolhível
     ------------------------------------------------------------------------ */
  function initShells(root) {
    var shells = root.querySelectorAll("[data-sr-shell]");
    shells.forEach(function (shell) {
      if (shell.__srBound) return;
      shell.__srBound = true;

      var toggles = shell.querySelectorAll("[data-sr-sidebar-toggle]");
      toggles.forEach(function (btn) {
        btn.addEventListener("click", function () {
          var collapsed = shell.classList.toggle("is-collapsed");
          btn.setAttribute("aria-expanded", String(!collapsed));
          btn.setAttribute(
            "aria-label",
            collapsed ? "Expandir menu" : "Recolher menu"
          );
          shell.dispatchEvent(
            new CustomEvent("sr:sidebar-toggle", {
              detail: { collapsed: collapsed },
              bubbles: true,
            })
          );
        });
      });
    });
  }

  /* ------------------------------------------------------------------------
     2. Tabs — Sistema de Abas com suporte a teclado
     ------------------------------------------------------------------------ */
  function initTabs(root) {
    var groups = root.querySelectorAll("[data-sr-tabs]");
    groups.forEach(function (group) {
      if (group.__srBound) return;
      group.__srBound = true;

      var tabs = Array.prototype.slice.call(
        group.querySelectorAll("[data-sr-tab]")
      );
      var panels = Array.prototype.slice.call(
        group.querySelectorAll("[data-sr-tab-panel]")
      );

      function activate(tabId, moveFocus) {
        tabs.forEach(function (tab) {
          var isTarget = tab.getAttribute("data-sr-tab") === tabId;
          tab.classList.toggle("is-active", isTarget);
          tab.setAttribute("aria-selected", String(isTarget));
          tab.setAttribute("tabindex", isTarget ? "0" : "-1");
          if (isTarget && moveFocus) tab.focus();
        });
        panels.forEach(function (panel) {
          var isTarget = panel.getAttribute("data-sr-tab-panel") === tabId;
          panel.hidden = !isTarget;
        });
        group.dispatchEvent(
          new CustomEvent("sr:tab-change", {
            detail: { tabId: tabId },
            bubbles: true,
          })
        );
      }

      tabs.forEach(function (tab, index) {
        tab.addEventListener("click", function () {
          activate(tab.getAttribute("data-sr-tab"), false);
        });
        tab.addEventListener("keydown", function (event) {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            var next = tabs[(index + 1) % tabs.length];
            activate(next.getAttribute("data-sr-tab"), true);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            var prev = tabs[(index - 1 + tabs.length) % tabs.length];
            activate(prev.getAttribute("data-sr-tab"), true);
          }
        });
      });
    });
  }

  /* ------------------------------------------------------------------------
     3. Dropdowns (FloatingMenu, Popover, AccountButton, NotificationButton)
     ------------------------------------------------------------------------ */
  var activeDropdowns = [];

  function closeDropdown(container) {
    var trigger = container.querySelector("[data-sr-dropdown-trigger]");
    var menu = container.querySelector("[data-sr-dropdown-menu]");
    container.classList.remove("is-open");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (menu) menu.hidden = true;
  }

  function closeAllDropdowns(except) {
    activeDropdowns.forEach(function (container) {
      if (container !== except) closeDropdown(container);
    });
  }

  function initDropdowns(root) {
    var containers = root.querySelectorAll("[data-sr-dropdown]");
    containers.forEach(function (container) {
      if (container.__srBound) return;
      container.__srBound = true;
      activeDropdowns.push(container);

      var trigger = container.querySelector("[data-sr-dropdown-trigger]");
      var menu = container.querySelector("[data-sr-dropdown-menu]");
      if (!trigger || !menu) return;

      trigger.addEventListener("click", function (event) {
        event.stopPropagation();
        var willOpen = menu.hidden;
        closeAllDropdowns(container);
        container.classList.toggle("is-open", willOpen);
        trigger.setAttribute("aria-expanded", String(willOpen));
        menu.hidden = !willOpen;
      });

      var closeButtons = container.querySelectorAll("[data-sr-dropdown-close]");
      closeButtons.forEach(function (btn) {
        btn.addEventListener("click", function (event) {
          event.stopPropagation();
          closeDropdown(container);
        });
      });

      menu.addEventListener("click", function (event) {
        var item = event.target.closest("[role='menuitem']");
        if (item) {
          closeDropdown(container);
          container.dispatchEvent(
            new CustomEvent("sr:menu-select", {
              detail: {
                value: item.getAttribute("data-value") || item.textContent.trim(),
                item: item,
              },
              bubbles: true,
            })
          );
        }
      });
    });
  }

  /* ------------------------------------------------------------------------
     4. FilterBar — Pílulas + Busca + Limpar + Filtragem declarativa opcional
     ------------------------------------------------------------------------ */
  function initFilterBars(root) {
    var bars = root.querySelectorAll("[data-sr-filter-bar]");
    bars.forEach(function (bar) {
      if (bar.__srBound) return;
      bar.__srBound = true;

      var options = Array.prototype.slice.call(
        bar.querySelectorAll("[data-sr-filter-option]")
      );
      var input = bar.querySelector("[data-sr-filter-input]");
      var clearBtn = bar.querySelector("[data-sr-filter-clear]");
      var targetSelector = bar.getAttribute("data-sr-filter-target");

      var state = {
        selected:
          (
            bar.querySelector("[data-sr-filter-option].is-active") || options[0]
          )?.getAttribute("data-sr-filter-option") || "all",
        query: input ? input.value : "",
      };

      function applyFilter() {
        if (clearBtn) clearBtn.hidden = !state.query;

        if (targetSelector) {
          var items = document.querySelectorAll(targetSelector);
          var q = normalizeText(state.query.trim());
          var visibleCount = 0;

          items.forEach(function (item) {
            var category = item.getAttribute("data-sr-category") || "";
            var text = normalizeText(item.textContent || "");
            var matchCat =
              state.selected === "all" ||
              category.split(/\s+/).indexOf(state.selected) !== -1;
            var matchQuery = !q || text.indexOf(q) !== -1;
            var show = matchCat && matchQuery;
            item.hidden = !show;
            if (show) visibleCount++;
          });

          var emptySelector = bar.getAttribute("data-sr-filter-empty");
          if (emptySelector) {
            var emptyEl = document.querySelector(emptySelector);
            if (emptyEl) emptyEl.hidden = visibleCount > 0;
          }
        }

        bar.dispatchEvent(
          new CustomEvent("sr:filter-change", {
            detail: { selected: state.selected, query: state.query },
            bubbles: true,
          })
        );
      }

      options.forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.selected = btn.getAttribute("data-sr-filter-option");
          options.forEach(function (other) {
            var active = other === btn;
            other.classList.toggle("is-active", active);
            other.setAttribute("aria-pressed", String(active));
          });
          applyFilter();
        });
      });

      if (input) {
        input.addEventListener("input", function () {
          state.query = input.value;
          applyFilter();
        });
      }

      if (clearBtn && input) {
        clearBtn.addEventListener("click", function () {
          input.value = "";
          state.query = "";
          applyFilter();
          input.focus();
        });
      }

      applyFilter();
    });
  }

  /* ------------------------------------------------------------------------
     5. CardScaleControl — Escala de Cards (1 a 10)
     ------------------------------------------------------------------------ */
  function initCardScales(root) {
    var controls = root.querySelectorAll("[data-sr-card-scale]");
    controls.forEach(function (input) {
      if (input.__srBound) return;
      input.__srBound = true;

      var targetSelector = input.getAttribute("data-sr-card-scale");
      var outputSelector = input.getAttribute("data-sr-scale-output");

      function update() {
        var val = Math.max(1, Math.min(10, parseInt(input.value || "6", 10)));
        var thumb = Math.round((12 + ((val - 1) / 9) * 10) * 10) / 10;
        input.style.setProperty("--sr-scale-thumb", thumb + "px");
        input.setAttribute("aria-valuetext", "Nível " + val + " de 10");

        if (targetSelector) {
          document.querySelectorAll(targetSelector).forEach(function (target) {
            target.setAttribute("data-sr-card-level", String(val));
          });
        }
        if (outputSelector) {
          document.querySelectorAll(outputSelector).forEach(function (out) {
            out.textContent = String(val);
          });
        }
      }

      input.addEventListener("input", update);
      update();
    });
  }

  /* ------------------------------------------------------------------------
     6. CardDrawer — Gaveta inferior expansível + Scroll Horizontal
     ------------------------------------------------------------------------ */
  function initDrawers(root) {
    var drawers = root.querySelectorAll("[data-sr-drawer]");
    drawers.forEach(function (drawer) {
      if (drawer.__srBound) return;
      drawer.__srBound = true;

      var toggle = drawer.querySelector("[data-sr-drawer-toggle]");
      var list = drawer.querySelector("[data-sr-drawer-list]");

      if (toggle) {
        toggle.addEventListener("click", function () {
          var open = drawer.classList.toggle("is-open");
          toggle.setAttribute("aria-checked", String(open));
        });
      }

      if (list) {
        list.addEventListener(
          "wheel",
          function (event) {
            var max = list.scrollWidth - list.clientWidth;
            if (max <= 0) return;
            var delta =
              Math.abs(event.deltaY) >= Math.abs(event.deltaX)
                ? event.deltaY
                : event.deltaX;
            if (!delta) return;
            var prev = list.scrollLeft;
            list.scrollLeft = Math.max(0, Math.min(max, prev + delta));
            if (list.scrollLeft !== prev) event.preventDefault();
          },
          { passive: false }
        );
      }
    });
  }

  /* ------------------------------------------------------------------------
     7. GlobalSelector — Combobox com busca, single/multiple e teclado
     ------------------------------------------------------------------------ */
  function initSelectors(root) {
    var selectors = root.querySelectorAll("[data-sr-selector]");
    selectors.forEach(function (el) {
      if (el.__srBound) return;
      el.__srBound = true;

      var mode = el.getAttribute("data-mode") || "single"; // single | multiple | chooser
      var isMultiple = mode === "multiple";
      var isChooser = mode === "chooser";
      var itemsRaw = el.getAttribute("data-items") || "[]";
      var items = [];
      try {
        items = JSON.parse(itemsRaw);
      } catch (e) {
        items = [];
      }

      var input = el.querySelector(".sr-selector__input");
      var control = el.querySelector(".sr-selector__control");
      var clearBtn = el.querySelector(".sr-selector__clear");
      var dropdown = el.querySelector(".sr-selector__dropdown");
      var list = el.querySelector(".sr-selector__list");
      var selectedList = el.querySelector(".sr-selector__selected-list");
      var counterEl = el.querySelector(".sr-selector__counter");

      var open = false;
      var query = "";
      var searching = false;
      var value = el.getAttribute("data-value") || "";
      var selectedIds = (el.getAttribute("data-selected") || "")
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      var activeIndex = 0;

      if (!isMultiple && value) {
        var found = items.find(function (item) {
          return item.id === value;
        });
        if (found && input) input.value = found.label;
      }

      function getFiltered() {
        var q = !isChooser && searching ? normalizeText(query.trim()) : "";
        return items.filter(function (item) {
          if (isMultiple && selectedIds.indexOf(item.id) !== -1) return false;
          if (!q) return true;
          return (
            normalizeText(item.label + " " + (item.description || "")).indexOf(
              q
            ) !== -1
          );
        });
      }

      function renderSelected() {
        if (!isMultiple || !selectedList) return;
        var selectedItems = items.filter(function (item) {
          return selectedIds.indexOf(item.id) !== -1;
        });
        if (counterEl) {
          counterEl.textContent =
            selectedItems.length > 0
              ? selectedItems.length +
                " selecionado" +
                (selectedItems.length === 1 ? "" : "s")
              : "";
        }
        selectedList.innerHTML = selectedItems
          .map(function (item) {
            var removeIcon = global.SRIcons
              ? global.SRIcons.svg("x", 17)
              : "&times;";
            var checkIcon = global.SRIcons
              ? global.SRIcons.svg("check", 14)
              : "";
            return (
              '<li class="sr-selector__selected-item">' +
              '<span class="sr-selector__visual sr-selector__visual--selected" style="' +
              (item.color ? "background:" + item.color : "") +
              '">' +
              getInitials(item.label) +
              "</span>" +
              '<span class="sr-selector__copy"><strong>' +
              item.label +
              "</strong>" +
              (item.description ? "<small>" + item.description + "</small>" : "") +
              "</span>" +
              '<span class="sr-selector__state">' +
              checkIcon +
              " Selecionado</span>" +
              '<button type="button" class="sr-selector__remove" data-remove-id="' +
              item.id +
              '" aria-label="Remover ' +
              item.label +
              '">' +
              removeIcon +
              "</button>" +
              "</li>"
            );
          })
          .join("");
      }

      function renderOptions() {
        if (!list) return;
        var results = getFiltered();
        if (activeIndex >= results.length) {
          activeIndex = Math.max(0, results.length - 1);
        }
        if (results.length === 0) {
          var searchIcon = global.SRIcons
            ? global.SRIcons.svg("search", 20)
            : "";
          list.innerHTML =
            '<li class="sr-selector__empty">' +
            searchIcon +
            "<span>Nenhuma opção encontrada.</span></li>";
          return;
        }
        list.innerHTML = results
          .map(function (item, idx) {
            var isSelected = !isMultiple && item.id === value;
            var actionText = isSelected
              ? "Selecionado"
              : isMultiple
                ? "Adicionar"
                : "Selecionar";
            return (
              '<li role="presentation">' +
              '<button type="button" class="sr-selector__option' +
              (idx === activeIndex ? " is-active" : "") +
              '" role="option" aria-selected="' +
              String(isSelected) +
              '" data-option-id="' +
              item.id +
              '">' +
              '<span class="sr-selector__visual" style="' +
              (item.color
                ? "background:" + item.color + ";color:#fff"
                : "") +
              '">' +
              getInitials(item.label) +
              "</span>" +
              '<span class="sr-selector__copy"><strong>' +
              item.label +
              "</strong>" +
              (item.description ? "<small>" + item.description + "</small>" : "") +
              "</span>" +
              '<span class="sr-selector__action-label">' +
              actionText +
              "</span>" +
              "</button></li>"
            );
          })
          .join("");
      }

      function syncClearButton() {
        if (!clearBtn || !input) return;
        clearBtn.hidden = isChooser || !input.value;
      }

      function setOpen(next) {
        if (el.classList.contains("is-disabled")) return;
        open = next;
        el.classList.toggle("is-open", open);
        if (dropdown) dropdown.hidden = !open;
        if (input) input.setAttribute("aria-expanded", String(open));
        if (open) renderOptions();
      }

      function choose(itemId) {
        var item = items.find(function (i) {
          return i.id === itemId;
        });
        if (!item) return;

        if (isMultiple) {
          if (selectedIds.indexOf(item.id) === -1) selectedIds.push(item.id);
          query = "";
          if (input) input.value = "";
          searching = false;
          renderSelected();
          setOpen(false);
          syncClearButton();
          el.dispatchEvent(
            new CustomEvent("sr:selector-change", {
              detail: { selected: selectedIds.slice() },
              bubbles: true,
            })
          );
          return;
        }

        value = item.id;
        query = item.label;
        if (input) input.value = item.label;
        searching = false;
        setOpen(false);
        syncClearButton();
        el.dispatchEvent(
          new CustomEvent("sr:selector-change", {
            detail: { value: value, item: item },
            bubbles: true,
          })
        );
      }

      if (control) {
        control.addEventListener("click", function () {
          setOpen(!open);
          if (input) input.focus();
        });
      }

      if (input) {
        input.addEventListener("focus", function () {
          if (!open) setOpen(true);
        });
        input.addEventListener("input", function () {
          if (isChooser) return;
          query = input.value;
          searching = true;
          activeIndex = 0;
          if (!isMultiple) value = "";
          syncClearButton();
          setOpen(true);
          renderOptions();
        });
        input.addEventListener("keydown", function (event) {
          var results = getFiltered();
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) setOpen(true);
            else if (results.length)
              activeIndex = Math.min(activeIndex + 1, results.length - 1);
            renderOptions();
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            if (open && results.length)
              activeIndex = Math.max(activeIndex - 1, 0);
            renderOptions();
          } else if (event.key === "Enter" && open && results[activeIndex]) {
            event.preventDefault();
            choose(results[activeIndex].id);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        });
      }

      if (clearBtn && input) {
        clearBtn.addEventListener("click", function (event) {
          event.stopPropagation();
          input.value = "";
          query = "";
          searching = false;
          if (!isMultiple) value = "";
          syncClearButton();
          setOpen(false);
          input.focus();
        });
      }

      if (list) {
        list.addEventListener("click", function (event) {
          var btn = event.target.closest("[data-option-id]");
          if (!btn) return;
          event.stopPropagation();
          choose(btn.getAttribute("data-option-id"));
        });
      }

      if (selectedList) {
        selectedList.addEventListener("click", function (event) {
          var btn = event.target.closest("[data-remove-id]");
          if (!btn) return;
          var removeId = btn.getAttribute("data-remove-id");
          selectedIds = selectedIds.filter(function (id) {
            return id !== removeId;
          });
          renderSelected();
          if (open) renderOptions();
          el.dispatchEvent(
            new CustomEvent("sr:selector-change", {
              detail: { selected: selectedIds.slice() },
              bubbles: true,
            })
          );
        });
      }

      document.addEventListener("pointerdown", function (event) {
        if (open && !el.contains(event.target)) setOpen(false);
      });

      renderSelected();
      syncClearButton();
    });
  }

  /* ------------------------------------------------------------------------
     8. Modais e AlertDialog
     ------------------------------------------------------------------------ */
  function openModal(id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    var focusable = modal.querySelector(
      "input, select, textarea, button:not([data-sr-modal-close])"
    );
    if (focusable) focusable.focus();
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    var anyOpen = document.querySelector(".sr-modal-backdrop:not([hidden])");
    if (!anyOpen) document.body.style.overflow = "";
  }

  function initModals(root) {
    root.querySelectorAll("[data-sr-modal-open]").forEach(function (btn) {
      if (btn.__srBound) return;
      btn.__srBound = true;
      btn.addEventListener("click", function () {
        openModal(btn.getAttribute("data-sr-modal-open"));
      });
    });

    root.querySelectorAll(".sr-modal-backdrop").forEach(function (backdrop) {
      if (backdrop.__srBound) return;
      backdrop.__srBound = true;

      backdrop.addEventListener("click", function (event) {
        if (event.target === backdrop) closeModal(backdrop);
      });

      backdrop.querySelectorAll("[data-sr-modal-close]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          closeModal(backdrop);
        });
      });
    });
  }

  /* ------------------------------------------------------------------------
     9. Utilitários de Formulário (Password Toggle + Range Output)
     ------------------------------------------------------------------------ */
  function initFormHelpers(root) {
    root.querySelectorAll("[data-sr-password-toggle]").forEach(function (btn) {
      if (btn.__srBound) return;
      btn.__srBound = true;
      btn.addEventListener("click", function () {
        var wrap = btn.closest(".sr-auth-control");
        var input = wrap ? wrap.querySelector("input") : null;
        if (!input) return;
        var reveal = input.type === "password";
        input.type = reveal ? "text" : "password";
        btn.setAttribute("aria-pressed", String(reveal));
        btn.setAttribute("aria-label", reveal ? "Ocultar senha" : "Mostrar senha");
        var iconSpan = btn.querySelector("[data-sr-icon]");
        if (iconSpan && global.SRIcons) {
          iconSpan.setAttribute("data-sr-icon", reveal ? "eye-off" : "eye");
          iconSpan.innerHTML = global.SRIcons.svg(reveal ? "eye-off" : "eye", 18);
        }
      });
    });

    root.querySelectorAll("[data-sr-range]").forEach(function (input) {
      if (input.__srBound) return;
      input.__srBound = true;
      var outputId = input.getAttribute("data-sr-range");
      var out = outputId ? document.getElementById(outputId) : null;
      if (!out) return;
      var sync = function () {
        out.textContent = input.value;
      };
      input.addEventListener("input", sync);
      sync();
    });
  }

  /* ------------------------------------------------------------------------
     10. Listeners globais + API Pública
     ------------------------------------------------------------------------ */
  var globalEventsBound = false;
  function bindGlobalEvents() {
    if (globalEventsBound) return;
    globalEventsBound = true;

    document.addEventListener("pointerdown", function (event) {
      activeDropdowns.forEach(function (container) {
        if (!container.contains(event.target)) closeDropdown(container);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeAllDropdowns();
        document
          .querySelectorAll(".sr-modal-backdrop:not([hidden])")
          .forEach(closeModal);
      }
    });
  }

  SRDesign.init = function (root) {
    var scope = root || document;
    bindGlobalEvents();
    if (global.SRIcons) global.SRIcons.hydrate(scope);
    initShells(scope);
    initTabs(scope);
    initDropdowns(scope);
    initFilterBars(scope);
    initCardScales(scope);
    initDrawers(scope);
    initSelectors(scope);
    initModals(scope);
    initFormHelpers(scope);
  };

  SRDesign.openModal = openModal;
  SRDesign.closeModal = function (id) {
    closeModal(document.getElementById(id));
  };

  SRDesign.setPrimaryColor = function (hex) {
    document.documentElement.style.setProperty("--sr-primary", hex);
  };

  global.SRDesign = SRDesign;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      SRDesign.init(document);
    });
  } else {
    SRDesign.init(document);
  }
})(window);
