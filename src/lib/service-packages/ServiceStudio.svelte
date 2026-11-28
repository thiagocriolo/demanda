<script lang="ts">
  import { goto } from "$app/navigation";
  import { getContext, onMount, tick, untrack } from "svelte";
  import {
    ENTITY_CREATE_CONTEXT,
    type EntityCreateContext,
  } from "$lib/entities/create-context";
  import { centsToMoney, moneyToCents } from "$lib/finance/money";
  import { INSTITUTIONAL_PROJECT_NAME } from "$lib/projects/institutional";
  import IconColorPicker from "$lib/ui/IconColorPicker.svelte";
  import { colorOptions, resolveColor } from "$lib/ui/icon-color";
  import PageHeader from "$lib/ui/PageHeader.svelte";
  import {
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    ArrowUpRight,
    BadgeCheck,
    BriefcaseBusiness,
    CalendarDays,
    CheckSquare2,
    ChevronDown,
    ChevronRight,
    CircleDollarSign,
    Clock3,
    Copy,
    CreditCard,
    Download,
    FileText,
    FolderKanban,
    ListChecks,
    ListTodo,
    Package,
    Plus,
    Repeat,
    Save,
    Search,
    Shield,
    SignalHigh,
    Timer,
    Trash2,
  } from "@lucide/svelte";
  import {
    createServicePackage,
    deleteServicePackage,
    ServicePackageApiError,
    updateServicePackage,
  } from "./client";
  import ScopeImportModal from "./ScopeImportModal.svelte";
  import {
    formatRecurrenceLabel,
    formatServiceHours,
    formatServiceMoney,
    MAX_EXPLICIT_SERVICE_PROJECTS,
    MAX_SERVICE_PROJECTS,
    summarizeServicePackage,
    type ServiceDeliveryRecurrenceType,
    type ServiceDeliveryRecurrenceUnit,
    type ServicePackage,
    type ServicePackageDeliveryInput,
    type ServicePackageProjectInput,
    type ServicePackageMutationInput,
    type ServiceProjectNature,
  } from "./types";

  type DraftTask = {
    localId: string;
    id?: string;
    name: string;
    durationHours: string;
  };

  type DraftDelivery = {
    localId: string;
    id?: string;
    name: string;
    description: string;
    priority: string;
    recurrenceType: ServiceDeliveryRecurrenceType;
    recurrenceUnit: ServiceDeliveryRecurrenceUnit | null;
    recurrenceDays: number[];
    tasks: DraftTask[];
  };

  type DraftProject = {
    localId: string;
    id?: string;
    isInstitutional: boolean;
    name: string;
    briefing: string;
    projectType: ServiceProjectNature;
    durationDays: string;
    deliveries: DraftDelivery[];
  };

  type DraftService = {
    name: string;
    description: string;
    icon: string;
    color: string;
    amount: string;
    contractType: "one_off" | "recurring";
    durationMonths: string;
    installmentCount: string;
    paymentMethod: string;
    paymentTerms: string;
    projects: DraftProject[];
  };

  let {
    initialPackage,
    mode = "create",
  }: {
    initialPackage?: ServicePackage;
    mode?: "create" | "edit";
  } = $props();

  const entityCreate = getContext<EntityCreateContext | undefined>(
    ENTITY_CREATE_CONTEXT,
  );

  let seq = 0;
  function nextLocalId(prefix: string): string {
    seq += 1;
    return `${prefix}-${seq}`;
  }

  function normalizeColorKey(value?: string): string {
    if (!value) return "blue";
    const lower = value.toLocaleLowerCase();
    return (
      colorOptions.find(
        (option) =>
          option.value === value || option.color.toLocaleLowerCase() === lower,
      )?.value ?? "blue"
    );
  }

  function minutesToHoursString(minutes: number): string {
    const hours = Math.max(0.5, Math.round((minutes / 60) * 2) / 2);
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  }

  function hoursStringToMinutes(value: string): number {
    const parsed = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return 60;
    const bounded = Math.min(168, Math.max(0.5, Math.round(parsed * 2) / 2));
    return Math.round(bounded * 60);
  }

  function normalizeHoursDisplay(value: string): string {
    return minutesToHoursString(hoursStringToMinutes(value));
  }

  function createInstitutionalProject(): DraftProject {
    return {
      localId: nextLocalId("proj"),
      isInstitutional: true,
      name: INSTITUTIONAL_PROJECT_NAME,
      briefing: "",
      projectType: "one_off",
      durationDays: "",
      deliveries: [],
    };
  }

  function draftFromPackage(pkg?: ServicePackage): DraftService {
    if (!pkg) {
      return {
        name: "",
        description: "",
        icon: "package",
        color: "blue",
        amount: "",
        contractType: "one_off",
        durationMonths: "",
        installmentCount: "1",
        paymentMethod: "",
        paymentTerms: "",
        projects: [createInstitutionalProject()],
      };
    }

    const mappedProjects: DraftProject[] = pkg.projects.map((project) => ({
      localId: nextLocalId("proj"),
      id: project.id,
      isInstitutional: project.isInstitutional,
      name: project.isInstitutional ? INSTITUTIONAL_PROJECT_NAME : project.name,
      briefing: project.briefing,
      projectType: project.isInstitutional ? "one_off" : project.projectType,
      durationDays:
        !project.isInstitutional && project.durationDays
          ? String(project.durationDays)
          : "",
      deliveries: project.deliveries.map((delivery) => ({
        localId: nextLocalId("del"),
        id: delivery.id,
        name: delivery.name,
        description: delivery.description,
        priority: delivery.priority || "normal",
        recurrenceType: project.isInstitutional
          ? "one_off"
          : delivery.recurrenceType,
        recurrenceUnit: project.isInstitutional
          ? null
          : delivery.recurrenceUnit,
        recurrenceDays: project.isInstitutional
          ? []
          : [...delivery.recurrenceDays],
        tasks: delivery.tasks.map((task) => ({
          localId: nextLocalId("task"),
          id: task.id,
          name: task.name,
          durationHours: minutesToHoursString(task.durationMinutes),
        })),
      })),
    }));

    if (!mappedProjects.some((project) => project.isInstitutional)) {
      mappedProjects.unshift(createInstitutionalProject());
    }

    return {
      name: pkg.name,
      description: pkg.description,
      icon: pkg.icon || "package",
      color: normalizeColorKey(pkg.color),
      amount: pkg.amountCents > 0 ? centsToMoney(pkg.amountCents) : "",
      contractType: pkg.contractType,
      durationMonths: pkg.durationMonths ? String(pkg.durationMonths) : "",
      installmentCount: String(Math.max(1, pkg.installmentCount || 1)),
      paymentMethod: pkg.paymentMethod,
      paymentTerms: pkg.paymentTerms,
      projects: mappedProjects,
    };
  }

  const initialDraft = untrack(() => draftFromPackage(initialPackage));
  const initialId = untrack(() => initialPackage?.id);
  const initialArchived = untrack(() => Boolean(initialPackage?.archivedAt));

  let draft = $state<DraftService>(initialDraft);
  let savedPackageId = $state<string | undefined>(initialId);
  let isArchived = $state<boolean>(initialArchived);
  let selectedSection = $state<"contract" | string>("contract");
  let projectSearch = $state("");
  let expandedDeliveries = $state<Record<string, boolean>>({});
  let saving = $state(false);
  let deleting = $state(false);
  let saveError = $state("");
  let saveSuccess = $state("");
  let savedSnapshot = $state(JSON.stringify(initialDraft));
  let importModalOpen = $state(false);
  let importKind = $state<"projects" | "deliveries">("deliveries");

  const accent = $derived(resolveColor(draft.color));
  const amountCents = $derived(moneyToCents(draft.amount));

  const institutionalProject = $derived(
    draft.projects.find((project) => project.isInstitutional)!,
  );
  const explicitProjects = $derived(
    draft.projects.filter((project) => !project.isInstitutional),
  );
  const filteredExplicitProjects = $derived.by(() => {
    const needle = projectSearch.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return explicitProjects;
    return explicitProjects.filter((project) =>
      project.name.toLocaleLowerCase("pt-BR").includes(needle),
    );
  });
  const activeProject = $derived(
    selectedSection === "contract"
      ? undefined
      : draft.projects.find((project) => project.localId === selectedSection),
  );
  const metrics = $derived(
    summarizeServicePackage(
      draft.projects.map((project) => ({
        isInstitutional: project.isInstitutional,
        projectType: project.projectType,
        deliveries: project.deliveries.map((delivery) => ({
          tasks: delivery.tasks
            .filter((task) => task.name.trim())
            .map((task) => ({
              durationMinutes: hoursStringToMinutes(task.durationHours),
            })),
        })),
      })),
      amountCents,
    ),
  );
  const isDirty = $derived(JSON.stringify(draft) !== savedSnapshot);

  function projectTotalMinutes(project: DraftProject): number {
    return project.deliveries.reduce(
      (sum, delivery) => sum + deliveryTotalMinutes(delivery),
      0,
    );
  }

  function deliveryTotalMinutes(delivery: DraftDelivery): number {
    return delivery.tasks.reduce(
      (sum, task) =>
        task.name.trim() ? sum + hoursStringToMinutes(task.durationHours) : sum,
      0,
    );
  }

  function addExplicitProject(): void {
    if (explicitProjects.length >= MAX_EXPLICIT_SERVICE_PROJECTS) return;
    const project: DraftProject = {
      localId: nextLocalId("proj"),
      isInstitutional: false,
      name: `Projeto ${String(explicitProjects.length + 1).padStart(2, "0")}`,
      briefing: "",
      projectType: "one_off",
      durationDays: "",
      deliveries: [],
    };
    draft.projects = [...draft.projects, project];
    selectedSection = project.localId;
    saveSuccess = "";
    void tick().then(() => {
      document
        .querySelector<HTMLInputElement>("[data-project-name-input]")
        ?.select();
    });
  }

  function duplicateProject(project: DraftProject): void {
    if (
      project.isInstitutional ||
      explicitProjects.length >= MAX_EXPLICIT_SERVICE_PROJECTS
    ) {
      return;
    }
    const clone: DraftProject = {
      localId: nextLocalId("proj"),
      isInstitutional: false,
      name: `${project.name || "Projeto"} (cópia)`.slice(0, 140),
      briefing: project.briefing,
      projectType: project.projectType,
      durationDays: project.durationDays,
      deliveries: project.deliveries.map((delivery) => ({
        localId: nextLocalId("del"),
        name: delivery.name,
        description: delivery.description,
        priority: delivery.priority,
        recurrenceType: delivery.recurrenceType,
        recurrenceUnit: delivery.recurrenceUnit,
        recurrenceDays: [...delivery.recurrenceDays],
        tasks: delivery.tasks.map((task) => ({
          localId: nextLocalId("task"),
          name: task.name,
          durationHours: task.durationHours,
        })),
      })),
    };
    const index = draft.projects.findIndex(
      (item) => item.localId === project.localId,
    );
    const next = [...draft.projects];
    next.splice(index + 1, 0, clone);
    draft.projects = next;
    selectedSection = clone.localId;
    saveSuccess = "";
  }

  function removeProject(project: DraftProject): void {
    if (project.isInstitutional) return;
    draft.projects = draft.projects.filter(
      (item) => item.localId !== project.localId,
    );
    if (selectedSection === project.localId) {
      selectedSection = "contract";
    }
    saveSuccess = "";
  }

  function moveExplicitProject(project: DraftProject, delta: -1 | 1): void {
    if (project.isInstitutional) return;
    const explicit = draft.projects.filter((item) => !item.isInstitutional);
    const currentIndex = explicit.findIndex(
      (item) => item.localId === project.localId,
    );
    const targetIndex = currentIndex + delta;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= explicit.length) {
      return;
    }
    const reordered = [...explicit];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved!);
    draft.projects = [institutionalProject, ...reordered];
  }

  function setProjectType(
    project: DraftProject,
    nextType: ServiceProjectNature,
  ): void {
    const resolvedType: ServiceProjectNature = project.isInstitutional
      ? "one_off"
      : nextType;
    project.projectType = resolvedType;
    if (resolvedType === "one_off") {
      for (const delivery of project.deliveries) {
        delivery.recurrenceType = "one_off";
        delivery.recurrenceUnit = null;
        delivery.recurrenceDays = [];
      }
    }
  }

  function addDelivery(project: DraftProject): void {
    if (project.deliveries.length >= 100) return;
    const delivery: DraftDelivery = {
      localId: nextLocalId("del"),
      name: "",
      description: "",
      priority: "normal",
      recurrenceType:
        project.projectType === "recurring" ? "monthly" : "one_off",
      recurrenceUnit: null,
      recurrenceDays: project.projectType === "recurring" ? [1] : [],
      tasks: [
        {
          localId: nextLocalId("task"),
          name: "",
          durationHours: "1",
        },
      ],
    };
    project.deliveries = [...project.deliveries, delivery];
    expandedDeliveries = { ...expandedDeliveries, [delivery.localId]: true };
    saveSuccess = "";
    void tick().then(() => {
      document
        .querySelector<HTMLInputElement>(
          `[data-delivery-name="${delivery.localId}"]`,
        )
        ?.focus();
    });
  }

  function duplicateDelivery(
    project: DraftProject,
    delivery: DraftDelivery,
  ): void {
    if (project.deliveries.length >= 100) return;
    const clone: DraftDelivery = {
      localId: nextLocalId("del"),
      name: `${delivery.name || "Entrega"} (cópia)`.slice(0, 140),
      description: delivery.description,
      priority: delivery.priority,
      recurrenceType: delivery.recurrenceType,
      recurrenceUnit: delivery.recurrenceUnit,
      recurrenceDays: [...delivery.recurrenceDays],
      tasks: delivery.tasks.map((task) => ({
        localId: nextLocalId("task"),
        name: task.name,
        durationHours: task.durationHours,
      })),
    };
    const index = project.deliveries.findIndex(
      (item) => item.localId === delivery.localId,
    );
    const next = [...project.deliveries];
    next.splice(index + 1, 0, clone);
    project.deliveries = next;
    expandedDeliveries = { ...expandedDeliveries, [clone.localId]: true };
  }

  function removeDelivery(
    project: DraftProject,
    delivery: DraftDelivery,
  ): void {
    project.deliveries = project.deliveries.filter(
      (item) => item.localId !== delivery.localId,
    );
  }

  function toggleDeliveryExpanded(localId: string): void {
    expandedDeliveries = {
      ...expandedDeliveries,
      [localId]: !expandedDeliveries[localId],
    };
  }

  function setDeliveryRecurrence(
    delivery: DraftDelivery,
    type: ServiceDeliveryRecurrenceType,
  ): void {
    delivery.recurrenceType = type;
    if (type === "weekly") {
      delivery.recurrenceUnit = null;
      delivery.recurrenceDays = [0];
    } else if (type === "monthly") {
      delivery.recurrenceUnit = null;
      delivery.recurrenceDays = [1];
    } else if (type === "custom") {
      delivery.recurrenceUnit ??= "week";
      if (!delivery.recurrenceDays.length) {
        delivery.recurrenceDays =
          delivery.recurrenceUnit === "month" ? [1] : [1];
      }
    } else {
      delivery.recurrenceUnit = null;
      delivery.recurrenceDays = [];
    }
  }

  function toggleRecurrenceDay(delivery: DraftDelivery, day: number): void {
    const exists = delivery.recurrenceDays.includes(day);
    delivery.recurrenceDays = exists
      ? delivery.recurrenceDays.filter((item) => item !== day)
      : [...delivery.recurrenceDays, day].sort((a, b) => a - b);
  }

  async function addTask(delivery: DraftDelivery): Promise<void> {
    if (delivery.tasks.length >= 30) return;
    const task: DraftTask = {
      localId: nextLocalId("task"),
      name: "",
      durationHours: "1",
    };
    delivery.tasks = [...delivery.tasks, task];
    await tick();
    document
      .querySelector<HTMLInputElement>(`[data-task-input="${task.localId}"]`)
      ?.focus();
  }

  async function handleTaskKeydown(
    event: KeyboardEvent,
    delivery: DraftDelivery,
    task: DraftTask,
  ): Promise<void> {
    if (
      event.key !== "Enter" ||
      event.isComposing ||
      !task.name.trim() ||
      delivery.tasks.length >= 30
    ) {
      return;
    }
    event.preventDefault();
    await addTask(delivery);
  }

  function removeTask(delivery: DraftDelivery, localId: string): void {
    delivery.tasks = delivery.tasks.filter((task) => task.localId !== localId);
  }

  function handleImportedDelivery(source: ServicePackageDeliveryInput): void {
    if (!activeProject || activeProject.deliveries.length >= 100) return;
    const isRecurring = activeProject.projectType === "recurring";
    const copy: DraftDelivery = {
      localId: nextLocalId("del"),
      name: source.name,
      description: source.description,
      priority: source.priority || "normal",
      recurrenceType: isRecurring ? source.recurrenceType : "one_off",
      recurrenceUnit: isRecurring ? source.recurrenceUnit : null,
      recurrenceDays: isRecurring ? [...source.recurrenceDays] : [],
      tasks: source.tasks.map((task) => ({
        localId: nextLocalId("task"),
        name: task.name,
        durationHours: minutesToHoursString(task.durationMinutes),
      })),
    };
    activeProject.deliveries = [...activeProject.deliveries, copy];
    expandedDeliveries = { ...expandedDeliveries, [copy.localId]: true };
    importModalOpen = false;
  }

  function handleImportedProject(source: ServicePackageProjectInput): void {
    if (explicitProjects.length >= MAX_EXPLICIT_SERVICE_PROJECTS) return;
    const project: DraftProject = {
      localId: nextLocalId("proj"),
      isInstitutional: false,
      name: source.name,
      briefing: source.briefing,
      projectType: source.projectType,
      durationDays: source.durationDays ? String(source.durationDays) : "",
      deliveries: source.deliveries.map((delivery) => ({
        localId: nextLocalId("del"),
        name: delivery.name,
        description: delivery.description,
        priority: delivery.priority,
        recurrenceType: delivery.recurrenceType,
        recurrenceUnit: delivery.recurrenceUnit,
        recurrenceDays: [...delivery.recurrenceDays],
        tasks: delivery.tasks.map((task) => ({
          localId: nextLocalId("task"),
          name: task.name,
          durationHours: minutesToHoursString(task.durationMinutes),
        })),
      })),
    };
    draft.projects = [...draft.projects, project];
    selectedSection = project.localId;
    saveSuccess = "";
  }

  function openImportModal(
    kind: "projects" | "deliveries" = "deliveries",
  ): void {
    importKind = kind;
    importModalOpen = true;
  }

  function buildPayload(): ServicePackageMutationInput | null {
    saveError = "";
    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      saveError = "Informe o nome do serviço antes de salvar.";
      selectedSection = "contract";
      return null;
    }

    const durationMonthsNum = draft.durationMonths.trim()
      ? Number.parseInt(draft.durationMonths.trim(), 10)
      : null;
    if (
      durationMonthsNum !== null &&
      (!Number.isInteger(durationMonthsNum) ||
        durationMonthsNum < 1 ||
        durationMonthsNum > 120)
    ) {
      saveError = "A vigência sugerida deve ficar entre 1 e 120 meses.";
      selectedSection = "contract";
      return null;
    }

    const installmentCount = Math.max(
      1,
      Math.min(99, Number.parseInt(draft.installmentCount, 10) || 1),
    );

    const payloadProjects: ServicePackageMutationInput["projects"] = [];
    for (const project of draft.projects) {
      if (!project.isInstitutional && !project.name.trim()) {
        saveError = "Todo projeto do pacote precisa ter um nome.";
        selectedSection = project.localId;
        return null;
      }

      const durationDaysNum =
        !project.isInstitutional && project.durationDays.trim()
          ? Number.parseInt(project.durationDays.trim(), 10)
          : null;
      if (
        durationDaysNum !== null &&
        (!Number.isInteger(durationDaysNum) ||
          durationDaysNum < 1 ||
          durationDaysNum > 3650)
      ) {
        saveError = `Prazo inválido no projeto "${project.name}".`;
        selectedSection = project.localId;
        return null;
      }

      const effectiveProjectType: ServiceProjectNature = project.isInstitutional
        ? "one_off"
        : project.projectType;

      const deliveriesPayload = [];
      for (const delivery of project.deliveries) {
        const deliveryName = delivery.name.trim();
        if (!deliveryName) {
          saveError = `Preencha o nome de todas as entregas em "${project.name}".`;
          selectedSection = project.localId;
          expandedDeliveries = {
            ...expandedDeliveries,
            [delivery.localId]: true,
          };
          return null;
        }
        const tasksPayload = delivery.tasks
          .filter((task) => task.name.trim())
          .map((task) => ({
            ...(task.id ? { id: task.id } : {}),
            name: task.name.trim(),
            durationMinutes: hoursStringToMinutes(task.durationHours),
          }));

        deliveriesPayload.push({
          ...(delivery.id ? { id: delivery.id } : {}),
          name: deliveryName,
          description: delivery.description.trim(),
          priority: delivery.priority || "normal",
          recurrenceType:
            effectiveProjectType === "recurring"
              ? delivery.recurrenceType
              : ("one_off" as const),
          recurrenceUnit:
            effectiveProjectType === "recurring" &&
            delivery.recurrenceType === "custom"
              ? (delivery.recurrenceUnit ?? "week")
              : null,
          recurrenceDays:
            effectiveProjectType === "recurring" ? delivery.recurrenceDays : [],
          tasks: tasksPayload,
        });
      }

      payloadProjects.push({
        ...(project.id ? { id: project.id } : {}),
        isInstitutional: project.isInstitutional,
        name: project.isInstitutional
          ? INSTITUTIONAL_PROJECT_NAME
          : project.name.trim(),
        briefing: project.briefing.trim(),
        projectType: effectiveProjectType,
        durationDays: durationDaysNum,
        deliveries: deliveriesPayload,
      });
    }

    return {
      name: trimmedName,
      description: draft.description.trim(),
      icon: draft.icon || "package",
      color: draft.color || "blue",
      amountCents,
      contractType: draft.contractType,
      durationMonths: durationMonthsNum,
      installmentCount,
      paymentMethod: draft.paymentMethod.trim(),
      paymentTerms: draft.paymentTerms.trim(),
      projects: payloadProjects,
    };
  }

  async function saveService(): Promise<ServicePackage | null> {
    if (saving) return null;
    const payload = buildPayload();
    if (!payload) return null;

    saving = true;
    saveError = "";
    saveSuccess = "";
    try {
      const saved = savedPackageId
        ? await updateServicePackage(savedPackageId, payload)
        : await createServicePackage(payload);
      const wasCreate = !savedPackageId;
      savedPackageId = saved.id;
      isArchived = Boolean(saved.archivedAt);
      const prevSection = selectedSection;
      const prevProjectIndex = draft.projects.findIndex(
        (item) => item.localId === prevSection,
      );
      draft = draftFromPackage(saved);
      if (prevSection !== "contract" && prevProjectIndex >= 0) {
        selectedSection =
          draft.projects[prevProjectIndex]?.localId ?? "contract";
      }
      savedSnapshot = JSON.stringify(draft);
      saveSuccess = "Serviço salvo.";
      if (wasCreate && mode === "create") {
        await goto(`/meunegocio/${saved.id}`, {
          replaceState: true,
          noScroll: true,
        });
      }
      return saved;
    } catch (cause) {
      saveError =
        cause instanceof ServicePackageApiError
          ? cause.message
          : "Não foi possível salvar o serviço.";
      return null;
    } finally {
      saving = false;
    }
  }

  async function handleUseService(): Promise<void> {
    let targetId = savedPackageId;
    if (!targetId || isDirty) {
      const saved = await saveService();
      if (!saved) return;
      targetId = saved.id;
    }
    entityCreate?.open("contratos", { servicePackageId: targetId });
  }

  async function handleDeleteService(): Promise<void> {
    if (!savedPackageId || deleting) return;
    if (
      !window.confirm(
        `Excluir o serviço "${draft.name || "sem nome"}" permanentemente? Contratos já criados não serão afetados.`,
      )
    ) {
      return;
    }
    deleting = true;
    try {
      await deleteServicePackage(savedPackageId);
      await goto("/meunegocio");
    } catch (cause) {
      saveError =
        cause instanceof ServicePackageApiError
          ? cause.message
          : "Não foi possível excluir o serviço.";
      deleting = false;
    }
  }

  onMount(() => {
    if (mode === "create") {
      void tick().then(() => {
        document
          .querySelector<HTMLInputElement>("[data-service-name-input]")
          ?.focus();
      });
    }
  });
