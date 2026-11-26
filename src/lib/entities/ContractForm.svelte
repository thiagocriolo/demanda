<script lang="ts">
  import {
    BriefcaseBusiness,
    CalendarDays,
    ChevronDown,
    CircleDollarSign,
    CircleDot,
    CreditCard,
    FileText,
    FolderKanban,
    Package,
    Pencil,
    Plus,
    Repeat,
    Save,
    Shield,
    SlidersHorizontal,
    Trash2,
    UserCheck,
    X,
  } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { listAllActiveBusinesses } from "$lib/businesses/client";
  import type { Business } from "$lib/businesses/types";
  import { addMonthsToFinanceDate } from "$lib/finance/installments";
  import { centsToMoney, moneyToCents, splitCents } from "$lib/finance/money";
  import { getProjectOptions } from "$lib/projects/client";
  import type { ProjectResponsible } from "$lib/projects/types";
  import { listServicePackages } from "$lib/service-packages/client";
  import {
    formatServiceHours,
    MAX_SERVICE_PROJECTS,
    type ServicePackage,
  } from "$lib/service-packages/types";
  import { resolveColor, resolveIcon } from "$lib/ui/icon-color";
  import ContractDeliveryDraftModal from "./ContractDeliveryDraftModal.svelte";
  import ContractProjectDrawer from "./ContractProjectDrawer.svelte";
  import type {
    ContractScopeDeliveryDraft,
    ContractScopeProjectDraft,
  } from "./contract-scope-draft";
  import type { EntityRecord } from "./types";
  import {
    loadActiveWorkspaceId,
    loadWorkspaces,
    refreshWorkspaceSnapshot,
    type Workspace,
  } from "$lib/workspaces/workspace-storage";

  type FormMode = "create" | "view" | "edit";
  type InstallmentDraft = {
    number: number;
    dueDate: string;
    amount: string;
    status: string;
  };

  let {
    record,
    mode = "create",
    initialServicePackageId,
    oncancel,
    onsave,
    onedit,
    ondelete,
  }: {
    record?: EntityRecord;
    mode?: FormMode;
    initialServicePackageId?: string;
    oncancel: () => void;
    onsave: (values: Record<string, string>) => void;
    onedit: () => void;
    ondelete: () => void;
  } = $props();

  let businesses = $state<Business[]>([]);
  let loadingBusinesses = $state(true);
  let businessError = $state("");
  let workspaces = $state<Workspace[]>([]);
  let workspaceError = $state("");
  let servicePackages = $state<ServicePackage[]>([]);
  let loadingServices = $state(false);
  let selectedServiceId = $state("");
  let responsibleUserId = $state("");
  let workspaceMembers = $state<ProjectResponsible[]>([]);
  let loadingMembers = $state(false);
  let membersError = $state("");
  let membersRequest: AbortController | undefined;
  let customizeScopeOpen = $state(false);
  let scopeProjects = $state<ContractScopeProjectDraft[]>([]);
  let activeScopeProjectLocalId = $state<string | null>(null);
  let editingDeliveryModal = $state<{
    projectLocalId: string;
    delivery: ContractScopeDeliveryDraft;
    isNew: boolean;
  } | null>(null);
  let scopeError = $state("");
  let scopeSeq = 0;
  let form = $state(emptyForm());
  const viewOnly = $derived(mode === "view");
  const isCreateMode = $derived(mode === "create");
  const selectedService = $derived(
    servicePackages.find((item) => item.id === selectedServiceId),
  );
  const SelectedServiceIcon = $derived(
    selectedService ? resolveIcon(selectedService.icon) : Package,
  );
  const selectedServiceAccent = $derived(
    selectedService
      ? selectedService.color.startsWith("#")
        ? selectedService.color
        : resolveColor(selectedService.color)
      : "#2e56ff",
  );
  const activeScopeProjectIndex = $derived(
    activeScopeProjectLocalId
      ? scopeProjects.findIndex(
          (project) => project.localId === activeScopeProjectLocalId,
        )
      : -1,
  );
  const activeScopeProject = $derived(
    activeScopeProjectIndex >= 0
      ? scopeProjects[activeScopeProjectIndex]
      : undefined,
  );
  const editingDeliveryProject = $derived(
    editingDeliveryModal
      ? scopeProjects.find(
          (project) => project.localId === editingDeliveryModal?.projectLocalId,
        )
      : undefined,
  );
  const selectedScopeStats = $derived.by(() => {
    let projects = 0;
    let deliveries = 0;
    let minutes = 0;
    for (const project of scopeProjects) {
      if (!project.included) continue;
      if (!project.isInstitutional || project.deliveries.length > 0) {
        projects += 1;
      }
      deliveries += project.deliveries.length;
      for (const delivery of project.deliveries) {
        for (const task of delivery.tasks) {
          minutes += task.durationMinutes;
        }
      }
    }
    return { projects, deliveries, minutes };
  });
  const modalTitle = $derived(
    viewOnly
      ? record?.nome || "Detalhes do contrato"
      : mode === "edit"
        ? "Editar contrato"
        : selectedService
          ? "Novo contrato a partir de serviço"
          : "Novo contrato",
  );

  function emptyForm(source?: EntityRecord) {
    const contractType =
      source?.contractType === "recurring" ? "recurring" : "one_off";
    const valor = source?.valor?.replace(/[^0-9,.-]/gu, "") ?? "";
    const installments = parseInstallments(source?.installments);
    const primeiroVencimento =
      source?.primeiroVencimento ?? installments[0]?.dueDate ?? "";
    if (contractType === "one_off" && !installments.length) {
      installments.push({
        number: 1,
        dueDate: primeiroVencimento,
        amount: centsToMoney(moneyToCents(valor)),
        status: "pending",
      });
    }
    return {
      nome: source?.nome ?? "",
      workspaceId: source?.contractWorkspaceId ?? source?.workspaceId ?? "",
      negocioId: source?.negocioId ?? "",
      contractType,
      valor,
      dataInicio: source?.dataInicio ?? "",
      dataFim: source?.dataFim ?? "",
      duracao: "1",
      primeiroVencimento,
      paymentMethod: source?.paymentMethod ?? "",
      condicoes: source?.condicoes ?? "",
      financeNotes: source?.financeNotes ?? "",
      installments,
    };
  }

  function parseInstallments(value?: string): InstallmentDraft[] {
    try {
      const parsed: unknown = value ? JSON.parse(value) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((entry, index) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        return [
          {
            number: typeof item.number === "number" ? item.number : index + 1,
            dueDate: typeof item.dueDate === "string" ? item.dueDate : "",
            amount:
              typeof item.amountCents === "number"
                ? (item.amountCents / 100).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })
                : "",
            status: typeof item.status === "string" ? item.status : "pending",
          },
        ];
      });
    } catch {
      return [];
    }
  }

  /** Keeps the editable value in Brazilian format while the API receives ISO. */
  function formatDateForField(value: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
  }

  function parseDateField(value: string): string | null {
    if (!value) return "";

    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value);
    if (!match) return null;

    const [, day, month, year] = match;
    const isoDate = `${year}-${month}-${day}`;
    const date = new Date(`${isoDate}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
      ? null
      : isoDate;
  }

  function updateDateField(event: Event, update: (date: string) => void): void {
    const input = event.currentTarget as HTMLInputElement;
    input.value = formatDateDraft(input.value);
    const parsed = parseDateField(input.value);
    input.setCustomValidity(
      parsed === null ? "Use uma data válida no formato DD/MM/AAAA." : "",
    );
    if (parsed !== null) update(parsed);
  }

  function formatDateDraft(value: string): string {
    const digits = value.replace(/\D/gu, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  function updateDateFromPicker(
    event: Event,
    update: (date: string) => void,
  ): void {
    update((event.currentTarget as HTMLInputElement).value);
  }

  function openDatePicker(event: MouseEvent): void {
    (event.currentTarget as HTMLInputElement).showPicker?.();
  }

  function endDateForDuration(startDate: string, duration: string): string {
    if (!startDate) return "";

    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(startDate);
    if (!match) return "";

    const [, year, month, day] = match;
    const months = Math.max(1, Number.parseInt(duration, 10) || 1);
    const targetYear = Number(year);
    const targetMonth = Number(month) - 1 + months;
    const lastDayOfTargetMonth = new Date(
      Date.UTC(targetYear, targetMonth + 1, 0),
    ).getUTCDate();
    const endDate = new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        Math.min(Number(day), lastDayOfTargetMonth) - 1,
      ),
    );
    return endDate.toISOString().slice(0, 10);
  }

  function updateStartDate(value: string): void {
    form.dataInicio = value;
    form.dataFim = endDateForDuration(value, form.duracao);
  }

  function updateDuration(value: string): void {
    const duration = Math.max(1, Number.parseInt(value, 10) || 1);
    form.duracao = String(duration);
    form.dataFim = endDateForDuration(form.dataInicio, form.duracao);
  }

  function updateInstallmentCount(value: string): void {
    const count = Math.max(1, Math.min(99, Number.parseInt(value, 10) || 1));
    const total = moneyToCents(form.valor);
    const amounts = splitCents(total, count);
    form.installments = Array.from({ length: count }, (_, index) => ({
      number: index + 1,
      dueDate:
        form.installments[index]?.dueDate ||
        addMonthsToFinanceDate(form.primeiroVencimento, index),
      amount: centsToMoney(amounts[index] ?? 0),
      status: form.installments[index]?.status || "pending",
    }));
  }

  function updateAmount(value: string): void {
    form.valor = value;
    if (form.contractType === "one_off") {
      updateInstallmentCount(String(Math.max(1, form.installments.length)));
    }
  }

  function updateFirstDueDate(value: string): void {
    form.primeiroVencimento = value;
    if (form.contractType !== "one_off") return;
    form.installments = form.installments.map((installment, index) => ({
      ...installment,
      dueDate: addMonthsToFinanceDate(value, index),
    }));
  }

  function updateContractType(value: "one_off" | "recurring"): void {
    form.contractType = value;
    if (value === "recurring") {
      form.installments = [];
      return;
    }
    updateInstallmentCount(String(Math.max(1, form.installments.length)));
  }

  function rebalanceInstallments(changedIndex: number, value: string): void {
    const total = moneyToCents(form.valor);
    const previousTotal = form.installments
      .slice(0, changedIndex)
      .reduce((sum, installment) => sum + moneyToCents(installment.amount), 0);
    const changedAmount = Math.min(
      moneyToCents(value),
      Math.max(0, total - previousTotal),
    );
    const followingAmounts = splitCents(
      total - previousTotal - changedAmount,
      form.installments.length - changedIndex - 1,
    );
    form.installments = form.installments.map((installment, index) => {
      if (index < changedIndex) return installment;
      if (index === changedIndex)
        return { ...installment, amount: centsToMoney(changedAmount) };
      return {
        ...installment,
        amount: centsToMoney(followingAmounts[index - changedIndex - 1] ?? 0),
      };
    });
  }

  function nextScopeId(prefix: string): string {
    scopeSeq += 1;
    return `${prefix}-${scopeSeq}`;
  }

  function applyServicePackage(packageId: string): void {
    selectedServiceId = packageId;
    customizeScopeOpen = false;
    activeScopeProjectLocalId = null;
    editingDeliveryModal = null;
    scopeError = "";
    const pkg = servicePackages.find((item) => item.id === packageId);
    if (!pkg) {
      scopeProjects = [];
      return;
    }

    scopeProjects = pkg.projects.map((project) => ({
      localId: nextScopeId("proj"),
      id: project.id,
      isInstitutional: project.isInstitutional,
      included: true,
      name: project.name,
      briefing: project.briefing,
      projectType: project.projectType,
      durationDays: project.durationDays ? String(project.durationDays) : "",
      responsibleUserId: "",
      deliveries: project.deliveries.map((delivery) => ({
        localId: nextScopeId("del"),
        id: delivery.id,
        name: delivery.name,
        description: delivery.description,
        priority: delivery.priority || "normal",
        recurrenceType: delivery.recurrenceType,
        recurrenceUnit: delivery.recurrenceUnit,
        recurrenceDays: [...delivery.recurrenceDays],
        tasks: delivery.tasks.map((task) => ({
          localId: nextScopeId("task"),
          id: task.id,
          name: task.name,
          durationMinutes: task.durationMinutes,
        })),
      })),
    }));

    form.nome = pkg.name;
    form.paymentMethod = pkg.paymentMethod;
    form.condicoes = pkg.paymentTerms;
    if (pkg.durationMonths) {
      form.duracao = String(pkg.durationMonths);
      form.dataFim = endDateForDuration(form.dataInicio, form.duracao);
    }
    form.valor = pkg.amountCents > 0 ? centsToMoney(pkg.amountCents) : "";
    if (form.contractType === "one_off") {
      updateInstallmentCount(String(Math.max(1, pkg.installmentCount || 1)));
    }
  }

  function addCustomScopeProject(): void {
    if (scopeProjects.length >= MAX_SERVICE_PROJECTS) return;
    const explicitCount = scopeProjects.filter(
      (project) => !project.isInstitutional,
    ).length;
    const created: ContractScopeProjectDraft = {
      localId: nextScopeId("proj"),
      isInstitutional: false,
      included: true,
      name: `Projeto ${String(explicitCount + 1).padStart(2, "0")}`,
      briefing: "",
      projectType: "one_off",
      durationDays: "",
      responsibleUserId: "",
      deliveries: [],
    };
    scopeProjects = [...scopeProjects, created];
    customizeScopeOpen = true;
    activeScopeProjectLocalId = created.localId;
  }

  function openScopeProjectDrawer(project: ContractScopeProjectDraft): void {
    project.included = true;
    activeScopeProjectLocalId = project.localId;
  }

  function removeCustomScopeProject(localId: string): void {
    scopeProjects = scopeProjects.filter(
      (project) => project.isInstitutional || project.localId !== localId,
    );
    if (activeScopeProjectLocalId === localId) {
      activeScopeProjectLocalId = null;
    }
  }

  function openAddDeliveryModal(project: ContractScopeProjectDraft): void {
    editingDeliveryModal = {
      projectLocalId: project.localId,
      isNew: true,
      delivery: {
        localId: nextScopeId("del"),
        name: "",
        description: "",
        priority: "normal",
        recurrenceType:
          project.projectType === "recurring" ? "monthly" : "one_off",
        recurrenceUnit: null,
        recurrenceDays: project.projectType === "recurring" ? [1] : [],
        tasks: [
          {
            localId: nextScopeId("task"),
            name: "",
            durationMinutes: 60,
          },
        ],
      },
    };
  }

  function openEditDeliveryModal(
    project: ContractScopeProjectDraft,
    delivery: ContractScopeDeliveryDraft,
  ): void {
    editingDeliveryModal = {
      projectLocalId: project.localId,
      isNew: false,
      delivery: {
        ...delivery,
        recurrenceDays: [...delivery.recurrenceDays],
        tasks: delivery.tasks.map((task) => ({ ...task })),
      },
    };
  }

  function saveDeliveryDraft(updated: ContractScopeDeliveryDraft): void {
    if (!editingDeliveryModal) return;
    const targetId = editingDeliveryModal.projectLocalId;
    const isNew = editingDeliveryModal.isNew;
    scopeProjects = scopeProjects.map((project) => {
      if (project.localId !== targetId) return project;
      const deliveries = isNew
        ? [...project.deliveries, updated]
        : project.deliveries.map((item) =>
            item.localId === updated.localId ? updated : item,
          );
      return { ...project, deliveries };
    });
    editingDeliveryModal = null;
  }

  function duplicateDeliveryDraft(
    projectLocalId: string,
    source: ContractScopeDeliveryDraft,
  ): void {
    scopeProjects = scopeProjects.map((project) => {
      if (project.localId !== projectLocalId || project.deliveries.length >= 100)
        return project;
      const copy: ContractScopeDeliveryDraft = {
        localId: nextScopeId("del"),
        name: `${source.name || "Entrega"} (cópia)`.slice(0, 140),
        description: source.description,
        priority: source.priority,
        recurrenceType: source.recurrenceType,
        recurrenceUnit: source.recurrenceUnit,
        recurrenceDays: [...source.recurrenceDays],
        tasks: source.tasks.map((task) => ({
          localId: nextScopeId("task"),
          name: task.name,
          durationMinutes: task.durationMinutes,
        })),
      };
      const index = project.deliveries.findIndex(
        (item) => item.localId === source.localId,
      );
      const next = [...project.deliveries];
      next.splice(index + 1, 0, copy);
      return { ...project, deliveries: next };
    });
  }

  function removeDeliveryDraft(
    projectLocalId: string,
    deliveryLocalId: string,
  ): void {
    scopeProjects = scopeProjects.map((project) => {
      if (project.localId !== projectLocalId) return project;
      return {
        ...project,
        deliveries: project.deliveries.filter(
          (item) => item.localId !== deliveryLocalId,
        ),
      };
    });
    if (editingDeliveryModal?.delivery.localId === deliveryLocalId) {
      editingDeliveryModal = null;
    }
  }

  async function loadMembersForWorkspace(workspaceId: string): Promise<void> {
    membersRequest?.abort();
    if (!workspaceId) {
      workspaceMembers = [];
      responsibleUserId = "";
      membersError = "";
      return;
    }
    const controller = new AbortController();
    membersRequest = controller;
    loadingMembers = true;
    membersError = "";
    try {
      const options = await getProjectOptions({
        workspaceId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      workspaceMembers = options.members;
      if (
        !options.members.some((member) => member.userId === responsibleUserId)
      ) {
        responsibleUserId =
          options.members.length === 1 ? options.members[0]!.userId : "";
      }
      const validIds = new Set(options.members.map((member) => member.userId));
      scopeProjects = scopeProjects.map((project) =>
        project.responsibleUserId && !validIds.has(project.responsibleUserId)
          ? { ...project, responsibleUserId: "" }
          : project,
      );
    } catch {
      if (controller.signal.aborted) return;
      workspaceMembers = [];
      responsibleUserId = "";
      membersError = "Não foi possível carregar os responsáveis do workspace.";
    } finally {
      if (membersRequest === controller) loadingMembers = false;
    }
  }

  $effect(() => {
    form = emptyForm(record);
  });

  $effect(() => {
    if (!isCreateMode || !selectedServiceId) return;
    void loadMembersForWorkspace(form.workspaceId);
  });

  onMount(() => {
    workspaces = loadWorkspaces();
    if (!form.workspaceId) form.workspaceId = loadActiveWorkspaceId(workspaces);
    void refreshWorkspaceSnapshot()
      .then((items) => {
        workspaces = items;
        if (!form.workspaceId) form.workspaceId = loadActiveWorkspaceId(items);
      })
      .catch(() => {
        workspaceError = "Não foi possível carregar os workspaces.";
      });
    void listAllActiveBusinesses()
      .then((items) => {
        businesses = items;
        if (!form.negocioId && items.length === 1)
          form.negocioId = items[0]!.id;
      })
      .catch(() => {
        businessError = "Não foi possível carregar os negócios disponíveis.";
      })
      .finally(() => {
        loadingBusinesses = false;
      });

    if (mode === "create") {
      loadingServices = true;
      void listServicePackages({ archived: "exclude" })
        .then((response) => {
          servicePackages = response.items;
          if (
            initialServicePackageId &&
            response.items.some((item) => item.id === initialServicePackageId)
          ) {
            applyServicePackage(initialServicePackageId);
          }
        })
        .catch(() => {
          servicePackages = [];
        })
        .finally(() => {
          loadingServices = false;
        });
    }

    return () => {
      membersRequest?.abort();
    };
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (viewOnly || !form.nome.trim() || !form.negocioId || !form.workspaceId)
      return;
    if (isCreateMode && selectedService && !responsibleUserId) return;

    const payload: Record<string, string> = {
      nome: form.nome.trim(),
      workspaceId: form.workspaceId,
      negocioId: form.negocioId,
      contractType: form.contractType,
      valor: form.valor.trim(),
      dataInicio: form.dataInicio,
      dataFim: form.dataFim,
      primeiroVencimento: form.primeiroVencimento,
      paymentMethod: form.paymentMethod.trim(),
      condicoes: form.condicoes.trim(),
      financeNotes: form.financeNotes.trim(),
      installments: JSON.stringify(
        form.installments.map((item, index) => ({
          number: index + 1,
          dueDate: item.dueDate,
          amountCents: moneyToCents(item.amount),
          status: item.status,
        })),
      ),
    };

    if (isCreateMode && selectedService && responsibleUserId) {
      scopeError = "";
      const includedProjects = scopeProjects.filter((project) => project.included);
      const invalidProject = includedProjects.find(
        (project) => !project.isInstitutional && !project.name.trim(),
      );
      if (invalidProject) {
        scopeError = "Todo projeto incluído no contrato precisa ter um nome.";
        customizeScopeOpen = true;
        activeScopeProjectLocalId = invalidProject.localId;
        return;
      }

      const customProjects = includedProjects.map((project) => {
        const parsedDays =
          !project.isInstitutional && project.durationDays.trim()
            ? Number.parseInt(project.durationDays.trim(), 10)
            : null;
        return {
          ...(project.id ? { id: project.id } : {}),
          isInstitutional: project.isInstitutional,
          name: project.isInstitutional ? "Institucional" : project.name.trim(),
          briefing: project.briefing.trim(),
          projectType: project.projectType,
          durationDays:
            parsedDays && Number.isInteger(parsedDays) && parsedDays >= 1
              ? Math.min(3650, parsedDays)
              : null,
          ...(project.responsibleUserId &&
          project.responsibleUserId !== responsibleUserId
            ? { responsibleUserId: project.responsibleUserId }
            : {}),
          deliveries: project.deliveries.map((delivery) => ({
            ...(delivery.id ? { id: delivery.id } : {}),
            name: delivery.name.trim(),
            description: delivery.description.trim(),
            priority: delivery.priority || "normal",
            recurrenceType:
              project.projectType === "recurring"
                ? delivery.recurrenceType
                : ("one_off" as const),
            recurrenceUnit:
              project.projectType === "recurring" &&
              delivery.recurrenceType === "custom"
                ? (delivery.recurrenceUnit ?? "week")
                : null,
            recurrenceDays:
              project.projectType === "recurring"
                ? [...delivery.recurrenceDays]
                : [],
            tasks: delivery.tasks
              .filter((task) => task.name.trim())
              .map((task) => ({
                ...(task.id ? { id: task.id } : {}),
                name: task.name.trim(),
                durationMinutes: task.durationMinutes,
              })),
          })),
        };
      });

      payload.servicePackage = JSON.stringify({
        packageId: selectedService.id,
        responsibleUserId,
        customProjects,
      });
    }

    onsave(payload);
  }
</script>

<div
  class="backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && oncancel()}
>
  <div
    class="dialog"
    class:dialog--split={Boolean(activeScopeProject)}
    role="dialog"
    aria-modal="true"
    aria-labelledby="contract-form-title"
  >
    <header>
      <h2 id="contract-form-title">{modalTitle}</h2>
      <button
        class="close"
        type="button"
        aria-label="Fechar"
        onclick={oncancel}
      >
        <X size={18} strokeWidth={2} />
      </button>
    </header>

    <div class="dialog-workspace" class:split={Boolean(activeScopeProject)}>
      <div class="body">
        <form class:view-mode={viewOnly} onsubmit={submit}>
          {#if isCreateMode && (servicePackages.length > 0 || loadingServices)}
            <section class="form-section service-blueprint-section">
              <div class="service-section-head">
                <h3>Modelo de serviço</h3>
                {#if selectedService}
                  <button
                    type="button"
                    class="clear-service-btn"
                    onclick={() => applyServicePackage("")}
                  >
                    Remover modelo
                  </button>
                {/if}
              </div>

              {#if selectedService}
                <div
                  class="selected-service-banner"
                  style={`--svc-accent: ${selectedServiceAccent}`}
                >
                  <span class="svc-emblem" aria-hidden="true">
                    <SelectedServiceIcon size={18} strokeWidth={2} />
                  </span>
                  <div class="svc-copy">
                    <strong>{selectedService.name}</strong>
                    <span>
                      {selectedScopeStats.projects}
                      {selectedScopeStats.projects === 1 ? "projeto" : "projetos"}
                      · {selectedScopeStats.deliveries}
                      {selectedScopeStats.deliveries === 1
                        ? "entrega"
                        : "entregas"}
                      · {formatServiceHours(selectedScopeStats.minutes)}
                    </span>
                  </div>
                  <button
                    type="button"
                    class="customize-scope-btn"
                    class:open={customizeScopeOpen}
                    aria-expanded={customizeScopeOpen}
                    onclick={() => {
                      customizeScopeOpen = !customizeScopeOpen;
                      if (!customizeScopeOpen) activeScopeProjectLocalId = null;
                    }}
                  >
                    <SlidersHorizontal size={13.5} />
                    <span>Personalizar escopo</span>
                    <ChevronDown size={14} />
                  </button>
                </div>

                {#if scopeError}
                  <p class="catalog-state catalog-state--error" role="alert">
                    {scopeError}
                  </p>
                {/if}

                {#if customizeScopeOpen}
                  <div class="scope-checklist">
                    <div class="scope-list-head">
                      <p class="scope-hint">
                        Clique em um projeto para editar detalhes e entregas ao
                        lado.
                      </p>
                      <button
                        type="button"
                        class="scope-add-proj-btn"
                        disabled={scopeProjects.length >= MAX_SERVICE_PROJECTS}
                        onclick={addCustomScopeProject}
                      >
                        <Plus size={13} strokeWidth={2.3} />
                        <span>Novo projeto</span>
                      </button>
                    </div>

                    {#each scopeProjects as project (project.localId)}
                      <div
                        class="scope-row"
                        class:active={activeScopeProjectLocalId ===
                          project.localId}
                        class:disabled-row={!project.included}
                      >
                        <input
                          class="scope-checkbox"
                          type="checkbox"
                          aria-label={`Incluir ${project.name}`}
                          checked={project.included}
                          onchange={(event) => {
                            project.included = event.currentTarget.checked;
                            if (
                              !project.included &&
                              activeScopeProjectLocalId === project.localId
                            ) {
                              activeScopeProjectLocalId = null;
                            }
                          }}
                        />

                        <button
                          type="button"
                          class="scope-project-trigger"
                          onclick={() => openScopeProjectDrawer(project)}
                        >
                          <span class="scope-project-title">
                            {#if project.isInstitutional}
                              <Shield size={13.5} />
                            {:else}
                              <FolderKanban size={13.5} />
                            {/if}
                            <strong>
                              {project.name.trim() || "Projeto sem nome"}
                            </strong>
                            <em
                              class="scope-nature"
                              class:recurring={project.projectType ===
                                "recurring"}
                            >
                              {#if project.projectType === "recurring"}
                                <Repeat size={10.5} /> Recorrente
                              {:else}
                                <CircleDot size={10.5} /> Pontual
                              {/if}
                            </em>
                          </span>
                          <small>
                            {project.deliveries.length}
                            {project.deliveries.length === 1
                              ? "entrega"
                              : "entregas"}
                          </small>
                        </button>

                        <button
                          type="button"
                          class="scope-edit-btn"
                          onclick={() => openScopeProjectDrawer(project)}
                        >
                          <Pencil size={13} />
                          <span>Editar</span>
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              {:else}
                <div class="control full">
                  <span class="control-icon" aria-hidden="true">
                    <Package size={16} strokeWidth={1.8} />
                  </span>
                  <select
                    value={selectedServiceId}
                    disabled={loadingServices}
                    aria-label="Usar um serviço como modelo"
                    onchange={(event) =>
                      applyServicePackage(event.currentTarget.value)}
                  >
                    <option value="">
                      {loadingServices
                        ? "Carregando serviços…"
                        : "Nenhum — criar contrato do zero"}
                    </option>
                    {#each servicePackages as pkg (pkg.id)}
                      <option value={pkg.id}>
                        {pkg.name} ({pkg.metrics.explicitProjects > 0
                          ? `${pkg.metrics.explicitProjects} proj.`
                          : `${pkg.metrics.totalDeliveries} ent.`})
                      </option>
                    {/each}
                  </select>
                </div>
              {/if}
            </section>
          {/if}

        <section class="form-section">
          <h3>Contrato</h3>

          <div class="fields">
            <div class="control full">
              <span class="control-icon" aria-hidden="true">
                <FileText size={16} strokeWidth={1.8} />
              </span>
              <input
                bind:value={form.nome}
                disabled={viewOnly}
                required
                maxlength="140"
                placeholder="Nome do contrato *"
                aria-label="Nome do contrato"
              />
            </div>

            <div class="two-column-grid full">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <BriefcaseBusiness size={16} strokeWidth={1.8} />
                </span>
                <select
                  bind:value={form.workspaceId}
                  disabled={viewOnly || mode === "edit"}
                  required
                  aria-label="Workspace do contrato"
                >
                  <option value="" disabled>Selecione o workspace *</option>
                  {#each workspaces as workspace (workspace.id)}
                    <option value={workspace.id}>{workspace.name}</option>
                  {/each}
                </select>
              </div>

              {#if workspaceError}
                <p class="catalog-state catalog-state--error" role="alert">
                  {workspaceError}
                </p>
              {/if}

              <div class="control business-control">
                <span class="control-icon" aria-hidden="true">
                  <BriefcaseBusiness size={16} strokeWidth={1.8} />
                </span>
                <select
                  bind:value={form.negocioId}
                  disabled={viewOnly || loadingBusinesses}
                  required
                  aria-label="Negócio vinculado"
                >
                  <option value="" disabled>Selecione o negócio *</option>
                  {#each businesses as business (business.id)}
                    <option value={business.id}>{business.name}</option>
                  {/each}
                </select>
              </div>
            </div>

            {#if isCreateMode && selectedService}
              <div class="control full">
                <span class="control-icon" aria-hidden="true">
                  <UserCheck size={16} strokeWidth={1.8} />
                </span>
                <select
                  bind:value={responsibleUserId}
                  disabled={loadingMembers || !form.workspaceId}
                  required
                  aria-label="Responsável padrão pelos projetos e entregas"
                >
                  <option value="" disabled>
                    {loadingMembers
                      ? "Carregando responsáveis…"
                      : "Selecione o responsável *"}
                  </option>
                  {#each workspaceMembers as member (member.userId)}
                    <option value={member.userId}>{member.name}</option>
                  {/each}
                </select>
              </div>
              {#if membersError}
                <p class="catalog-state catalog-state--error" role="alert">
                  {membersError}
                </p>
              {/if}
            {/if}

            {#if loadingBusinesses}
              <p class="catalog-state" role="status">Carregando negócios…</p>
            {:else if businessError}
              <p class="catalog-state catalog-state--error" role="alert">
                {businessError}
              </p>
            {:else if !businesses.length}
              <p class="catalog-state catalog-state--error" role="alert">
                Cadastre um negócio antes de criar um contrato.
              </p>
            {/if}

            <div class="two-column-grid full">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <FileText size={16} strokeWidth={1.8} />
                </span>
                <select
                  value={form.contractType}
                  disabled={viewOnly}
                  onchange={(event) =>
                    updateContractType(
                      event.currentTarget.value as "one_off" | "recurring",
                    )}
                  aria-label="Tipo de contratação"
                >
                  <option value="one_off">Pontual</option>
                  <option value="recurring">Recorrente</option>
                </select>
              </div>
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <CircleDollarSign size={16} strokeWidth={1.8} />
                </span>
                <input
                  value={form.valor}
                  disabled={viewOnly}
                  inputmode="decimal"
                  placeholder="Valor"
                  aria-label="Valor do contrato"
                  oninput={(event) => updateAmount(event.currentTarget.value)}
                />
              </div>
            </div>
          </div>
        </section>

        <section class="form-section">
          <h3>Vigência</h3>
          <div class="three-column-grid full">
            <div class="control date-control">
              <span class="control-icon" aria-hidden="true">
                <CalendarDays size={16} strokeWidth={1.8} />
              </span>
              <input
                class="date-picker"
                type="date"
                onclick={openDatePicker}
                disabled={viewOnly}
                value={form.dataInicio}
                aria-label="Abrir calendário para a data de início"
                onchange={(event) =>
                  updateDateFromPicker(event, updateStartDate)}
              />
              <input
                disabled={viewOnly}
                type="text"
                inputmode="numeric"
                autocomplete="off"
                maxlength="10"
                placeholder="Início"
                value={formatDateForField(form.dataInicio)}
                aria-label="Data de início (DD/MM/AAAA)"
                oninput={(event) => updateDateField(event, updateStartDate)}
              />
            </div>
            <div class="control date-control">
              <span class="control-icon" aria-hidden="true">
                <CalendarDays size={16} strokeWidth={1.8} />
              </span>
              <input
                disabled
                type="text"
                placeholder="Fim"
                value={formatDateForField(form.dataFim)}
                aria-label="Data de fim calculada"
              />
            </div>
            <div class="control duration-control">
              <input
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                disabled={viewOnly}
                value={form.duracao}
                aria-label="Duração em meses"
                oninput={(event) => updateDuration(event.currentTarget.value)}
              />
              <span class="duration-suffix">/mês</span>
            </div>
          </div>
        </section>

        <section class="form-section">
          <h3>Pagamento</h3>
          <div class="fields">
            {#if form.contractType === "one_off"}
              <div class="payment-grid full">
                <div class="control payment-method">
                  <span class="control-icon" aria-hidden="true">
                    <CreditCard size={16} strokeWidth={1.8} />
                  </span>
                  <input
                    bind:value={form.paymentMethod}
                    disabled={viewOnly}
                    maxlength="120"
                    placeholder="Forma de pagamento"
                    aria-label="Forma de pagamento"
                  />
                </div>
                <div class="control installment-count">
                  <span class="control-label">Parcelas</span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    disabled={viewOnly}
                    title="Parcelas"
                    aria-label="Parcelas"
                    value={Math.max(1, form.installments.length)}
                    onchange={(event) =>
                      updateInstallmentCount(event.currentTarget.value)}
                  />
                </div>
              </div>

              <div class="installment-list full">
                {#each form.installments as installment, index (installment.number)}
                  <div class="installment-row">
                    <div class="installment-date-group">
                      <div
                        class="installment-index"
                        aria-label={`Parcela ${installment.number}`}
                      >
                        <span class="installment-hash" aria-hidden="true"
                          >#</span
                        >
                        <span
                          >{String(installment.number).padStart(2, "0")}</span
                        >
                      </div>
                      <div class="control date-control">
                        <span class="control-icon" aria-hidden="true">
                          <CalendarDays size={16} strokeWidth={1.8} />
                        </span>
                        <input
                          class="date-picker"
                          type="date"
                          onclick={openDatePicker}
                          disabled={viewOnly}
                          value={installment.dueDate}
                          aria-label={`Abrir calendário para o vencimento da parcela ${installment.number}`}
                          onchange={(event) => {
                            if (index === 0) {
                              updateDateFromPicker(event, updateFirstDueDate);
                            } else {
                              updateDateFromPicker(
                                event,
                                (date) => (installment.dueDate = date),
                              );
                            }
                          }}
                        />
                        <input
                          disabled={viewOnly}
                          type="text"
                          inputmode="numeric"
                          autocomplete="off"
                          maxlength="10"
                          placeholder="DD/MM/AAAA"
                          required={index === 0 && moneyToCents(form.valor) > 0}
                          value={formatDateForField(installment.dueDate)}
                          aria-label={`Vencimento da parcela ${installment.number} (DD/MM/AAAA)`}
                          oninput={(event) =>
                            updateDateField(event, (date) => {
                              if (index === 0) {
                                updateFirstDueDate(date);
                              } else {
                                installment.dueDate = date;
                              }
                            })}
                        />
                      </div>
                    </div>
                    <div class="control installment-amount">
                      <span class="control-icon" aria-hidden="true">R$</span>
                      <input
                        inputmode="decimal"
                        disabled={viewOnly}
                        placeholder="Valor"
                        bind:value={installment.amount}
                        aria-label={`Valor da parcela ${installment.number}`}
                        onchange={(event) =>
                          rebalanceInstallments(
                            index,
                            event.currentTarget.value,
                          )}
                      />
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="two-column-grid full">
                <div class="control">
                  <span class="control-icon" aria-hidden="true">
                    <CreditCard size={16} strokeWidth={1.8} />
                  </span>
                  <input
                    bind:value={form.paymentMethod}
                    disabled={viewOnly}
                    maxlength="120"
                    placeholder="Forma de pagamento"
                    aria-label="Forma de pagamento"
                  />
                </div>
                <div class="control date-control">
                  <span class="control-icon" aria-hidden="true">
                    <CalendarDays size={16} strokeWidth={1.8} />
                  </span>
                  <input
                    class="date-picker"
                    type="date"
                    onclick={openDatePicker}
                    disabled={viewOnly}
                    value={form.primeiroVencimento}
                    aria-label="Abrir calendário para a data de vencimento"
                    onchange={(event) =>
                      updateDateFromPicker(event, updateFirstDueDate)}
                  />
                  <input
                    disabled={viewOnly}
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    maxlength="10"
                    placeholder="DD/MM/AAAA"
                    value={formatDateForField(form.primeiroVencimento)}
                    aria-label="Data de vencimento (DD/MM/AAAA)"
                    oninput={(event) =>
                      updateDateField(event, updateFirstDueDate)}
                  />
                </div>
              </div>
            {/if}
          </div>
        </section>

        <section class="form-section">
          <h3>Condições financeiras</h3>

          <div class="fields">
            <div class="control textarea-control full">
              <span class="control-icon" aria-hidden="true">
                <FileText size={16} strokeWidth={1.8} />
              </span>
              <textarea
                bind:value={form.condicoes}
                disabled={viewOnly}
                maxlength="2000"
                rows="4"
                placeholder="Observações"
                aria-label="Observações"></textarea>
            </div>
          </div>
        </section>

        <div class="actions">
          {#if viewOnly}
            <div class="action-group action-group-right">
              <button class="primary" type="button" onclick={onedit}>
                <Pencil size={16} strokeWidth={2} />
                <span>Editar</span>
              </button>
            </div>
          {:else if mode === "edit"}
            <div class="action-group">
              <button class="danger" type="button" onclick={ondelete}>
                <Trash2 size={16} strokeWidth={2} />
                <span>Excluir</span>
              </button>
            </div>
            <div class="action-group action-group-right">
              <button class="cancel" type="button" onclick={oncancel}>
                <X size={16} strokeWidth={2} />
                <span>Cancelar</span>
              </button>
              <button
                class="success"
                type="submit"
                disabled={loadingBusinesses ||
                  !businesses.length ||
                  !form.workspaceId}
              >
                <Save size={16} strokeWidth={2} />
                <span>Salvar</span>
              </button>
            </div>
          {:else}
            <div class="action-group action-group-right">
              <button class="cancel" type="button" onclick={oncancel}>
                <X size={16} strokeWidth={2} />
                <span>Cancelar</span>
              </button>
              <button
                class="success"
                type="submit"
                disabled={loadingBusinesses ||
                  !businesses.length ||
                  !form.workspaceId ||
                  (Boolean(selectedService) &&
                    (!responsibleUserId || loadingMembers))}
              >
                <Save size={16} strokeWidth={2} />
                <span>Criar contrato</span>
              </button>
            </div>
          {/if}
        </div>
      </form>
      </div>

      {#if activeScopeProject && scopeProjects[activeScopeProjectIndex]}
        <ContractProjectDrawer
          bind:project={scopeProjects[activeScopeProjectIndex]}
          {workspaceMembers}
          onclose={() => (activeScopeProjectLocalId = null)}
          onadddelivery={() => openAddDeliveryModal(activeScopeProject)}
          oneditdelivery={(delivery) =>
            openEditDeliveryModal(activeScopeProject, delivery)}
          onduplicatedelivery={(delivery) =>
            duplicateDeliveryDraft(activeScopeProject.localId, delivery)}
          onremovedelivery={(deliveryLocalId) =>
            removeDeliveryDraft(activeScopeProject.localId, deliveryLocalId)}
          onremoveproject={activeScopeProject.isInstitutional
            ? undefined
            : () => removeCustomScopeProject(activeScopeProject.localId)}
        />
      {/if}
    </div>
  </div>
</div>

{#if editingDeliveryModal && editingDeliveryProject}
  <ContractDeliveryDraftModal
    delivery={editingDeliveryModal.delivery}
    projectName={editingDeliveryProject.name.trim() || "Projeto"}
    projectType={editingDeliveryProject.projectType}
    isNew={editingDeliveryModal.isNew}
    oncancel={() => (editingDeliveryModal = null)}
    onsave={saveDeliveryDraft}
    ondelete={editingDeliveryModal.isNew
      ? undefined
      : () =>
          removeDeliveryDraft(
            editingDeliveryModal!.projectLocalId,
            editingDeliveryModal!.delivery.localId,
          )}
  />
{/if}

<svelte:window
  onkeydown={(event) =>
    event.key === "Escape" && !editingDeliveryModal && oncancel()}
/>

<style>
  .backdrop {
    position: fixed;
    z-index: 3200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.52);
    inset: 0;
    animation: fade-in var(--motion-fast) ease-out;
  }

  .dialog {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(780px, 100%);
    max-height: min(88dvh, 940px);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--canvas);
    box-shadow: 0 22px 48px rgba(15, 23, 42, 0.18);
    transition: width var(--motion-base) ease;
    animation: rise var(--motion-base) ease-out;
  }

  .dialog.dialog--split {
    width: min(1180px, 100%);
  }

  .dialog-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }

  .dialog-workspace.split {
    grid-template-columns: minmax(0, 1.05fr) minmax(380px, 0.95fr);
  }

  .dialog > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--border);
  }

  h2,
  h3 {
    margin: 0;
    color: var(--ink-950);
    font-weight: 600;
  }

  h2 {
    font-size: var(--text-xl);
    line-height: 1.25;
  }

  h3 {
    font-size: var(--text-lg);
    line-height: 1.2;
  }

  .installment-list {
    display: grid;
    gap: 8px;
  }

  .close {
    display: inline-flex;
    width: auto;
    min-height: auto;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    color: var(--muted);
    background: transparent;
    box-shadow: none;
  }

  .close:hover {
    color: var(--text);
  }

  .body {
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 18px 18px 20px;
  }

  form {
    display: grid;
    gap: 14px;
  }

  .form-section {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--panel);
  }

  .fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px 10px;
  }

  .full {
    min-width: 0;
  }

  .two-column-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .three-column-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .payment-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .payment-method {
    grid-column: auto;
  }

  .installment-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .installment-date-group {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 10px;
    min-width: 0;
  }

  .installment-index {
    display: inline-flex;
    min-height: 58px;
    align-items: center;
    justify-content: center;
    gap: 1px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--surface-soft);
    color: var(--text-soft);
    font-size: var(--text-md);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    user-select: none;
  }

  .installment-hash {
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .control {
    position: relative;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    min-width: 0;
    min-height: 58px;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
    transition:
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease,
      background var(--motion-fast) ease;
  }

  .business-control {
    order: -1;
  }

  .control:focus-within {
    border-color: var(--primary);
    box-shadow: none;
  }

  .textarea-control {
    min-height: 128px;
    align-items: start;
    padding-block: 12px;
  }

  .control-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }

  .date-control .control-icon {
    pointer-events: none;
  }

  .date-picker {
    position: absolute;
    z-index: 1;
    top: 0;
    bottom: 0;
    left: 0;
    width: 42px;
    min-width: 0;
    opacity: 0;
    cursor: pointer;
  }

  .date-picker:disabled {
    cursor: default;
  }

  .control.installment-count {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .duration-control {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .duration-suffix {
    color: var(--muted);
    font-size: var(--text-sm);
    white-space: nowrap;
  }

  .control-label {
    color: var(--muted);
    font-size: var(--text-md);
    white-space: nowrap;
  }

  .textarea-control .control-icon {
    margin-top: 3px;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    outline: 0;
    color: var(--text);
    background: transparent;
    box-shadow: none;
    font: inherit;
    font-size: var(--text-md);
    font-weight: 400;
    line-height: 1.45;
  }

  select {
    cursor: pointer;
  }

  textarea {
    min-height: 98px;
    resize: vertical;
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--muted);
    opacity: 1;
  }

  .view-mode input:disabled,
  .view-mode select:disabled,
  .view-mode textarea:disabled {
    color: var(--text);
    opacity: 1;
    cursor: default;
    -webkit-text-fill-color: var(--text);
  }

  .view-mode textarea:disabled {
    resize: none;
  }

  .catalog-state {
    margin: 0 4px;
    color: var(--muted);
    font-size: var(--text-xs);
  }

  .catalog-state--error {
    color: var(--danger);
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 6px;
  }

  .action-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .action-group-right {
    margin-left: auto;
  }

  .actions button {
    display: inline-flex;
    min-width: 150px;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    color: white;
    font: inherit;
    font-size: var(--text-md);
    font-weight: 500;
    line-height: 1.2;
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease;
  }

  .primary {
    border: 1px solid var(--primary);
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
  }

  .primary:hover,
  .cancel:hover {
    border-color: #1f3fc2;
    background: #2447d8;
  }

  .success {
    border: 1px solid #16a34a;
    background: #16a34a;
    box-shadow: 0 8px 18px rgba(22, 163, 74, 0.22);
  }

  .success:hover {
    border-color: #15803d;
    background: #15803d;
  }

  .danger {
    border: 1px solid #dc2626;
    background: #dc2626;
    box-shadow: 0 8px 18px rgba(220, 38, 38, 0.24);
  }

  .danger:hover {
    border-color: #991b1b;
    background: #b91c1b;
  }

  .cancel {
    border: 1px solid var(--primary);
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
  }

  .actions button:disabled,
  .actions button:disabled:hover {
    border-color: var(--border);
    color: var(--muted);
    background: var(--surface-soft);
    box-shadow: none;
    cursor: not-allowed;
  }

  .service-blueprint-section {
    gap: 12px;
  }

  .service-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .clear-service-btn {
    padding: 4px 9px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--ink-500);
    background: var(--canvas);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .clear-service-btn:hover {
    border-color: var(--danger);
    color: var(--danger);
  }

  .selected-service-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--svc-accent) 28%, var(--border));
    border-radius: 14px;
    background: color-mix(in srgb, var(--svc-accent) 7%, var(--panel));
  }

  .svc-emblem {
    display: grid;
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    border: 1px solid color-mix(in srgb, var(--svc-accent) 28%, var(--border));
    border-radius: 11px;
    color: var(--svc-accent);
    background: var(--panel);
    place-items: center;
  }

  .svc-copy {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 2px;
  }

  .svc-copy strong {
    color: var(--ink-950);
    font-size: 14px;
    font-weight: 700;
  }

  .svc-copy span {
    color: var(--ink-500);
    font-size: 12px;
  }

  .customize-scope-btn {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid var(--border-strong);
    border-radius: 9px;
    color: var(--ink-700);
    background: var(--panel);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .customize-scope-btn.open :global(svg:last-child) {
    transform: rotate(180deg);
  }

  .scope-checklist {
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: var(--canvas);
  }

  .scope-list-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .scope-hint {
    margin: 0;
    color: var(--ink-500);
    font-size: 12px;
  }

  .scope-add-proj-btn {
    display: inline-flex;
    min-height: 28px;
    align-items: center;
    gap: 4px;
    padding: 0 9px;
    border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--border));
    border-radius: 8px;
    color: var(--brand-600);
    background: var(--brand-50);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .scope-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: var(--panel);
    transition:
      border-color var(--motion-fast) ease,
      background var(--motion-fast) ease;
  }

  .scope-row.active {
    border-color: color-mix(in srgb, var(--primary) 48%, var(--border));
    background: color-mix(in srgb, var(--primary) 7%, var(--panel));
  }

  .scope-row.disabled-row {
    opacity: 0.6;
  }

  .scope-checkbox {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
    accent-color: var(--primary);
    cursor: pointer;
  }

  .scope-project-trigger {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 2px;
    padding: 0;
    border: 0;
    outline: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .scope-project-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--ink-950);
    font-size: 13px;
  }

  .scope-project-trigger small {
    color: var(--ink-500);
    font-size: 11.5px;
  }

  .scope-edit-btn {
    display: inline-flex;
    min-height: 28px;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--ink-700);
    background: var(--canvas);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .scope-edit-btn:hover {
    border-color: var(--brand-500);
    color: var(--brand-600);
  }

  @media (max-width: 980px) {
    .dialog-workspace.split {
      grid-template-columns: minmax(0, 1fr);
      overflow-y: auto;
    }
    .dialog-workspace.split .body {
      overflow-y: visible;
    }
  }

  .scope-nature {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border-radius: var(--radius-pill);
    color: var(--brand-700);
    background: rgba(46, 86, 255, 0.1);
    font-size: 10.5px;
    font-style: normal;
    font-weight: 600;
  }

  .scope-nature.recurring {
    color: #1f6b47;
    background: rgba(93, 172, 131, 0.16);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes rise {
    from {
      transform: translateY(8px) scale(0.99);
    }
  }

  @media (max-width: 760px) {
    .backdrop {
      align-items: stretch;
      padding: 8px;
    }

    .dialog {
      width: 100%;
      max-height: calc(100dvh - 16px);
      border-radius: var(--radius-lg);
    }

    .dialog > header {
      padding: 14px 14px 12px;
    }

    .body {
      padding: 12px;
    }

    .form-section {
      padding: 12px;
      border-radius: var(--radius-lg);
    }

    .control {
      min-height: 52px;
      border-radius: var(--radius-lg);
    }

    .installment-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .installment-date-group {
      grid-template-columns: 52px minmax(0, 1fr);
    }

    .installment-index {
      min-height: 52px;
      border-radius: var(--radius-lg);
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr;
      align-items: stretch;
      justify-content: stretch;
    }

    .actions button {
      width: 100%;
    }

    .action-group {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .action-group-right {
      margin-left: 0;
    }
  }

  @media (max-width: 520px) {
    .two-column-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .three-column-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .payment-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .payment-method {
      grid-column: auto;
    }

    .installment-row {
      grid-template-columns: minmax(0, 1fr);
    }

    .installment-amount {
      grid-column: auto;
    }
  }
</style>
