<script lang="ts">
  import {
    BusinessApiError,
    businessToEntityRecord,
    listAllActiveBusinesses,
  } from "$lib/businesses/client";
  import {
    getProjectOptions,
    ProjectApiError,
    projectRelationsFromRecord,
  } from "$lib/projects/client";
  import type {
    ProjectOptions,
    ProjectResponsible,
    ProjectServiceSummary,
    ProjectTag,
    Service,
  } from "$lib/projects/types";
  import {
    currentSettings,
    loadSettingsFromServer,
  } from "$lib/settings/client";
  import { listAllTasks, TaskApiError } from "$lib/tasks/client";
  import GlobalSelector, {
    type GlobalSelectorItem,
  } from "$lib/ui/GlobalSelector.svelte";
  import {
    Archive,
    BriefcaseBusiness,
    CalendarCheck2,
    CalendarDays,
    FileBadge,
    FileText,
    Flag,
    FolderKanban,
    ListChecks,
    Pencil,
    Plus,
    Save,
    Tags,
    Trash2,
    UsersRound,
    X,
  } from "@lucide/svelte";
  import { onMount, tick } from "svelte";
  import { recordPageHref } from "$lib/records/record-page";
  import type { EntityRecord } from "./types";

  type ProjectFormMode = "create" | "view" | "edit";

  type ProjectTaskDraft = {
    id: string;
    name: string;
  };

  type ProjectInstallmentDraft = {
    number: number;
    dueDate: string;
    amount: string;
    status: string;
  };

  type ProjectFormState = {
    nome: string;
    negocioId: string;
    negocio: string;
    businessWorkspaceId: string;
    cliente: string;
    status: string;
    dataInicio: string;
    dataFim: string;
    briefing: string;
    tasks: ProjectTaskDraft[];
    tipoContrato: string;
    valor: string;
    primeiroVencimento: string;
    parcelas: string;
    installments: ProjectInstallmentDraft[];
    paymentMethod: string;
    paymentTerms: string;
    financeNotes: string;
  };

  let {
    record,
    mode,
    oncancel,
    onsave,
    onedit,
    onarchive,
    ondelete,
    onaddtask,
  } = $props<{
    record?: EntityRecord;
    mode?: ProjectFormMode;
    oncancel: () => void;
    onsave: (values: Record<string, string>) => void;
    onedit?: () => void;
    onarchive?: () => void;
    ondelete?: () => void;
    onaddtask?: (values: Record<string, string>) => void;
  }>();

  let formNode: HTMLFormElement | undefined;
  let startDateInput: HTMLInputElement | undefined;
  let endDateInput: HTMLInputElement | undefined;
  let paymentDateInput: HTMLInputElement | undefined;
  let sourceServiceId = $state("");
  let availableServices = $state<Service[]>([]);
  let currentServiceRelations = $state<ProjectServiceSummary[]>([]);
  let selectedResponsibles = $state<GlobalSelectorItem[]>([]);
  let selectedTags = $state<GlobalSelectorItem[]>([]);
  let currentResponsibleRelations = $state<ProjectResponsible[]>([]);
  let currentTagRelations = $state<ProjectTag[]>([]);
  let projectOptions = $state<ProjectOptions>();
  let optionsLoading = $state(true);
  let optionsError = $state("");
  let optionsRequest: AbortController | undefined;
  let installmentsTouched = $state(false);
  let firstDueDateTouched = $state(false);
  let applyingSourceDefaults = false;
  let validationError = $state("");
  let installmentError = $state("");
  let businesses = $state<EntityRecord[]>([]);
  let businessesLoading = $state(true);
  let businessesError = $state("");
  let businessesRequest: AbortController | undefined;
  let projectTasksLoading = $state(false);
  let projectTasksError = $state("");
  let projectTasksRequest: AbortController | undefined;
  let legacyBusiness: EntityRecord | undefined;
  let statusOptions = $state<{ key: string; label: string }[]>([]);
  let resolvedMode = $derived(mode ?? (record ? "edit" : "create"));
  let viewOnly = $derived(resolvedMode === "view");
  let institutionalProject = $derived(record?.isInstitutional === "true");
  let title = $derived(
    resolvedMode === "view"
      ? "Ver projeto"
      : resolvedMode === "edit"
        ? "Editar projeto"
        : "Novo projeto",
  );
  let recordHref = $derived(
    record?.id ? recordPageHref("projeto", record.id) : undefined,
  );
  let modalTitle = $derived(viewOnly && record?.nome ? record.nome : title);

  function closeBeforePageNavigation(event: MouseEvent): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    oncancel();
  }
  let form = $state<ProjectFormState>(projectFromRecord());
  let businessItems = $derived(
    businesses.map((business) => ({
      id: business.id,
      label: business.nome,
      description: business.cliente || business.responsaveis || undefined,
      updatedAt: business.updatedAt,
    })),
  );
  let sourceServiceItems = $derived(
    sourceSelectorItems(availableServices, currentServiceRelations),
  );
  let responsibleItems = $derived(
    selectorItemsForResponsibles(
      projectOptions?.members ?? [],
      currentResponsibleRelations,
    ),
  );
  let tagItems = $derived(
    selectorItemsForTags(projectOptions?.tags ?? [], currentTagRelations),
  );

  function applyProjectStatuses(
    settings: ReturnType<typeof currentSettings>,
  ): void {
    statusOptions = settings.projectStatuses.map(({ key, label }) => ({
      key,
      label,
    }));

    if (!statusOptions.some(({ key }) => key === form.status)) {
      statusOptions = [
        ...statusOptions,
        {
          key: form.status,
          label:
            {
              andamento: "Em andamento",
              pausado: "Pausado",
            }[form.status] ?? form.status,
        },
      ];
    }
  }

  onMount(() => {
    form = projectFromRecord(record);
    const relations = projectRelationsFromRecord(record);
    sourceServiceId =
      relations.sourceServiceId ?? relations.services.at(0)?.id ?? "";
    currentServiceRelations = relations.services;
    currentResponsibleRelations = relations.responsibles;
    currentTagRelations = relations.tags;
    selectedResponsibles = responsibleSelections(relations.responsibles);
    selectedTags = tagSelections(relations.tags);
    legacyBusiness = legacyBusinessFromRecord(record, form);
    businesses = legacyBusiness ? [legacyBusiness] : [];
    if (legacyBusiness) form.negocioId = legacyBusiness.id;
    void loadBusinesses();
    void loadRelatedTasks();
    void loadOptions();
    applyProjectStatuses(currentSettings());
    void loadSettingsFromServer()
      .then(applyProjectStatuses)
      .catch(() => undefined);

    refreshInstallments({ preserveManual: true });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    void tick().then(() => {
      if (!viewOnly) {
        formNode
          ?.querySelector<HTMLInputElement>('input[name="nome"]')
          ?.focus();
      }
    });

    return () => {
      businessesRequest?.abort();
      optionsRequest?.abort();
      projectTasksRequest?.abort();
      document.body.style.overflow = previousOverflow;
    };
  });

  async function loadRelatedTasks(): Promise<void> {
    if (!record?.id) {
      form.tasks = [];
      return;
    }
    projectTasksRequest?.abort();
    const request = new AbortController();
    projectTasksRequest = request;
    projectTasksLoading = true;
    projectTasksError = "";
    try {
      const relatedTasks = await listAllTasks({
        projectId: record.id,
        archived: "include",
        signal: request.signal,
      });
      if (request.signal.aborted) return;
      form.tasks = relatedTasks.map((task) => ({
        id: task.id,
        name: task.name,
      }));
    } catch (cause) {
      if (request.signal.aborted) return;
      form.tasks = [];
      projectTasksError =
        cause instanceof TaskApiError
          ? cause.message
          : "Não foi possível carregar as tarefas do projeto.";
    } finally {
      if (projectTasksRequest === request) projectTasksLoading = false;
    }
  }

  function unique(values: string[]): string[] {
    return values
      .map((value) => value.trim())
      .filter(
        (value, index, all) =>
          value.length > 0 &&
          all.findIndex(
            (candidate) =>
              candidate.toLocaleLowerCase("pt-BR") ===
              value.toLocaleLowerCase("pt-BR"),
          ) === index,
      );
  }

  function uniqueSelectorItems(
    items: GlobalSelectorItem[],
  ): GlobalSelectorItem[] {
    return items.filter(
      (item, index) =>
        Boolean(item.label.trim()) &&
        items.findIndex((candidate) => candidate.id === item.id) === index,
    );
  }

  function serviceItem(
    service: Service | ProjectServiceSummary,
  ): GlobalSelectorItem {
    return {
      id: service.id,
      label: service.name,
      description:
        service.description ||
        (service.archivedAt ? "Serviço arquivado" : undefined),
      updatedAt: "updatedAt" in service ? service.updatedAt : undefined,
    };
  }

  function selectorItemsForServices(
    services: Service[],
    current: ProjectServiceSummary[],
  ): GlobalSelectorItem[] {
    return uniqueSelectorItems([
      ...services.filter(({ archivedAt }) => !archivedAt).map(serviceItem),
      ...current.map(serviceItem),
    ]);
  }

  function sourceSelectorItems(
    services: Service[],
    current: ProjectServiceSummary[],
  ): GlobalSelectorItem[] {
    const items = selectorItemsForServices(services, current);
    if (sourceServiceId && !items.some(({ id }) => id === sourceServiceId)) {
      items.push({
        id: sourceServiceId,
        label: "Modelo atual",
        description: "Serviço de origem preservado",
      });
    }
    return items;
  }

  function responsibleItem(
    responsible: ProjectResponsible,
  ): GlobalSelectorItem {
    return {
      id: responsible.userId,
      label: responsible.name,
      description: responsible.email,
      avatarUrl: responsible.avatarUrl ?? undefined,
    };
  }

  function selectorItemsForResponsibles(
    members: ProjectResponsible[],
    current: ProjectResponsible[],
  ): GlobalSelectorItem[] {
    return uniqueSelectorItems([
      ...members.map(responsibleItem),
      ...current.map(responsibleItem),
    ]);
  }

  function tagItem(tag: ProjectTag): GlobalSelectorItem {
    return {
      id: tag.id,
      label: tag.name,
      description: tag.archivedAt ? "Tag arquivada" : undefined,
    };
  }

  function selectorItemsForTags(
    tags: ProjectTag[],
    current: ProjectTag[],
  ): GlobalSelectorItem[] {
    return uniqueSelectorItems([
      ...tags.filter(({ archivedAt }) => !archivedAt).map(tagItem),
      ...current.map(tagItem),
    ]);
  }

  function responsibleSelections(
    responsibles: ProjectResponsible[],
  ): GlobalSelectorItem[] {
    return responsibles.map(responsibleItem);
  }

  function tagSelections(tags: ProjectTag[]): GlobalSelectorItem[] {
    return tags.map(tagItem);
  }

  function legacyBusinessFromRecord(
    source: EntityRecord | undefined,
    state: ProjectFormState,
  ): EntityRecord | undefined {
    const storedId = state.negocioId.trim();
    const storedName = state.negocio.trim();
    if (!source || (!storedId && !storedName)) return undefined;

    const selectorId =
      storedId ||
      `negocio-legado-${encodeURIComponent(normalizeText(storedName))}`;
    return {
      id: selectorId,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      workspaceId: state.businessWorkspaceId,
      nome: storedName || storedId || "Negócio legado",
      cliente: state.cliente,
      __legacyBusiness: "true",
      __legacyBusinessId: storedId,
      __legacyBusinessName: storedName,
    };
  }

  function isLegacyBusiness(business: EntityRecord): boolean {
    return business.__legacyBusiness === "true";
  }

  function storedBusinessId(business: EntityRecord): string {
    return isLegacyBusiness(business)
      ? business.__legacyBusinessId
      : business.id;
  }

  function storedBusinessName(business: EntityRecord): string {
    return isLegacyBusiness(business)
      ? business.__legacyBusinessName
      : business.nome;
  }

  function syncSelectedBusiness(business: EntityRecord): void {
    form.negocioId = business.id;
    form.negocio = storedBusinessName(business);
    form.businessWorkspaceId = business.workspaceId;
  }

  async function loadBusinesses(): Promise<void> {
    businessesRequest?.abort();
    const request = new AbortController();
    businessesRequest = request;
    businessesLoading = true;
    businessesError = "";

    try {
      const apiBusinesses = await listAllActiveBusinesses({
        signal: request.signal,
      });
      if (businessesRequest !== request) return;

      const records = apiBusinesses.map(businessToEntityRecord);
      if (
        legacyBusiness &&
        !records.some((business) => business.id === legacyBusiness?.id)
      ) {
        records.push(legacyBusiness);
      }
      businesses = records;

      const selected = businesses.find(
        (business) => business.id === form.negocioId,
      );
      if (selected) syncSelectedBusiness(selected);
      else {
        form.negocioId = "";
        form.negocio = "";
        form.businessWorkspaceId = "";
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (businessesRequest !== request) return;
      businessesError =
        error instanceof BusinessApiError
          ? error.message
          : "Não foi possível carregar os negócios. Tente novamente.";
    } finally {
      if (businessesRequest === request) businessesLoading = false;
    }
  }

  async function loadOptions(): Promise<void> {
    optionsRequest?.abort();
    const request = new AbortController();
    optionsRequest = request;
    optionsLoading = true;
    optionsError = "";

    try {
      const options = await getProjectOptions({ signal: request.signal });
      if (optionsRequest !== request) return;
      if (record?.workspaceId && record.workspaceId !== options.workspaceId) {
        throw new ProjectApiError(
          409,
          "O workspace mudou durante o carregamento do projeto. Abra-o novamente.",
        );
      }
      projectOptions = options;
      availableServices = options.services;
      const responsibles = selectorItemsForResponsibles(
        options.members,
        currentResponsibleRelations,
      );
      selectedResponsibles = selectedResponsibles.flatMap((selected) => {
        const item = responsibles.find(({ id }) => id === selected.id);
        return item ? [item] : [selected];
      });
      const tags = selectorItemsForTags(options.tags, currentTagRelations);
      selectedTags = selectedTags.flatMap((selected) => {
        const item = tags.find(({ id }) => id === selected.id);
        return item ? [item] : [selected];
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (optionsRequest !== request) return;
      optionsError =
        error instanceof ProjectApiError
          ? error.message
          : "Não foi possível carregar serviços e responsáveis. Tente novamente.";
    } finally {
      if (optionsRequest === request) optionsLoading = false;
    }
  }

  function first(record: EntityRecord | undefined, ...keys: string[]): string {
    for (const key of keys) {
      const value = record?.[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    return "";
  }

  function parseInstallments(value: string): ProjectInstallmentDraft[] {
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const installment = item as Record<string, unknown>;
        const dueDate =
          typeof installment.due_date === "string"
            ? installment.due_date
            : typeof installment.dueDate === "string"
              ? installment.dueDate
              : "";
        const amount =
          typeof installment.amount === "string"
            ? installment.amount
            : typeof installment.valor === "string"
              ? installment.valor
              : "";
        return [
          {
            number:
              typeof installment.number === "number"
                ? Math.max(1, installment.number)
                : index + 1,
            dueDate: normalizeDate(dueDate) ?? "",
            amount,
            status:
              typeof installment.status === "string" && installment.status
                ? installment.status
                : "pending",
          },
        ];
      });
    } catch {
      return [];
    }
  }

  function displayDate(value: string): string {
    const raw = value.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(raw);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const digits = /^(\d{2})(\d{2})(\d{4})$/u.exec(raw);
    if (digits) return `${digits[1]}/${digits[2]}/${digits[3]}`;
    return raw.replaceAll(".", "/");
  }

  function normalizeContractType(value: string): "Pontual" | "Recorrente" {
    const normalized = normalizeText(value);
    return normalized === "recorrente" || normalized === "mensal"
      ? "Recorrente"
      : "Pontual";
  }

  function formatDateInput(value: string): string {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const digits = value.replace(/\D/gu, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  function handlePaymentDateInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const formatted = formatDateInput(input.value);
    input.value = formatted;
    form.primeiroVencimento = formatted;
    paymentDateInput?.setCustomValidity("");
  }

  function projectFromRecord(record?: EntityRecord): ProjectFormState {
    const contractType = normalizeContractType(
      first(record, "tipoContrato", "contract_type"),
    );
    return {
      nome: first(record, "nome", "name"),
      negocioId: first(record, "negocioId", "business_id"),
      negocio: first(record, "negocio", "business_name", "cliente"),
      businessWorkspaceId: first(
        record,
        "businessWorkspaceId",
        "business_workspace_id",
        "workspaceId",
      ),
      cliente: first(record, "cliente"),
      status: first(record, "status") || "planejamento",
      dataInicio: displayDate(first(record, "dataInicio", "start_date")),
      dataFim: displayDate(first(record, "dataFim", "delivery_date", "prazo")),
      briefing: first(record, "briefing", "description", "descricao"),
      tasks: [],
      tipoContrato: contractType,
      valor: first(record, "valor", "amount"),
      primeiroVencimento: displayDate(
        first(record, "primeiroVencimento", "payment_date"),
      ),
      parcelas:
        contractType === "Pontual"
          ? first(record, "parcelas", "installments_count") ||
            (record ? "1" : "")
          : "1",
      installments: parseInstallments(
        first(record, "installments", "parcelasDetalhadas"),
      ),
      paymentMethod: first(record, "paymentMethod", "payment_method"),
      paymentTerms: first(record, "paymentTerms", "payment_terms"),
      financeNotes: first(record, "financeNotes", "finance_notes"),
    };
  }

  function normalizeText(value: string): string {
    return value
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .trim()
      .replace(/\s+/gu, " ")
      .toLocaleLowerCase("pt-BR");
  }

  function selectSourceService(id: string): void {
    sourceServiceId = id;
    if (resolvedMode !== "create") return;
    const service = availableServices.find((candidate) => candidate.id === id);
    if (service) applySourceServiceDefaults(service);
  }

  function applySourceServiceDefaults(service: Service): void {
    applyingSourceDefaults = true;
    firstDueDateTouched = false;
    if (!form.dataInicio) {
      form.dataInicio = displayDate(new Date().toISOString().slice(0, 10));
    }
    const startDate = normalizeDate(form.dataInicio);
    const endDate =
      startDate && service.defaultDurationDays !== null
        ? addDays(startDate, service.defaultDurationDays)
        : "";
    form.status = service.defaultStatus;
    form.dataFim = displayDate(endDate);
    form.briefing = service.defaultBriefing;
    form.tipoContrato =
      service.defaultContractType === "recurring" ? "Recorrente" : "Pontual";
    form.valor = centsToMoney(service.defaultAmountCents);
    form.parcelas = String(Math.max(1, service.defaultInstallmentCount));
    form.paymentMethod = service.defaultPaymentMethod;
    form.paymentTerms = service.defaultPaymentTerms;
    form.financeNotes = service.defaultFinanceNotes;
    selectedTags = service.tags.map(tagItem);
    selectedResponsibles = service.responsibles.map(responsibleItem);
    syncSourceFirstDueDate();
    refreshInstallments();
    installmentsTouched = false;
    applyingSourceDefaults = false;
  }

  function refreshSourceEndDate(): void {
    if (resolvedMode !== "create" || !sourceServiceId) return;
    const service = availableServices.find(
      (candidate) => candidate.id === sourceServiceId,
    );
    const startDate = normalizeDate(form.dataInicio);
    if (!service) return;
    if (startDate && service.defaultDurationDays !== null) {
      form.dataFim = displayDate(
        addDays(startDate, service.defaultDurationDays),
      );
    }
    syncSourceFirstDueDate();
    refreshInstallments();
  }

  function sourceFirstDueDate(startDate: string): string {
    const amountCents = Math.max(0, moneyToCents(form.valor) ?? 0);
    return form.tipoContrato === "Pontual" && amountCents > 0 ? startDate : "";
  }

  function syncSourceFirstDueDate(): void {
    if (resolvedMode !== "create" || !sourceServiceId || firstDueDateTouched) {
      return;
    }
    const startDate = normalizeDate(form.dataInicio) ?? "";
    form.primeiroVencimento = displayDate(sourceFirstDueDate(startDate));
  }

  function sameValues(left: string[], right: string[]): boolean {
    const normalized = (values: string[]) =>
      unique(values)
        .map(normalizeText)
        .sort((a, b) => a.localeCompare(b));
    return (
      JSON.stringify(normalized(left)) === JSON.stringify(normalized(right))
    );
  }

  function sourceOverrideFields(): string[] {
    if (resolvedMode !== "create" || !sourceServiceId) return [];
    const source = availableServices.find(({ id }) => id === sourceServiceId);
    if (!source) return [];
    const overrides: string[] = [];
    const startDate = normalizeDate(form.dataInicio);
    const expectedEnd =
      startDate && source.defaultDurationDays !== null
        ? addDays(startDate, source.defaultDurationDays)
        : "";
    if (form.status !== source.defaultStatus) overrides.push("status");
    if ((normalizeDate(form.dataFim) ?? "") !== expectedEnd) {
      overrides.push("endDate");
    }
    if (form.briefing.trim() !== source.defaultBriefing.trim()) {
      overrides.push("briefing");
    }
    if (
      !sameValues(
        selectedTags.map(({ label }) => label),
        source.tags.map(({ name }) => name),
      )
    ) {
      overrides.push("tagLabels");
    }
    if (
      !sameValues(
        selectedResponsibles.map(({ id }) => id),
        source.responsibles.map(({ userId }) => userId),
      )
    ) {
      overrides.push("responsibleUserIds");
    }
    const contractType =
      form.tipoContrato === "Recorrente" ? "recurring" : "one_off";
    if (contractType !== source.defaultContractType) {
      overrides.push("contractType");
    }
    if ((moneyToCents(form.valor) ?? 0) !== source.defaultAmountCents) {
      overrides.push("amountCents");
    }
    const expectedFirstDueDate = sourceFirstDueDate(startDate ?? "");
    if (
      (normalizeDate(form.primeiroVencimento) ?? "") !== expectedFirstDueDate
    ) {
      overrides.push("firstDueDate");
    }
    if (form.paymentMethod.trim() !== source.defaultPaymentMethod.trim()) {
      overrides.push("paymentMethod");
    }
    if (form.paymentTerms.trim() !== source.defaultPaymentTerms.trim()) {
      overrides.push("paymentTerms");
    }
    if (form.financeNotes.trim() !== source.defaultFinanceNotes.trim()) {
      overrides.push("financeNotes");
    }
    if (installmentsTouched) overrides.push("installments");
    return overrides;
  }

  function selectBusiness(id: string): void {
    const business = businesses.find((candidate) => candidate.id === id);
    if (business) syncSelectedBusiness(business);
    else {
      form.negocioId = "";
      form.negocio = "";
      form.businessWorkspaceId = "";
    }
  }

  function normalizeDate(value: string): string | null {
    const raw = value.trim();
    if (!raw) return "";
    const match =
      /^(?:(\d{2})[./](\d{2})[./](\d{4})|(\d{4})-(\d{2})-(\d{2}))$/u.exec(raw);
    if (!match) return null;
    const year = Number(match[3] ?? match[4]);
    const month = Number(match[2] ?? match[5]);
    const day = Number(match[1] ?? match[6]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function validateDate(
    input: HTMLInputElement | undefined,
    value: string,
    label: string,
  ): string | null {
    const normalized = normalizeDate(value);
    input?.setCustomValidity("");
    if (normalized !== null) return normalized;
    const message = `Informe ${label.toLocaleLowerCase("pt-BR")} no formato dd/mm/aaaa.`;
    validationError = message;
    input?.setCustomValidity(message);
    input?.reportValidity();
    input?.focus();
    return null;
  }

  function moneyToCents(value: string): number | null {
    const raw = value.trim().replace(/\s|R\$/giu, "");
    if (!raw) return null;
    const negative = raw.includes("-");
    const cleaned = raw.replaceAll("-", "");
    const decimalSeparator = Math.max(
      cleaned.lastIndexOf(","),
      cleaned.lastIndexOf("."),
    );
    let digits: string;
    if (
      decimalSeparator >= 0 &&
      cleaned.length - decimalSeparator - 1 >= 1 &&
      cleaned.length - decimalSeparator - 1 <= 2
    ) {
      const integer =
        cleaned.slice(0, decimalSeparator).replace(/\D/gu, "") || "0";
      const decimal = cleaned
        .slice(decimalSeparator + 1)
        .replace(/\D/gu, "")
        .padEnd(2, "0")
        .slice(0, 2);
      digits = `${integer}${decimal}`;
    } else {
      digits = `${cleaned.replace(/\D/gu, "")}00`;
    }
    if (!/^\d+$/u.test(digits)) return null;
    const cents = Number(digits);
    if (!Number.isFinite(cents)) return null;
    return negative ? -cents : cents;
  }

  function centsToMoney(cents: number): string {
    const safeCents = Math.round(Number.isFinite(cents) ? cents : 0);
    const sign = safeCents < 0 ? "-" : "";
    const absolute = Math.abs(safeCents);
    return `${sign}${Math.floor(absolute / 100).toLocaleString("pt-BR")},${String(absolute % 100).padStart(2, "0")}`;
  }

  function addDays(dateValue: string, days: number): string {
    const normalized = normalizeDate(dateValue);
    if (!normalized) return "";
    const [year, month, day] = normalized.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function addCalendarMonths(dateValue: string, months: number): string {
    const normalized = normalizeDate(dateValue);
    if (!normalized) return "";
    const [year, month, day] = normalized.split("-").map(Number);
    const first = new Date(Date.UTC(year, month - 1 + months, 1));
    const lastDay = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    first.setUTCDate(Math.min(day, lastDay));
    return first.toISOString().slice(0, 10);
  }

  function daysBetween(startValue: string, endValue: string): number | null {
    const start = normalizeDate(startValue);
    const end = normalizeDate(endValue);
    if (!start || !end) return null;
    const startTime = Date.parse(`${start}T00:00:00Z`);
    const endTime = Date.parse(`${end}T00:00:00Z`);
    return Math.round((endTime - startTime) / 86_400_000);
  }

  function splitAmount(totalCents: number, count: number): number[] {
    if (count <= 0) return [];
    const base = Math.trunc(totalCents / count);
    const values = Array.from({ length: count }, () => base);
    values[count - 1] += totalCents - base * count;
    return values;
  }

  function buildAutoInstallments(
    count: number,
    firstDueDate: string,
    totalCents: number,
  ): ProjectInstallmentDraft[] {
    return splitAmount(totalCents, count).map((amount, index) => ({
      number: index + 1,
      dueDate: addCalendarMonths(firstDueDate, index),
      amount: centsToMoney(amount),
      status: form.installments[index]?.status || "pending",
    }));
  }

  function installmentCount(): number {
    return Math.max(1, Math.min(99, Number.parseInt(form.parcelas, 10) || 1));
  }

  function updateContractType(value: string): void {
    const wasRecurring = form.tipoContrato === "Recorrente";
    form.tipoContrato = normalizeContractType(value);
    if (form.tipoContrato === "Recorrente") form.parcelas = "1";
    else if (wasRecurring) form.parcelas = "";
    syncSourceFirstDueDate();
    refreshInstallments();
  }

  function updateProjectAmount(): void {
    syncSourceFirstDueDate();
    refreshInstallments();
  }

  function updateInstallmentCount(value: string): void {
    if (!applyingSourceDefaults) installmentsTouched = true;
    form.parcelas = value;
    const count = Number.parseInt(value, 10);
    if (Number.isFinite(count) && count >= 1) refreshInstallments();
    else form.installments = [];
  }

  function refreshInstallments(
    options: { preserveManual?: boolean } = {},
  ): void {
    const count = installmentCount();
    if (form.parcelas.trim()) form.parcelas = String(count);
    const totalCents = Math.max(0, moneyToCents(form.valor) ?? 0);
    const firstDueDate = normalizeDate(form.primeiroVencimento) ?? "";
    if (count === 1) {
      form.installments =
        totalCents === 0 && !firstDueDate
          ? []
          : buildAutoInstallments(1, firstDueDate, totalCents);
      validationError = "";
      installmentError = "";
      return;
    }
    if (options.preserveManual && form.installments.length === count) {
      form.installments = form.installments.map((installment, index) => ({
        ...installment,
        number: index + 1,
      }));
    } else {
      form.installments = buildAutoInstallments(
        count,
        firstDueDate,
        totalCents,
      );
    }
    validationError = "";
    installmentError = "";
  }

  function updateFirstDueDate(value: string): void {
    if (!applyingSourceDefaults) firstDueDateTouched = true;
    const normalized = normalizeDate(value);
    const count = installmentCount();
    if (!normalized) {
      validationError = "";
      installmentError = "";
      return;
    }
    if (count <= 1 || form.installments.length !== count) {
      refreshInstallments();
      return;
    }

    form.installments = form.installments.map((installment, index) => ({
      ...installment,
      dueDate: addDays(normalized, index * 30),
    }));
    validationError = "";
    installmentError = "";
  }

  function updateInstallmentDate(index: number, value: string): void {
    if (!form.installments[index]) return;
    if (!applyingSourceDefaults) installmentsTouched = true;
    const normalized = normalizeDate(value);
    const items = form.installments.map((installment) => ({ ...installment }));
    items[index].dueDate = value;

    if (normalized) {
      if (index === 0) {
        form.primeiroVencimento = displayDate(normalized);
        items.forEach((installment, itemIndex) => {
          installment.dueDate = addCalendarMonths(normalized, itemIndex);
        });
      } else {
        const interval = daysBetween(items[index - 1].dueDate, normalized);
        if (interval !== null) {
          items.slice(index + 1).forEach((installment, offset) => {
            installment.dueDate = addDays(normalized, interval * (offset + 1));
          });
        }
      }
    }

    form.installments = items;
    validationError = "";
    installmentError = "";
  }

  function rebalanceInstallments(index: number, value: string): void {
    if (!applyingSourceDefaults) installmentsTouched = true;
    const totalCents = Math.max(0, moneyToCents(form.valor) ?? 0);
    const items = form.installments.map((installment) => ({ ...installment }));
    if (!items[index]) return;
    const previousTotal = items
      .slice(0, index)
      .reduce(
        (sum, installment) =>
          sum + Math.max(0, moneyToCents(installment.amount) ?? 0),
        0,
      );
    const amount = Math.max(
      0,
      Math.min(totalCents - previousTotal, moneyToCents(value) ?? 0),
    );
    items[index].amount = centsToMoney(amount);
    const remainingIndexes = items.length - index - 1;
    const remaining = Math.max(0, totalCents - previousTotal - amount);
    splitAmount(remaining, remainingIndexes).forEach((part, offset) => {
      items[index + offset + 1].amount = centsToMoney(part);
    });
    form.installments = items;
    validationError = "";
    installmentError = "";
  }

  function serializeInstallments(): string {
    return JSON.stringify(
      form.installments.map((installment, index) => ({
        number: index + 1,
        due_date: normalizeDate(installment.dueDate) ?? "",
        amount: centsToMoney(moneyToCents(installment.amount) ?? 0),
        status: installment.status,
      })),
    );
  }

  function validateInstallments(count: number, totalCents: number): boolean {
    if (totalCents < 0) {
      validationError = "O valor do projeto não pode ser negativo.";
      installmentError = validationError;
      return false;
    }
    if (form.tipoContrato !== "Pontual") return true;
    if (totalCents <= 0) {
      if (count <= 1) return true;
      validationError = "Informe um valor total válido para gerar as parcelas.";
      installmentError = validationError;
      return false;
    }
    if (!normalizeDate(form.primeiroVencimento)) {
      validationError = "Informe o primeiro vencimento para gerar as parcelas.";
      installmentError = validationError;
      paymentDateInput?.focus();
      return false;
    }
    if (
      form.installments.length !== count ||
      form.installments.some(
        (installment) => !normalizeDate(installment.dueDate),
      )
    ) {
      validationError = "Todas as parcelas precisam ter vencimento.";
      installmentError = validationError;
      return false;
    }
    const installmentValues = form.installments.map((installment) =>
      moneyToCents(installment.amount),
    );
    if (installmentValues.some((amount) => amount === null || amount < 0)) {
      validationError = "Todas as parcelas precisam ter um valor válido.";
      installmentError = validationError;
      return false;
    }
    const sum = installmentValues.reduce<number>(
      (total, amount) => total + (amount ?? 0),
      0,
    );
    if (sum !== totalCents) {
      validationError =
        "A soma das parcelas precisa ser igual ao valor total do projeto.";
      installmentError = validationError;
      return false;
    }
    installmentError = "";
    return true;
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (viewOnly || !formNode) return;
    validationError = "";
    installmentError = "";
    if (optionsLoading || optionsError) {
      validationError = optionsError || "Aguarde o carregamento do catálogo.";
      return;
    }
    const business = businesses.find(
      (candidate) => candidate.id === form.negocioId,
    );
    const businessInput = formNode.querySelector<HTMLInputElement>(
      'input[aria-label="Negócio"]',
    );
    businessInput?.setCustomValidity("");
    if (
      !business ||
      (resolvedMode === "create" && isLegacyBusiness(business))
    ) {
      const message = "Selecione um negócio válido.";
      validationError = message;
      businessInput?.setCustomValidity(message);
      businessInput?.reportValidity();
      businessInput?.focus();
      return;
    }

    const businessWorkspaceId = business.workspaceId;

    const selectedSource = sourceServiceId
      ? sourceServiceItems.find(({ id }) => id === sourceServiceId)
      : undefined;
    if (
      resolvedMode === "create" &&
      sourceServiceId &&
      (!selectedSource ||
        !availableServices.some(
          ({ id, archivedAt }) => id === sourceServiceId && !archivedAt,
        ))
    ) {
      validationError = "Selecione um serviço válido.";
      return;
    }
    const serviceIds = sourceServiceId ? [sourceServiceId] : [];
    if (!selectedResponsibles.length) {
      validationError = "Selecione ao menos uma pessoa responsável.";
      return;
    }

    const startDate = validateDate(
      startDateInput,
      form.dataInicio,
      "Data de início",
    );
    if (startDate === null) return;
    const endDate = validateDate(endDateInput, form.dataFim, "Data de fim");
    if (endDate === null) return;
    const paymentDate = validateDate(
      paymentDateInput,
      form.primeiroVencimento,
      "Primeiro vencimento",
    );
    if (paymentDate === null) return;

    const installmentCount = Math.max(
      1,
      Math.min(99, Number.parseInt(form.parcelas, 10) || 1),
    );
    form.parcelas = String(installmentCount);
    const totalCents = moneyToCents(form.valor) ?? 0;
    if (!validateInstallments(installmentCount, totalCents)) return;

    if (!formNode.reportValidity()) return;

    const savedStartDate =
      startDate ||
      (resolvedMode === "create" ? new Date().toISOString().slice(0, 10) : "");
    const selectedServiceLabels = selectedSource ? [selectedSource.label] : [];
    const installmentsJson = serializeInstallments();
    const businessId = storedBusinessId(business);
    const businessName = storedBusinessName(business);
    const responsibleNames = selectedResponsibles.map(({ label }) => label);
    const tagLabels = selectedTags.map(({ label }) => label);
    const contractType =
      form.tipoContrato === "Recorrente" ? "recurring" : "one_off";

    const values = {
      nome: form.nome.trim(),
      name: form.nome.trim(),
      servicos: selectedServiceLabels.join(", "),
      service_tags: selectedServiceLabels.join(", "),
      serviceIds: JSON.stringify(serviceIds),
      sourceServiceId,
      sourceOverrideFields: JSON.stringify(sourceOverrideFields()),
      negocioId: businessId,
      business_id: businessId,
      negocio: businessName,
      business_name: businessName,
      cliente: business.cliente || form.cliente || businessName,
      ...(businessWorkspaceId
        ? {
            businessWorkspaceId,
            business_workspace_id: businessWorkspaceId,
          }
        : {}),
      status: form.status,
      dataInicio: savedStartDate,
      start_date: savedStartDate,
      dataFim: endDate,
      delivery_date: endDate,
      prazo: endDate,
      briefing: form.briefing.trim(),
      description: form.briefing.trim(),
      descricao: form.briefing.trim(),
      tags: tagLabels.join(", "),
      tagLabels: JSON.stringify(tagLabels),
      responsaveis: responsibleNames.join(", "),
      responsavel: responsibleNames.join(", "),
      responsibleUserIds: JSON.stringify(
        selectedResponsibles.map(({ id }) => id),
      ),
      tipoContrato: form.tipoContrato,
      contract_type: contractType,
      valor: form.valor.trim(),
      amount: form.valor.trim(),
      amountCents: String(totalCents),
      primeiroVencimento: paymentDate,
      payment_date: paymentDate,
      parcelas: form.parcelas,
      installments_count: form.parcelas,
      installments: installmentsJson,
      parcelasDetalhadas: installmentsJson,
      paymentMethod: form.paymentMethod.trim(),
      paymentTerms: form.paymentTerms.trim(),
      financeNotes: form.financeNotes.trim(),
      special_condition: installmentCount > 1 ? "1" : "0",
      is_institutional: "0",
    };
    const addTaskAfterSave =
      (event.submitter as HTMLElement | null)?.dataset.action === "add-task";
    if (addTaskAfterSave && onaddtask) onaddtask(values);
    else onsave(values);
  }
</script>

<div
  class="backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && oncancel()}
>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="project-form-title"
  >
    <header>
      <h2 id="project-form-title">
        {#if viewOnly && recordHref}
          <a
            class="record-page-link"
            href={recordHref}
            onclick={closeBeforePageNavigation}>{modalTitle}</a
          >
        {:else}
          {modalTitle}
        {/if}
      </h2>
      <button
        class="close"
        type="button"
        aria-label="Fechar"
        onclick={oncancel}
      >
        <X size={18} strokeWidth={2} />
      </button>
    </header>

    <div class="body">
      <form class:view-mode={viewOnly} bind:this={formNode} onsubmit={submit}>
        {#if validationError}
          <div class="notice" role="alert">{validationError}</div>
        {/if}

        <section class="section" aria-labelledby="project-about-title">
          <h3 id="project-about-title">Sobre</h3>
          <div class="about-grid">
            <div class="field full service-field">
              <GlobalSelector
                items={sourceServiceItems}
                bind:value={sourceServiceId}
                presentation="search"
                selection="single"
                label="Serviço (opcional)"
                placeholder="Selecione um serviço para usar como modelo"
                emptyMessage="Nenhum serviço disponível."
                icon={Tags}
                controlIcon={Tags}
                disabled={viewOnly ||
                  resolvedMode !== "create" ||
                  optionsLoading ||
                  Boolean(optionsError)}
                onchange={selectSourceService}
              />
              {#if optionsLoading}
                <p class="businesses-state" role="status">
                  Carregando serviços, responsáveis e tags…
                </p>
              {:else if optionsError}
                <div class="businesses-error" role="alert">
                  <span>{optionsError}</span>
                  <button type="button" onclick={() => void loadOptions()}>
                    Tentar novamente
                  </button>
                </div>
              {/if}
            </div>

            <div class="field full">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <FolderKanban size={15} strokeWidth={1.8} />
                </span>
                <input
                  name="nome"
                  maxlength="140"
                  required
                  disabled={viewOnly}
                  aria-label="Nome do projeto"
                  placeholder="Título do projeto"
                  bind:value={form.nome}
                />
              </div>
            </div>

            <div class="field full">
              <GlobalSelector
                items={businessItems}
                bind:value={form.negocioId}
                presentation="search"
                selection="single"
                label="Negócio"
                placeholder={businessesLoading
                  ? "Carregando negócios..."
                  : "Selecione o negócio"}
                emptyMessage="Nenhum negócio encontrado."
                icon={BriefcaseBusiness}
                controlIcon={BriefcaseBusiness}
                required
                disabled={viewOnly ||
                  businessesLoading ||
                  Boolean(businessesError)}
                onchange={selectBusiness}
              />
              {#if businessesLoading}
                <p class="businesses-state" aria-live="polite">
                  Carregando negócios do workspace ativo...
                </p>
              {:else if businessesError}
                <div class="businesses-error" role="alert">
                  <span>{businessesError}</span>
                  <button type="button" onclick={() => void loadBusinesses()}>
                    Tentar novamente
                  </button>
                </div>
              {/if}
            </div>

            <div class="field full">
              <GlobalSelector
                items={responsibleItems}
                bind:selected={selectedResponsibles}
                presentation="search"
                selection="multiple"
                label="Pessoas responsáveis"
                placeholder="Selecione ao menos uma pessoa responsável"
                emptyMessage="Nenhum membro disponível neste workspace."
                icon={UsersRound}
                required
                showInitials
                showHelper
                helperMessage="Você pode selecionar mais de uma pessoa."
                disabled={viewOnly || optionsLoading || Boolean(optionsError)}
              />
            </div>

            <div class="field">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <Flag size={15} strokeWidth={1.8} />
                </span>
                <select
                  name="status"
                  disabled={viewOnly}
                  aria-label="Status"
                  bind:value={form.status}
                >
                  {#each statusOptions as status (status.key)}
                    <option value={status.key}>{status.label}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div class="field">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <CalendarDays size={15} strokeWidth={1.8} />
                </span>
                <input
                  bind:this={startDateInput}
                  name="dataInicio"
                  inputmode="numeric"
                  autocomplete="off"
                  maxlength="10"
                  disabled={viewOnly}
                  aria-label="Data de início"
                  placeholder="Data de início"
                  bind:value={form.dataInicio}
                  oninput={() => {
                    startDateInput?.setCustomValidity("");
                    refreshSourceEndDate();
                  }}
                />
              </div>
            </div>

            <div class="field">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <CalendarCheck2 size={15} strokeWidth={1.8} />
                </span>
                <input
                  bind:this={endDateInput}
                  name="dataFim"
                  inputmode="numeric"
                  autocomplete="off"
                  maxlength="10"
                  disabled={viewOnly}
                  aria-label="Data de fim"
                  placeholder="Data de fim"
                  bind:value={form.dataFim}
                  oninput={() => endDateInput?.setCustomValidity("")}
                />
              </div>
            </div>

            <div class="field full">
              <div class="control textarea-control">
                <span class="control-icon" aria-hidden="true">
                  <FileText size={15} strokeWidth={1.8} />
                </span>
                <textarea
                  name="briefing"
                  rows="5"
                  maxlength="1600"
                  disabled={viewOnly}
                  aria-label="Briefing"
                  placeholder="Briefing"
                  bind:value={form.briefing}></textarea>
              </div>
            </div>

            <div class="field full">
              <GlobalSelector
                items={tagItems}
                bind:selected={selectedTags}
                presentation="search"
                selection="multiple"
                label="Tags"
                placeholder="Selecione as tags"
                emptyMessage="Nenhuma tag disponível neste workspace."
                icon={Tags}
                controlIcon={Tags}
                showHelper
                helperMessage="Você pode selecionar mais de uma tag."
                disabled={viewOnly || optionsLoading || Boolean(optionsError)}
              />
            </div>
          </div>
        </section>

        <section
          class="section task-section"
          aria-labelledby="project-tasks-title"
        >
          <div class="section-head">
            <h3 id="project-tasks-title" class="title-with-icon">
              <ListChecks size={17} strokeWidth={1.8} aria-hidden="true" />
              <span>Tarefas</span>
            </h3>
            <div class="task-actions">
              <span class="count" aria-label={`${form.tasks.length} tarefas`}>
                {form.tasks.length}
              </span>
              {#if !viewOnly && onaddtask}
                <button class="add-task" type="submit" data-action="add-task">
                  <Plus size={16} strokeWidth={2} />
                  <span>Adicionar tarefa</span>
                </button>
              {/if}
            </div>
          </div>

          <p class="task-note">
            As tarefas são carregadas do servidor e só podem ser alteradas na
            área de tarefas.
          </p>

          <div class="task-list" aria-live="polite">
            {#if projectTasksLoading}
              <div class="task-empty">Carregando tarefas…</div>
            {:else if projectTasksError}
              <div class="task-empty" role="alert">
                {projectTasksError}
                <button type="button" onclick={() => void loadRelatedTasks()}>
                  Tentar novamente
                </button>
              </div>
            {:else if form.tasks.length}
              {#each form.tasks as task (task.id)}
                <div class="task-row">
                  <ListChecks size={15} strokeWidth={1.8} aria-hidden="true" />
                  <input
                    data-task-id={task.id}
                    maxlength="140"
                    disabled
                    aria-label="Nome da tarefa"
                    placeholder="Nome da tarefa"
                    value={task.name}
                  />
                </div>
              {/each}
            {:else}
              <div class="task-empty">Sem tarefas neste projeto.</div>
            {/if}
          </div>
        </section>

        <section
          class="section contract-section"
          aria-labelledby="project-contract-title"
        >
          <h3 id="project-contract-title">Contrato</h3>
          <div
            class="contract-grid"
            class:recurring={form.tipoContrato === "Recorrente"}
          >
            <div class="contract-type">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <FileBadge size={15} strokeWidth={1.8} />
                </span>
                <select
                  name="tipoContrato"
                  disabled={viewOnly}
                  aria-label="Tipo de contratação"
                  bind:value={form.tipoContrato}
                  onchange={(event) =>
                    updateContractType(event.currentTarget.value)}
                >
                  <option value="Pontual">Pontual</option>
                  <option value="Recorrente">Recorrente</option>
                </select>
              </div>
            </div>

            <div class="contract-value">
              <div class="control prefix-control">
                <span class="prefix" aria-hidden="true">R$</span>
                <input
                  name="valor"
                  maxlength="40"
                  inputmode="decimal"
                  disabled={viewOnly}
                  aria-label="Valor"
                  placeholder="Valor"
                  bind:value={form.valor}
                  onchange={updateProjectAmount}
                />
              </div>
            </div>

            <div class="contract-date">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <CalendarDays size={15} strokeWidth={1.8} />
                </span>
                <input
                  bind:this={paymentDateInput}
                  name="primeiroVencimento"
                  inputmode="numeric"
                  autocomplete="off"
                  maxlength="10"
                  disabled={viewOnly}
                  aria-label="Primeiro vencimento"
                  placeholder="dd/mm/aaaa"
                  bind:value={form.primeiroVencimento}
                  oninput={handlePaymentDateInput}
                  onchange={(event) =>
                    updateFirstDueDate(event.currentTarget.value)}
                />
              </div>
            </div>

            {#if form.tipoContrato === "Pontual"}
              <div class="contract-installments">
                <div class="control prefix-control">
                  <span class="prefix" aria-hidden="true">#</span>
                  <input
                    name="parcelas"
                    type="number"
                    min="1"
                    max="99"
                    step="1"
                    disabled={viewOnly}
                    aria-label="Parcelas"
                    placeholder="Parcelas"
                    bind:value={form.parcelas}
                    oninput={(event) =>
                      updateInstallmentCount(event.currentTarget.value)}
                  />
                </div>
              </div>
            {/if}

            <div class="payment-method">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <FileBadge size={15} strokeWidth={1.8} />
                </span>
                <input
                  name="paymentMethod"
                  maxlength="120"
                  disabled={viewOnly}
                  aria-label="Forma de pagamento"
                  placeholder="Forma de pagamento"
                  bind:value={form.paymentMethod}
                />
              </div>
            </div>

            <div class="payment-terms">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <FileText size={15} strokeWidth={1.8} />
                </span>
                <input
                  name="paymentTerms"
                  maxlength="240"
                  disabled={viewOnly}
                  aria-label="Condições de pagamento"
                  placeholder="Condições de pagamento"
                  bind:value={form.paymentTerms}
                />
              </div>
            </div>

            <div class="finance-notes">
              <div class="control textarea-control">
                <span class="control-icon" aria-hidden="true">
                  <FileText size={15} strokeWidth={1.8} />
                </span>
                <textarea
                  name="financeNotes"
                  rows="3"
                  maxlength="1200"
                  disabled={viewOnly}
                  aria-label="Observações financeiras"
                  placeholder="Observações financeiras"
                  bind:value={form.financeNotes}></textarea>
              </div>
            </div>

            {#if form.tipoContrato === "Pontual" && installmentCount() > 1}
              <div class="installments-panel">
                <div class="installments-head">
                  <strong>Plano de parcelamento</strong>
                  <span>{installmentCount()} parcelas</span>
                </div>

                {#if installmentError}
                  <div class="installments-alert" role="alert">
                    {installmentError}
                  </div>
                {/if}

                <div class="installments-table-wrap">
                  <table class="installments-table">
                    <thead>
                      <tr>
                        <th scope="col">Parcela</th>
                        <th scope="col">Vencimento</th>
                        <th scope="col">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each form.installments as installment, index (installment.number)}
                        <tr>
                          <th scope="row">{index + 1}</th>
                          <td>
                            <input
                              type="date"
                              disabled={viewOnly}
                              aria-label={`Vencimento da parcela ${index + 1}`}
                              value={installment.dueDate}
                              onchange={(event) =>
                                updateInstallmentDate(
                                  index,
                                  event.currentTarget.value,
                                )}
                            />
                          </td>
                          <td>
                            <div class="installment-value">
                              <span aria-hidden="true">R$</span>
                              <input
                                disabled={viewOnly}
                                inputmode="decimal"
                                aria-label={`Valor da parcela ${index + 1}`}
                                value={installment.amount}
                                onblur={(event) =>
                                  rebalanceInstallments(
                                    index,
                                    event.currentTarget.value,
                                  )}
                              />
                            </div>
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
            {/if}
          </div>
        </section>

        <div class="actions">
          {#if resolvedMode === "view"}
            <div class="action-group action-group-right">
              <button
                class="primary"
                type="button"
                disabled={!onedit || institutionalProject}
                onclick={() => onedit?.()}
              >
                <Pencil size={16} strokeWidth={2} />
                <span>Editar</span>
              </button>
              <button
                class="archive"
                type="button"
                disabled={!onarchive || institutionalProject}
                onclick={() => onarchive?.()}
              >
                <Archive size={16} strokeWidth={2} />
                <span>Arquivar</span>
              </button>
            </div>
          {:else if resolvedMode === "edit"}
            <div class="action-group">
              <button
                class="danger"
                type="button"
                disabled={!ondelete || institutionalProject}
                onclick={() => ondelete?.()}
              >
                <Trash2 size={16} strokeWidth={2} />
                <span>Excluir</span>
              </button>
              <button
                class="archive"
                type="button"
                disabled={!onarchive || institutionalProject}
                onclick={() => onarchive?.()}
              >
                <Archive size={16} strokeWidth={2} />
                <span>Arquivar</span>
              </button>
            </div>
            <div class="action-group action-group-right">
              <button class="cancel" type="button" onclick={oncancel}>
                <X size={16} strokeWidth={2} />
                <span>Cancelar</span>
              </button>
              <button class="success" type="submit">
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
              <button class="success" type="submit">
                <Save size={16} strokeWidth={2} />
                <span>Criar projeto</span>
              </button>
            </div>
          {/if}
        </div>
      </form>
    </div>
  </div>
</div>

<svelte:window onkeydown={(event) => event.key === "Escape" && oncancel()} />

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
    width: min(920px, 100%);
    max-height: min(88dvh, 980px);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--canvas);
    box-shadow: 0 22px 48px rgba(15, 23, 42, 0.18);
    animation: rise var(--motion-base) ease-out;
  }

  header {
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
    line-height: 1.2;
  }

  h2 {
    font-size: var(--text-xl);
  }
  .record-page-link {
    color: inherit;
  }
  .record-page-link:hover,
  .record-page-link:focus-visible {
    color: var(--brand-600);
    text-decoration: underline;
    outline: 0;
  }

  h3 {
    font-size: var(--text-lg);
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
    overscroll-behavior: contain;
  }

  form {
    display: grid;
    gap: 14px;
  }

  .notice {
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border));
    border-radius: var(--radius-md);
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 6%, white);
    font-size: var(--text-sm);
  }

  .businesses-state {
    margin: 7px 4px 0;
    color: var(--muted);
    font-size: var(--text-xs);
  }

  .businesses-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 7px;
    padding: 9px 10px;
    border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border));
    border-radius: var(--radius-md);
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 6%, white);
    font-size: var(--text-xs);
  }

  .businesses-error button {
    flex: 0 0 auto;
    min-height: 30px;
    padding: 5px 9px;
    border: 1px solid currentColor;
    border-radius: var(--radius-md);
    color: inherit;
    background: transparent;
    font: inherit;
    font-weight: 600;
  }

  .section {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--panel);
  }

  .about-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .field,
  .contract-grid > div {
    min-width: 0;
  }

  .field.full {
    grid-column: 1 / -1;
  }

  .control {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    min-height: 56px;
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

  .control:focus-within {
    border-color: var(--primary);
    box-shadow: none;
  }

  .control-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
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

  input::placeholder,
  textarea::placeholder {
    color: var(--muted);
    opacity: 1;
  }

  .textarea-control {
    min-height: 118px;
    align-items: start;
    padding-block: 12px;
  }

  .textarea-control .control-icon {
    margin-top: 3px;
  }

  textarea {
    min-height: 92px;
    resize: vertical;
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

  .add-task {
    display: inline-flex;
    min-height: 56px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    color: var(--ink-800);
    background: var(--panel);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .add-task:hover {
    background: var(--surface-hover);
  }

  .section-head,
  .task-actions,
  .title-with-icon {
    display: flex;
    align-items: center;
  }

  .section-head {
    justify-content: space-between;
    gap: 12px;
  }

  .title-with-icon {
    gap: 8px;
  }

  .title-with-icon :global(svg) {
    color: var(--muted);
  }

  .task-actions {
    gap: 10px;
  }

  .count {
    display: inline-flex;
    min-width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    padding: 0 9px;
    border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--border));
    border-radius: var(--radius-pill);
    color: var(--brand-700);
    background: var(--brand-50);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .add-task {
    min-height: 38px;
    padding-inline: 13px;
    border-radius: var(--radius-md);
  }

  .task-list {
    display: grid;
    gap: 8px;
  }

  .task-note {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  .task-empty {
    padding: 18px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-xl);
    color: var(--muted);
    background: var(--surface-soft);
    text-align: center;
    font-size: var(--text-sm);
  }

  .task-row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    min-height: 48px;
    align-items: center;
    gap: 9px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--muted);
    background: var(--panel);
  }

  .task-row:focus-within {
    border-color: var(--primary);
    box-shadow: none;
  }

  .task-row input:disabled {
    color: var(--text);
    opacity: 1;
    cursor: default;
    -webkit-text-fill-color: var(--text);
  }

  .contract-section {
    gap: 10px;
    padding: 14px 16px 16px;
  }

  .contract-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 10px;
  }

  .contract-type {
    grid-column: span 4;
  }

  .contract-value,
  .contract-date {
    grid-column: span 3;
  }

  .contract-installments {
    grid-column: span 2;
  }

  .payment-method,
  .payment-terms {
    grid-column: span 6;
  }

  .finance-notes {
    grid-column: 1 / -1;
  }

  .contract-grid.recurring .contract-type,
  .contract-grid.recurring .contract-value,
  .contract-grid.recurring .contract-date {
    grid-column: span 4;
  }

  .prefix-control {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
  }

  .prefix {
    color: var(--muted);
    font-size: var(--text-md);
    font-weight: 600;
  }

  .installments-panel {
    display: grid;
    grid-column: 1 / -1;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--surface-soft);
  }

  .installments-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .installments-head strong {
    color: var(--ink-950);
    font-size: var(--text-md);
    font-weight: 600;
  }

  .installments-head > span {
    flex: 0 0 auto;
    padding: 5px 9px;
    border: 1px solid color-mix(in srgb, var(--primary) 25%, var(--border));
    border-radius: var(--radius-pill);
    color: var(--brand-700);
    background: var(--brand-50);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .installments-alert {
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border));
    border-radius: var(--radius-lg);
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 6%, white);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .installments-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }

  .installments-table {
    width: 100%;
    min-width: 520px;
    border-collapse: collapse;
  }

  .installments-table th,
  .installments-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: middle;
  }

  .installments-table thead th {
    color: var(--muted);
    background: var(--surface-soft);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .installments-table tbody th {
    width: 86px;
    color: var(--ink-950);
    font-size: var(--text-md);
    font-weight: 600;
  }

  .installments-table tbody tr:last-child th,
  .installments-table tbody tr:last-child td {
    border-bottom: 0;
  }

  .installments-table td > input,
  .installment-value {
    width: 100%;
    min-height: 46px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--panel);
  }

  .installments-table td > input {
    padding: 0 12px;
  }

  .installment-value {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 0 12px;
  }

  .installment-value > span {
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .installments-table td > input:focus,
  .installment-value:focus-within {
    border-color: var(--primary);
  }

  .view-mode .installments-table input:disabled {
    color: var(--text);
    opacity: 1;
    cursor: default;
    -webkit-text-fill-color: var(--text);
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 0;
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
    min-width: 136px;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    color: white;
    font: inherit;
    font-size: var(--text-md);
    font-weight: 600;
    line-height: 1.2;
  }

  .primary {
    border: 1px solid var(--primary);
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
  }

  .primary:hover {
    border-color: var(--brand-700);
    background: var(--brand-700);
  }

  .archive {
    border: 1px solid #64748b;
    background: #64748b;
    box-shadow: 0 8px 18px rgba(71, 85, 105, 0.2);
  }

  .archive:hover {
    border-color: #475569;
    background: #475569;
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
    background: #b91c1c;
  }

  .cancel {
    border: 1px solid var(--primary);
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
  }

  .cancel:hover {
    border-color: var(--brand-700);
    background: var(--brand-700);
  }

  .actions button:disabled,
  .actions button:disabled:hover {
    border-color: var(--border);
    color: var(--muted);
    background: var(--surface-soft);
    box-shadow: none;
    cursor: not-allowed;
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

    header {
      padding: 14px 14px 12px;
    }

    .body {
      padding: 12px;
    }

    .section {
      padding: 12px;
      border-radius: var(--radius-lg);
    }

    .about-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .contract-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .contract-grid > div {
      grid-column: auto;
    }

    .contract-grid > .installments-panel {
      grid-column: 1 / -1;
    }

    .section-head {
      align-items: stretch;
      flex-direction: column;
    }

    .task-actions {
      justify-content: space-between;
    }

    .actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
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
    .about-grid,
    .contract-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .field,
    .contract-grid > div {
      grid-column: 1 / -1;
    }

    .installments-head {
      align-items: stretch;
      flex-direction: column;
    }

    .installments-head > span {
      align-self: flex-start;
    }

    .task-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .count {
      align-self: flex-start;
    }

    .add-task {
      width: 100%;
    }
  }
</style>