</script>

<div class="studio-page" style={`--studio-accent: ${accent}`}>
  <PageHeader
    eyebrow="Meu negócio · Serviços"
    title={draft.name.trim() || "Novo serviço"}
    icon={BriefcaseBusiness}
  >
    <div class="header-summary" aria-label="Resumo do pacote">
      <div class="header-stat">
        <span>Projetos</span>
        <strong>{explicitProjects.length + 1}</strong>
      </div>
      <div class="header-stat">
        <span>Entregas</span>
        <strong>{metrics.totalDeliveries}</strong>
      </div>
      <div class="header-stat">
        <span>Tarefas</span>
        <strong>{metrics.totalTasks}</strong>
      </div>
      <div class="header-stat">
        <span>Esforço</span>
        <strong>{formatServiceHours(metrics.totalMinutes)}</strong>
      </div>
    </div>

    {#snippet actions()}
      <div class="header-actions-group">
        <a class="btn-back" href="/meunegocio">
          <ArrowLeft size={16} strokeWidth={2.1} />
          <span>Serviços</span>
        </a>
        {#if !isArchived}
          <button
            type="button"
            class="btn-use-top"
            disabled={saving}
            onclick={() => void handleUseService()}
          >
            <span>Usar serviço</span>
            <ArrowUpRight size={15} strokeWidth={2.2} />
          </button>
        {/if}
        <button
          type="button"
          class="btn-save-top"
          disabled={saving}
          onclick={() => void saveService()}
        >
          <Save size={15} strokeWidth={2.1} />
          <span>{saving ? "Salvando..." : "Salvar"}</span>
        </button>
      </div>
    {/snippet}
  </PageHeader>

  {#if isDirty || saveSuccess || saveError}
    <div class="studio-status-bar">
      {#if saveError}
        <div class="status-pill status-pill--error" role="alert">
          {saveError}
        </div>
      {:else if isDirty}
        <div class="status-pill status-pill--dirty" role="status">
          Alterações não salvas neste serviço.
        </div>
      {:else if saveSuccess}
        <div class="status-pill status-pill--saved" role="status">
          {saveSuccess}
        </div>
      {/if}
    </div>
  {/if}

  <div class="studio-layout">
    <aside class="studio-rail" aria-label="Estrutura do pacote">
      <div class="rail-section">
        <span class="rail-label">Modelo base</span>
        <button
          type="button"
          class="rail-item"
          class:active={selectedSection === "contract"}
          onclick={() => (selectedSection = "contract")}
        >
          <span class="rail-icon rail-icon--contract">
            <Package size={15} strokeWidth={2} />
          </span>
          <span class="rail-copy">
            <strong>Contrato</strong>
            <small>
              {amountCents > 0
                ? formatServiceMoney(amountCents)
                : "Valor livre"}
              ·
              {draft.durationMonths
                ? `${draft.durationMonths} meses`
                : "Sem prazo"}
            </small>
          </span>
        </button>
      </div>

      <div class="rail-section rail-section--projects">
        <div class="rail-head">
          <span class="rail-label">
            Projetos ({explicitProjects.length + 1} / {MAX_SERVICE_PROJECTS})
          </span>
          <button
            type="button"
            class="rail-add-btn"
            disabled={explicitProjects.length >= MAX_EXPLICIT_SERVICE_PROJECTS}
            onclick={addExplicitProject}
          >
            <Plus size={14} strokeWidth={2.4} />
            <span>Adicionar</span>
          </button>
        </div>

        <button
          type="button"
          class="btn-secondary"
          disabled={explicitProjects.length >= MAX_EXPLICIT_SERVICE_PROJECTS}
          onclick={() => openImportModal("projects")}
          ><Download size={14} /><span>Selecionar projeto existente</span
          ></button
        >

        {#if explicitProjects.length >= 5}
          <div class="rail-search">
            <Search size={14} />
            <input
              type="search"
              bind:value={projectSearch}
              placeholder="Filtrar projetos..."
              aria-label="Filtrar projetos do pacote"
            />
          </div>
        {/if}

        <div class="rail-project-list">
          {#if !projectSearch.trim() || "institucional".includes(projectSearch
                .trim()
                .toLocaleLowerCase("pt-BR"))}
            <button
              type="button"
              class="rail-item rail-item--inst"
              class:active={selectedSection === institutionalProject.localId}
              onclick={() => (selectedSection = institutionalProject.localId)}
            >
              <span class="rail-icon rail-icon--inst">
                <Shield size={15} strokeWidth={2} />
              </span>
              <span class="rail-copy">
                <span class="rail-title-line">
                  <strong>Institucional</strong>
                  <em class="rail-tag">Automático</em>
                </span>
                <small>
                  <span class="mini-nature">Pontual</span>
                  · {institutionalProject.deliveries.length}
                  {institutionalProject.deliveries.length === 1
                    ? "ent."
                    : "ents."} ·
                  {formatServiceHours(
                    projectTotalMinutes(institutionalProject),
                  )}
                </small>
              </span>
            </button>
          {/if}

          {#if filteredExplicitProjects.length === 0 && projectSearch.trim() && !"institucional".includes(projectSearch
                .trim()
                .toLocaleLowerCase("pt-BR"))}
            <div class="rail-empty">
              <p>Nenhum projeto corresponde à busca.</p>
            </div>
          {:else}
            {#each filteredExplicitProjects as project, index (project.localId)}
              <div
                class="rail-project-row"
                class:active={selectedSection === project.localId}
              >
                <button
                  type="button"
                  class="rail-project-select"
                  onclick={() => (selectedSection = project.localId)}
                >
                  <span class="proj-index">
                    {String(
                      explicitProjects.findIndex(
                        (item) => item.localId === project.localId,
                      ) + 1,
                    ).padStart(2, "0")}
                  </span>
                  <span class="rail-copy">
                    <span class="rail-title-line">
                      <strong
                        >{project.name.trim() || "Projeto sem nome"}</strong
                      >
                    </span>
                    <small>
                      <span
                        class="mini-nature"
                        class:recurring={project.projectType === "recurring"}
                      >
                        {project.projectType === "recurring"
                          ? "Recorrente"
                          : "Pontual"}
                      </span>
                      · {project.deliveries.length}
                      {project.deliveries.length === 1 ? "ent." : "ents."} ·
                      {formatServiceHours(projectTotalMinutes(project))}
                    </small>
                  </span>
                </button>

                {#if !projectSearch.trim()}
                  <div class="rail-project-tools">
                    <button
                      type="button"
                      title="Mover para cima"
                      aria-label="Mover projeto para cima"
                      disabled={index === 0}
                      onclick={() => moveExplicitProject(project, -1)}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      title="Mover para baixo"
                      aria-label="Mover projeto para baixo"
                      disabled={index === filteredExplicitProjects.length - 1}
                      onclick={() => moveExplicitProject(project, 1)}
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </aside>

    <main class="studio-stage">
      {#if selectedSection === "contract"}
        <section class="form-section">
          <div class="section-head-row">
            <h3>Serviço</h3>
            {#if savedPackageId}
              <button
                type="button"
                class="btn-danger-ghost"
                disabled={deleting}
                onclick={() => void handleDeleteService()}
              >
                <Trash2 size={14} />
                <span>Excluir serviço</span>
              </button>
            {/if}
          </div>

          <div class="fields">
            <div class="name-picker-row full">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <FileText size={16} strokeWidth={1.8} />
                </span>
                <input
                  data-service-name-input
                  bind:value={draft.name}
                  maxlength="140"
                  required
                  placeholder="Nome do serviço *"
                  aria-label="Nome do serviço"
                />
              </div>
              <IconColorPicker
                bind:selectedIcon={draft.icon}
                bind:selectedColor={draft.color}
                size="field"
                iconAriaLabel="Escolher ícone do serviço"
              />
            </div>

            <div class="control textarea-control full">
              <span class="control-icon" aria-hidden="true">
                <FileText size={16} strokeWidth={1.8} />
              </span>
              <textarea
                bind:value={draft.description}
                rows="3"
                maxlength="2000"
                placeholder="Descrição comercial do pacote"
                aria-label="Descrição comercial do pacote"></textarea>
            </div>

            <div class="two-column-grid full">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <CircleDollarSign size={16} strokeWidth={1.8} />
                </span>
                <input
                  bind:value={draft.amount}
                  inputmode="decimal"
                  placeholder={draft.contractType === "recurring"
                    ? "Valor mensal"
                    : "Valor de referência"}
                  aria-label={draft.contractType === "recurring"
                    ? "Valor mensal"
                    : "Valor de referência"}
                />
              </div>

              <div class="control duration-control">
                <span class="control-icon" aria-hidden="true">
                  <CalendarDays size={16} strokeWidth={1.8} />
                </span>
                <input
                  bind:value={draft.durationMonths}
                  type="number"
                  min="1"
                  max="120"
                  step="1"
                  inputmode="numeric"
                  placeholder="Vigência (opcional)"
                  aria-label="Vigência sugerida em meses"
                />
                <span class="duration-suffix">meses</span>
              </div>
            </div>
          </div>
        </section>

        <section class="form-section">
          <h3>Pagamento</h3>
          <div class="fields">
            <label class="control full"
              ><Repeat size={16} /><select
                bind:value={draft.contractType}
                aria-label="Recorrência da cobrança do contrato"
                ><option value="one_off">Cobrança pontual</option><option
                  value="recurring">Cobrança recorrente mensal</option
                ></select
              ></label
            >
            <p class="full">
              A cobrança do contrato é independente da recorrência dos projetos.
            </p>
            <div class="two-column-grid full">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <CreditCard size={16} strokeWidth={1.8} />
                </span>
                <input
                  bind:value={draft.paymentMethod}
                  maxlength="120"
                  placeholder="Forma de pagamento"
                  aria-label="Forma de pagamento"
                />
              </div>

              <div class="control installment-count">
                <span class="control-label">Parcelas</span>
                <input
                  disabled={draft.contractType === "recurring"}
                  bind:value={draft.installmentCount}
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  title="Parcelas sugeridas"
                  aria-label="Parcelas sugeridas"
                />
              </div>
            </div>
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
                bind:value={draft.paymentTerms}
                rows="4"
                maxlength="2000"
                placeholder="Observações e condições comerciais"
                aria-label="Observações e condições comerciais"></textarea>
            </div>
          </div>
        </section>

        <section class="form-section">
          <div class="section-head-row">
            <h3>Composição do pacote</h3>
            <button
              type="button"
              class="btn-secondary"
              disabled={explicitProjects.length >=
                MAX_EXPLICIT_SERVICE_PROJECTS}
              onclick={addExplicitProject}
            >
              <Plus size={15} strokeWidth={2.2} />
              <span>Adicionar projeto</span>
            </button>
          </div>

          <div class="summary-grid">
            <div class="summary-tile">
              <span>Projetos</span>
              <strong>{explicitProjects.length + 1}</strong>
              <small>
                1 Institucional + {explicitProjects.length}
                {explicitProjects.length === 1 ? "projeto" : "projetos"}
              </small>
            </div>
            <div class="summary-tile">
              <span>Natureza dos projetos</span>
              <strong>
                {metrics.oneOffProjects} pont. / {metrics.recurringProjects} rec.
              </strong>
              <small>Configurada individualmente por projeto</small>
            </div>
            <div class="summary-tile">
              <span>Entregas e tarefas</span>
              <strong>
                {metrics.totalDeliveries} ent. · {metrics.totalTasks} tar.
              </strong>
              <small>Esforço: {formatServiceHours(metrics.totalMinutes)}</small>
            </div>
            <div class="summary-tile">
              <span>Valor/hora estimado</span>
              <strong>
                {metrics.hourlyRateCents
                  ? `${formatServiceMoney(metrics.hourlyRateCents)}/h`
                  : "—"}
              </strong>
              <small>
                {metrics.hourlyRateCents
                  ? "Valor ÷ horas estimadas"
                  : "Defina valor e tarefas"}
              </small>
            </div>
          </div>
        </section>
      {:else if activeProject}
        <section class="form-section">
          <div class="section-head-row">
            <h3>
              {activeProject.isInstitutional
                ? "Sobre · Institucional"
                : "Sobre o projeto"}
            </h3>

            {#if !activeProject.isInstitutional}
              <div class="project-head-actions">
                <button
                  type="button"
                  class="btn-secondary"
                  disabled={explicitProjects.length >=
                    MAX_EXPLICIT_SERVICE_PROJECTS}
                  onclick={() => duplicateProject(activeProject)}
                >
                  <Copy size={14} />
                  <span>Duplicar</span>
                </button>
                <button
                  type="button"
                  class="btn-danger-ghost"
                  onclick={() => removeProject(activeProject)}
                >
                  <Trash2 size={14} />
                  <span>Remover</span>
                </button>
              </div>
            {/if}
          </div>

          <div class="fields">
            {#if !activeProject.isInstitutional}
              <div class="control full">
                <span class="control-icon" aria-hidden="true">
                  <FolderKanban size={16} strokeWidth={1.8} />
                </span>
                <input
                  data-project-name-input
                  bind:value={activeProject.name}
                  maxlength="140"
                  required
                  placeholder="Título do projeto *"
                  aria-label="Nome do projeto"
                />
              </div>
            {:else}
              <p class="institutional-note">
                O projeto Institucional acompanha automaticamente todo contrato
                gerado a partir deste serviço e é sempre pontual. Use-o para
                entregas diretas sem projeto específico ou deixe vazio.
              </p>
            {/if}

            <div class="two-column-grid full">
              <div
                class="control"
                class:control--locked={activeProject.isInstitutional}
              >
                <span class="control-icon" aria-hidden="true">
                  <Repeat size={16} strokeWidth={1.8} />
                </span>
                {#if activeProject.isInstitutional}
                  <select
                    aria-label="Frequência do projeto"
                    value="one_off"
                    disabled
                    title="Projetos institucionais são sempre pontuais."
                  >
                    <option value="one_off">Pontual (fixo)</option>
                  </select>
                {:else}
                  <select
                    aria-label="Frequência do projeto"
                    value={activeProject.projectType}
                    onchange={(event) =>
                      setProjectType(
                        activeProject,
                        event.currentTarget.value as ServiceProjectNature,
                      )}
                  >
                    <option value="one_off">Pontual</option>
                    <option value="recurring">Recorrente</option>
                  </select>
                {/if}
              </div>

              {#if !activeProject.isInstitutional}
                <div class="control duration-control">
                  <span class="control-icon" aria-hidden="true">
                    <CalendarDays size={16} strokeWidth={1.8} />
                  </span>
                  <input
                    bind:value={activeProject.durationDays}
                    type="number"
                    min="1"
                    max="3650"
                    step="1"
                    inputmode="numeric"
                    placeholder="Prazo (opcional)"
                    aria-label="Prazo sugerido em dias"
                  />
                  <span class="duration-suffix">dias</span>
                </div>
              {/if}
            </div>

            {#if !activeProject.isInstitutional}
              <div class="control textarea-control full">
                <span class="control-icon" aria-hidden="true">
                  <FileText size={16} strokeWidth={1.8} />
                </span>
                <textarea
                  bind:value={activeProject.briefing}
                  rows="4"
                  maxlength="2000"
                  placeholder="Briefing do projeto"
                  aria-label="Briefing do projeto"></textarea>
              </div>
            {/if}
          </div>
        </section>

        <section class="form-section">
          <div class="section-head-row">
            <h3 class="title-with-icon">
              <ListChecks size={17} strokeWidth={1.9} />
              <span>Entregas</span>
              <span class="count-pill">{activeProject.deliveries.length}</span>
            </h3>

            <div class="deliveries-actions">
              <button
                type="button"
                class="btn-secondary"
                disabled={activeProject.deliveries.length >= 100}
                onclick={() => openImportModal("deliveries")}
              >
                <Download size={14} strokeWidth={2.1} />
                <span>Importar entrega</span>
              </button>
              <button
                type="button"
                class="btn-primary-soft"
                disabled={activeProject.deliveries.length >= 100}
                onclick={() => addDelivery(activeProject)}
              >
                <Plus size={15} strokeWidth={2.3} />
                <span>Adicionar entrega</span>
              </button>
            </div>
          </div>

          {#if activeProject.deliveries.length === 0}
            <div class="deliveries-empty">
              <ListChecks size={20} strokeWidth={1.7} />
              <strong>Nenhuma entrega neste projeto</strong>
              <p>
                Adicione entregas com suas tarefas ou importe uma cópia de outro
                serviço.
              </p>
            </div>
          {:else}
            <div class="delivery-list">
              {#each activeProject.deliveries as delivery (delivery.localId)}
                {@const isOpen = Boolean(expandedDeliveries[delivery.localId])}
                {@const validTaskCount = delivery.tasks.filter((task) =>
                  task.name.trim(),
                ).length}
                <article class="delivery-card" class:open={isOpen}>
                  <div class="delivery-row-head">
                    <button
                      type="button"
                      class="delivery-toggle"
                      aria-expanded={isOpen}
                      onclick={() => toggleDeliveryExpanded(delivery.localId)}
                    >
                      <span class="chevron" aria-hidden="true">
                        {#if isOpen}
                          <ChevronDown size={16} />
                        {:else}
                          <ChevronRight size={16} />
                        {/if}
                      </span>
                      <strong class:placeholder={!delivery.name.trim()}>
                        {delivery.name.trim() || "Entrega sem nome"}
                      </strong>
                    </button>

                    <div class="delivery-badges">
                      {#if activeProject.projectType === "recurring"}
                        <span class="recurrence-badge">
                          <Repeat size={11.5} />
                          <span>
                            {formatRecurrenceLabel(
                              delivery.recurrenceType,
                              delivery.recurrenceUnit,
                              delivery.recurrenceDays,
                            )}
                          </span>
                        </span>
                      {/if}
                      <span class="meta-chip">
                        <CheckSquare2 size={12} />
                        <span>{validTaskCount}</span>
                      </span>
                      <span class="meta-chip">
                        <Clock3 size={12} />
                        <span
                          >{formatServiceHours(
                            deliveryTotalMinutes(delivery),
                          )}</span
                        >
                      </span>
                      <button
                        type="button"
                        class="icon-btn"
                        title="Duplicar entrega"
                        aria-label="Duplicar entrega"
                        onclick={() =>
                          duplicateDelivery(activeProject, delivery)}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        class="icon-btn danger"
                        title="Remover entrega"
                        aria-label="Remover entrega"
                        onclick={() => removeDelivery(activeProject, delivery)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {#if isOpen}
                    <div class="delivery-body">
                      <div class="fields">
                        <div class="two-column-grid full">
                          <div class="control">
                            <span class="control-icon" aria-hidden="true">
                              <BadgeCheck size={16} strokeWidth={1.8} />
                            </span>
                            <input
                              data-delivery-name={delivery.localId}
                              bind:value={delivery.name}
                              maxlength="140"
                              placeholder="Nome da entrega *"
                              aria-label="Nome da entrega"
                            />
                          </div>

                          <div class="control">
                            <span class="control-icon" aria-hidden="true">
                              <SignalHigh size={16} strokeWidth={1.8} />
                            </span>
                            <select
                              bind:value={delivery.priority}
                              aria-label="Prioridade da entrega"
                            >
                              <option value="baixa">Prioridade: Baixa</option>
                              <option value="normal">Prioridade: Normal</option>
                              <option value="alta">Prioridade: Alta</option>
                              <option value="urgente"
                                >Prioridade: Urgente</option
                              >
                            </select>
                          </div>
                        </div>

                        <div class="control textarea-control full">
                          <span class="control-icon" aria-hidden="true">
                            <FileText size={16} strokeWidth={1.8} />
                          </span>
                          <textarea
                            bind:value={delivery.description}
                            rows="3"
                            maxlength="2000"
                            placeholder="Descrição / briefing da entrega"
                            aria-label="Descrição da entrega"></textarea>
                        </div>

                        {#if activeProject.projectType === "recurring"}
                          <div class="recurrence-panel full">
                            <span class="recurrence-title">
                              <Repeat size={14} />
                              <span>Frequência da entrega</span>
                            </span>
                            <div class="recurrence-chips">
                              {#each [["one_off", "Única"], ["daily", "Diária"], ["weekly", "Semanal"], ["monthly", "Mensal"], ["custom", "Personalizada"]] as [value, label]}
                                <button
                                  type="button"
                                  class:active={delivery.recurrenceType ===
                                    value}
                                  onclick={() =>
                                    setDeliveryRecurrence(
                                      delivery,
                                      value as ServiceDeliveryRecurrenceType,
                                    )}
                                >
                                  {label}
                                </button>
                              {/each}
                            </div>

                            {#if delivery.recurrenceType === "custom"}
                              <div class="custom-recurrence">
                                <label class="custom-unit">
                                  <span>Repetir por</span>
                                  <select
                                    value={delivery.recurrenceUnit ?? "week"}
                                    onchange={(event) => {
                                      delivery.recurrenceUnit = event
                                        .currentTarget
                                        .value as ServiceDeliveryRecurrenceUnit;
                                      delivery.recurrenceDays = [];
                                    }}
                                  >
                                    <option value="week">Semana</option>
                                    <option value="month">Mês</option>
                                  </select>
                                </label>
                                <div class="day-pills">
                                  {#each delivery.recurrenceUnit === "month" ? Array.from({ length: 31 }, (_, i) => i + 1) : [0, 1, 2, 3, 4, 5, 6] as day}
                                    <button
                                      type="button"
                                      class:active={delivery.recurrenceDays.includes(
                                        day,
                                      )}
                                      onclick={() =>
                                        toggleRecurrenceDay(delivery, day)}
                                    >
                                      {delivery.recurrenceUnit === "month"
                                        ? day
                                        : [
                                            "Dom",
                                            "Seg",
                                            "Ter",
                                            "Qua",
                                            "Qui",
                                            "Sex",
                                            "Sáb",
                                          ][day]}
                                    </button>
                                  {/each}
                                </div>
                              </div>
                            {/if}
                          </div>
                        {/if}
                      </div>

                      <div class="tasks-section">
                        <div class="tasks-head">
                          <span>
                            <ListTodo size={15} />
                            <strong>Tarefas</strong>
                          </span>
                          <button
                            type="button"
                            class="add-task-btn"
                            disabled={delivery.tasks.length >= 30}
                            onclick={() => void addTask(delivery)}
                          >
                            <Plus size={14} strokeWidth={2.3} />
                            <span>Adicionar tarefa</span>
                          </button>
                        </div>

                        <div class="tasks-list">
                          {#each delivery.tasks as task (task.localId)}
                            <div class="task-row">
                              <div class="control task-control">
                                <span class="control-icon" aria-hidden="true">
                                  <ListTodo size={15} strokeWidth={1.8} />
                                </span>
                                <input
                                  data-task-input={task.localId}
                                  bind:value={task.name}
                                  maxlength="120"
                                  placeholder="Nome da tarefa"
                                  aria-label="Nome da tarefa"
                                  onkeydown={(event) =>
                                    void handleTaskKeydown(
                                      event,
                                      delivery,
                                      task,
                                    )}
                                />
                              </div>

                              <div
                                class="control task-control duration-control"
                              >
                                <span class="control-icon" aria-hidden="true">
                                  <Timer size={15} strokeWidth={1.8} />
                                </span>
                                <input
                                  bind:value={task.durationHours}
                                  type="number"
                                  min="0.5"
                                  max="168"
                                  step="0.5"
                                  aria-label="Duração da tarefa em horas"
                                  onchange={() =>
                                    (task.durationHours = normalizeHoursDisplay(
                                      task.durationHours,
                                    ))}
                                />
                                <span class="duration-suffix">h</span>
                              </div>

                              <button
                                type="button"
                                class="task-remove-btn"
                                title="Remover tarefa"
                                aria-label="Remover tarefa"
                                onclick={() =>
                                  removeTask(delivery, task.localId)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          {:else}
                            <p class="tasks-empty">
                              Nenhuma tarefa ainda. Clique em "Adicionar tarefa"
                              para detalhar os passos.
                            </p>
                          {/each}
                        </div>
                      </div>
                    </div>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    </main>
  </div>
</div>

{#if importModalOpen}
  <ScopeImportModal
    kind={importKind}
    onproject={handleImportedProject}
    ondelivery={handleImportedDelivery}
    onclose={() => (importModalOpen = false)}
  />
{/if}

<style>
  .studio-page {
    display: grid;
    gap: 16px;
    width: 100%;
    max-width: var(--content-width);
  }

  .studio-page :global(.page-header) {
    margin-bottom: 0;
  }

  .header-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(76px, 1fr));
    gap: 6px;
    align-items: center;
  }

  .header-stat {
    display: grid;
    gap: 2px;
    padding: 4px 14px;
    border-left: 1px solid rgba(46, 86, 255, 0.14);
  }

  .header-stat:first-child {
    border-left: 0;
  }

  .header-stat span {
    color: var(--ink-500);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .header-stat strong {
    color: var(--ink-950);
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .header-actions-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .btn-back,
  .btn-use-top,
  .btn-save-top {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 14px;
    border-radius: var(--radius-md);
    font: inherit;
    font-size: var(--text-md);
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease,
      color var(--motion-fast) ease;
  }

  .btn-back,
  .btn-use-top {
    border: 1px solid var(--border-strong);
    color: var(--ink-800);
    background: var(--panel);
  }

  .btn-back:hover,
  .btn-use-top:hover:not(:disabled) {
    border-color: var(--brand-500);
    color: var(--brand-600);
    background: var(--brand-50);
  }

  .btn-save-top {
    border: 1px solid #16a34a;
    color: #ffffff;
    background: #16a34a;
    box-shadow: 0 8px 18px rgba(22, 163, 74, 0.22);
  }

  .btn-save-top:hover:not(:disabled) {
    border-color: #15803d;
    background: #15803d;
  }

  .btn-save-top:disabled,
  .btn-use-top:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .studio-status-bar {
    display: flex;
  }

  .status-pill {
    width: 100%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
  }

  .status-pill--error {
    border: 1px solid rgba(220, 38, 38, 0.28);
    color: var(--danger);
    background: rgba(220, 38, 38, 0.06);
  }

  .status-pill--dirty {
    border: 1px solid rgba(234, 179, 8, 0.35);
    color: #92400e;
    background: rgba(234, 179, 8, 0.12);
  }

  .status-pill--saved {
    border: 1px solid rgba(93, 172, 131, 0.35);
    color: #1f6b47;
    background: rgba(93, 172, 131, 0.12);
  }

  .studio-layout {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    align-items: start;
    gap: 16px;
  }

  .studio-rail {
    position: sticky;
    top: 16px;
    display: grid;
    gap: 14px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--panel);
  }

  .rail-section {
    display: grid;
    gap: 6px;
  }

  .rail-section--projects {
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .rail-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .rail-label {
    color: var(--ink-500);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .rail-add-btn {
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
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .rail-add-btn:hover:not(:disabled) {
    background: var(--brand-100);
  }

  .rail-add-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .rail-item {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border: 1px solid transparent;
    border-radius: 13px;
    outline: 0;
    color: inherit;
    background: var(--canvas);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .rail-item:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .rail-item:hover {
    border-color: var(--border-strong);
  }

  .rail-item.active {
    border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
    background: color-mix(in srgb, var(--primary) 8%, var(--panel));
  }

  .rail-icon {
    display: grid;
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    border-radius: 9px;
    place-items: center;
  }

  .rail-icon--contract {
    color: var(--studio-accent);
    background: color-mix(in srgb, var(--studio-accent) 14%, var(--panel));
  }

  .rail-icon--inst {
    color: var(--ink-700);
    background: rgba(100, 116, 139, 0.14);
  }

  .rail-copy {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 2px;
  }

  .rail-title-line {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
  }

  .rail-copy strong {
    overflow: hidden;
    color: var(--ink-950);
    font-size: 13.5px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rail-copy small {
    overflow: hidden;
    color: var(--ink-500);
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rail-tag {
    flex: 0 0 auto;
    padding: 1px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    color: var(--ink-500);
    background: var(--panel);
    font-size: 10px;
    font-style: normal;
    font-weight: 600;
  }

  .rail-search {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--ink-400);
    background: var(--canvas);
  }

  .rail-search input {
    width: 100%;
    border: 0;
    color: var(--ink-950);
    background: transparent;
    font: inherit;
    font-size: 12.5px;
    outline: 0;
  }

  .rail-project-list {
    display: grid;
    gap: 6px;
    max-height: min(52dvh, 460px);
    overflow-y: auto;
  }

  .rail-empty {
    padding: 12px;
    border: 1px dashed var(--border-strong);
    border-radius: 12px;
    color: var(--ink-500);
    background: var(--canvas);
    font-size: 12px;
    line-height: 1.45;
  }

  .rail-empty p {
    margin: 0;
  }

  .rail-project-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: var(--canvas);
  }

  .rail-project-row.active {
    border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
    background: color-mix(in srgb, var(--primary) 8%, var(--panel));
  }

  .rail-project-row:has(.rail-project-select:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  .rail-project-select {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 9px;
    padding: 6px;
    border: 0;
    border-radius: 9px;
    outline: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .proj-index {
    display: grid;
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--ink-500);
    background: var(--panel);
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    place-items: center;
  }

  .mini-nature {
    color: var(--brand-700);
    font-weight: 600;
  }

  .mini-nature.recurring {
    color: #1f6b47;
  }

  .rail-project-tools {
    display: grid;
    gap: 2px;
  }

  .rail-project-tools button {
    display: grid;
    width: 22px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--ink-400);
    background: transparent;
    place-items: center;
    cursor: pointer;
  }

  .rail-project-tools button:hover:not(:disabled) {
    color: var(--ink-950);
    background: var(--panel);
  }

  .rail-project-tools button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* =====================================================================
     Form controls matching ContractForm / ProjectForm / DeliveryForm
     ===================================================================== */
  .studio-stage {
    display: grid;
    min-width: 0;
    gap: 14px;
  }

  .form-section {
    display: grid;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--panel);
  }

  .form-section h3 {
    margin: 0;
    color: var(--ink-950);
    font-size: var(--text-lg);
    font-weight: 600;
    line-height: 1.2;
  }

  .section-head-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .title-with-icon {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .full {
    min-width: 0;
  }

  .two-column-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .name-picker-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    gap: 10px;
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
      background var(--motion-fast) ease;
  }

  .control:focus-within {
    border-color: var(--primary);
  }

  .control--locked {
    background: var(--canvas);
    opacity: 0.78;
  }

  .control--locked select {
    cursor: not-allowed;
  }

  .textarea-control {
    min-height: 118px;
    align-items: start;
    padding-block: 12px;
  }

  .textarea-control .control-icon {
    margin-top: 3px;
  }

  .control-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }

  .control.installment-count {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .control.duration-control {
    grid-template-columns: 18px minmax(0, 1fr) auto;
  }

  .control-label,
  .duration-suffix {
    color: var(--muted);
    font-size: var(--text-md);
    white-space: nowrap;
  }

  .duration-suffix {
    font-size: var(--text-sm);
  }

  .control input,
  .control select,
  .control textarea {
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    outline: 0;
    color: var(--text);
    background: transparent;
    font: inherit;
    font-size: var(--text-md);
    font-weight: 400;
    line-height: 1.45;
  }

  .control select {
    cursor: pointer;
  }

  .control textarea {
    min-height: 88px;
    resize: vertical;
  }

  .control input::placeholder,
  .control textarea::placeholder {
    color: var(--muted);
    opacity: 1;
  }

  .institutional-note {
    margin: 0;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    color: var(--ink-500);
    background: var(--canvas);
    font-size: 13px;
    line-height: 1.45;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .summary-tile {
    display: grid;
    gap: 4px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--canvas);
  }

  .summary-tile span {
    color: var(--ink-500);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .summary-tile strong {
    color: var(--ink-950);
    font-size: 15.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .summary-tile small {
    color: var(--ink-500);
    font-size: 11.5px;
    line-height: 1.35;
  }

  .project-head-actions,
  .deliveries-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .count-pill {
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    color: var(--brand-600);
    background: var(--brand-50);
    font-size: 12px;
    font-weight: 700;
  }

  .btn-secondary,
  .btn-primary-soft,
  .btn-danger-ghost {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border-radius: 10px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-secondary {
    border: 1px solid var(--border-strong);
    color: var(--ink-800);
    background: var(--panel);
  }

  .btn-secondary:hover:not(:disabled) {
    border-color: var(--brand-500);
    color: var(--brand-600);
  }

  .btn-primary-soft {
    border: 1px solid color-mix(in srgb, var(--primary) 32%, var(--border));
    color: var(--brand-600);
    background: var(--brand-50);
  }

  .btn-primary-soft:hover:not(:disabled) {
    background: var(--brand-100);
  }

  .btn-danger-ghost {
    border: 1px solid rgba(220, 38, 38, 0.24);
    color: var(--danger);
    background: rgba(220, 38, 38, 0.05);
  }

  .btn-danger-ghost:hover:not(:disabled) {
    background: rgba(220, 38, 38, 0.11);
  }

  .deliveries-empty {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 32px 20px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-xl);
    color: var(--ink-500);
    background: var(--canvas);
    text-align: center;
  }

  .deliveries-empty strong {
    color: var(--ink-950);
    font-size: 14.5px;
  }

  .deliveries-empty p {
    max-width: 400px;
    margin: 0;
    font-size: 13px;
  }

  .delivery-list {
    display: grid;
    gap: 10px;
  }

  .delivery-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--canvas);
    overflow: hidden;
  }

  .delivery-card.open {
    border-color: color-mix(in srgb, var(--primary) 34%, var(--border));
    background: var(--canvas);
  }

  .delivery-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    background: var(--panel);
  }

  .delivery-toggle {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 8px;
    padding: 4px;
    border: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .chevron {
    display: inline-flex;
    color: var(--ink-400);
  }

  .delivery-toggle strong {
    overflow: hidden;
    color: var(--ink-950);
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .delivery-toggle strong.placeholder {
    color: var(--ink-400);
    font-weight: 500;
  }

  .delivery-badges {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
  }

  .recurrence-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: var(--radius-pill);
    color: #1f6b47;
    background: rgba(93, 172, 131, 0.16);
    font-size: 11.5px;
    font-weight: 600;
  }

  .meta-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--ink-500);
    background: var(--canvas);
    font-size: 11.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .icon-btn {
    display: grid;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--ink-500);
    background: transparent;
    place-items: center;
    cursor: pointer;
  }

  .icon-btn:hover {
    border-color: var(--border);
    color: var(--ink-950);
    background: var(--canvas);
  }

  .icon-btn.danger:hover {
    border-color: rgba(220, 38, 38, 0.25);
    color: var(--danger);
    background: rgba(220, 38, 38, 0.08);
  }

  .delivery-body {
    display: grid;
    gap: 14px;
    padding: 14px;
    border-top: 1px solid var(--border);
  }

  .recurrence-panel {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--system-green) 35%, var(--border));
    border-radius: var(--radius-xl);
    background: var(--panel);
  }

  .recurrence-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-700);
    font-size: 12.5px;
    font-weight: 600;
  }

  .recurrence-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .recurrence-chips button {
    min-height: 32px;
    padding: 0 11px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-700);
    background: var(--canvas);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .recurrence-chips button.active {
    border-color: #2f855a;
    color: #1f6b47;
    background: rgba(93, 172, 131, 0.18);
  }

  .custom-recurrence {
    display: grid;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .custom-unit {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-700);
    font-size: 12.5px;
    font-weight: 600;
  }

  .custom-unit select {
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--canvas);
    font: inherit;
  }

  .day-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .day-pills button {
    min-width: 34px;
    min-height: 30px;
    padding: 0 7px;
    border: 1px solid var(--border);
    border-radius: 7px;
    color: var(--ink-700);
    background: var(--canvas);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .day-pills button.active {
    border-color: var(--primary);
    color: var(--primary);
    background: var(--brand-50);
  }

  .tasks-section {
    display: grid;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .tasks-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .tasks-head > span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-950);
    font-size: 14px;
  }

  .add-task-btn {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    gap: 5px;
    padding: 0 12px;
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    color: var(--ink-800);
    background: var(--panel);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .add-task-btn:hover:not(:disabled) {
    border-color: var(--brand-500);
    color: var(--brand-600);
  }

  .tasks-list {
    display: grid;
    gap: 8px;
  }

  .task-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 136px 48px;
    align-items: stretch;
    gap: 8px;
  }

  .task-control {
    min-height: 52px;
  }

  .task-remove-btn {
    display: grid;
    min-height: 52px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    color: var(--muted);
    background: var(--panel);
    place-items: center;
    cursor: pointer;
  }

  .task-remove-btn:hover {
    border-color: rgba(220, 38, 38, 0.35);
    color: var(--danger);
    background: rgba(220, 38, 38, 0.06);
  }

  .tasks-empty {
    margin: 0;
    color: var(--ink-500);
    font-size: 13px;
  }

  @media (max-width: 1080px) {
    .studio-layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .studio-rail {
      position: static;
    }
    .summary-grid,
    .header-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 680px) {
    .two-column-grid,
    .name-picker-row,
    .summary-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .task-row {
      grid-template-columns: minmax(0, 1fr) 104px 44px;
    }
  }
</style>
