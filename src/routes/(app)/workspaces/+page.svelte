<script lang="ts">
  import { parseAvatarProfileUrl } from "$lib/avatar/avatar-options";
  import { isArchivedRecord } from "$lib/entities/storage";
  import type { EntityRecord } from "$lib/entities/types";
  import { observeProjects } from "$lib/projects/client";
  import {
    listAllTasks,
    observeTasks,
    taskToEntityRecord,
  } from "$lib/tasks/client";
  import {
    currentSettings,
    loadSettingsFromServer,
  } from "$lib/settings/client";
  import type { GlobalSelectorItem } from "$lib/ui/GlobalSelector.svelte";
  import { resolveColor, resolveIcon } from "$lib/ui/icon-color";
  import PageHeader from "$lib/ui/PageHeader.svelte";
  import WorkspaceForm, {
    type WorkspaceFormValue,
  } from "$lib/workspaces/WorkspaceForm.svelte";
  import WorkspaceProjectStrip from "$lib/workspaces/WorkspaceProjectStrip.svelte";
  import {
    addWorkspaceCollaborator,
    canDeleteWorkspace,
    canManageWorkspace,
    createWorkspace,
    CURRENT_USER,
    deleteWorkspace,
    loadActiveWorkspaceId,
    loadWorkspaces,
    loadWorkspaceUsers,
    observeWorkspaces,
    PERSONAL_WORKSPACE_ID,
    refreshWorkspaceSnapshot,
    revokeWorkspaceInvitation,
    removeWorkspaceMember,
    setActiveWorkspaceId,
    updateWorkspace,
    updateWorkspaceMemberRole,
    type Workspace,
    type WorkspaceRole,
    type WorkspaceUser,
  } from "$lib/workspaces/workspace-storage";
  import {
    ArrowRightLeft,
    Crown,
    FolderKanban,
    LockKeyhole,
    Pencil,
    Plus,
    Settings2,
    Trash2,
    UserRound,
    UsersRound,
    X,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  const roleLabels: Record<WorkspaceRole, string> = {
    owner: "Proprietário",
    admin: "Administrador",
    member: "Membro",
  };

  let workspaces = $state<Workspace[]>([]);
  let users = $state<WorkspaceUser[]>([]);
  let tasks = $state<EntityRecord[]>([]);
  let tasksRequest: AbortController | undefined;
  let activeId = $state(PERSONAL_WORKSPACE_ID);
  let createOpen = $state(false);
  let editingId = $state<string | null>(null);
  let managedId = $state<string | null>(null);
  let formError = $state("");
  let manageMessage = $state("");
  let confirmingDelete = $state(false);
  let workspaceOrderBy = $state<"active" | "updated" | "name">("active");
  let workspaceShowInactive = $state(true);
  let workspaceShowProjectPreviews = $state(true);
  let workspaceShowCollaborators = $state(true);

  let editingWorkspace = $derived(
    workspaces.find(({ id }) => id === editingId),
  );
  let managedWorkspace = $derived(
    workspaces.find(({ id }) => id === managedId),
  );
  let managedMembers = $derived(
    (managedWorkspace?.members ?? []).map((membership) => ({
      membership,
      user: users.find(({ id }) => id === membership.userId) ?? {
        id: membership.userId,
        username: "",
        name: "Usuário",
        email: "E-mail indisponível",
      },
    })),
  );
  let visibleWorkspaces = $derived.by(() => {
    const visible = workspaceShowInactive
      ? workspaces
      : workspaces.filter((workspace) => isWorkspaceActive(workspace.id));

    return [...visible].sort((left, right) => {
      if (workspaceOrderBy === "name") {
        return left.name.localeCompare(right.name, "pt-BR", {
          sensitivity: "base",
        });
      }
      if (workspaceOrderBy === "updated") {
        return right.updatedAt.localeCompare(left.updatedAt);
      }

      if (left.id === activeId) return -1;
      if (right.id === activeId) return 1;
      return 0;
    });
  });

  function syncWorkspaceState(): void {
    workspaces = loadWorkspaces();
    users = loadWorkspaceUsers();
    activeId = loadActiveWorkspaceId(workspaces);
    if (managedId && !workspaces.some(({ id }) => id === managedId)) {
      managedId = null;
    }
    if (editingId && !workspaces.some(({ id }) => id === editingId)) {
      editingId = null;
    }
  }

  async function refreshTasks(): Promise<void> {
    tasksRequest?.abort();
    const request = new AbortController();
    tasksRequest = request;
    try {
      const serverTasks = await listAllTasks({ signal: request.signal });
      if (!request.signal.aborted) tasks = serverTasks.map(taskToEntityRecord);
    } catch {
      if (!request.signal.aborted) tasks = [];
    }
  }

  function applyWorkspacePreferences(
    settings: ReturnType<typeof currentSettings>,
  ): void {
    workspaceOrderBy = settings.workspaceOrderBy;
    workspaceShowInactive = settings.workspaceShowInactive;
    workspaceShowProjectPreviews = settings.workspaceShowProjectPreviews;
    workspaceShowCollaborators = settings.workspaceShowCollaborators;
  }

  onMount(() => {
    applyWorkspacePreferences(currentSettings());
    void loadSettingsFromServer()
      .then(applyWorkspacePreferences)
      .catch(() => undefined);
    syncWorkspaceState();
    void refreshWorkspaceSnapshot()
      .then(syncWorkspaceState)
      .catch(() => undefined);
    void refreshTasks();
    const stopWorkspaces = observeWorkspaces(() => {
      syncWorkspaceState();
      void refreshTasks();
    });
    const stopTasks = observeTasks(() => void refreshTasks());
    const stopProjects = observeProjects(() => {
      void refreshWorkspaceSnapshot().then(syncWorkspaceState);
    });
    return () => {
      tasksRequest?.abort();
      stopWorkspaces();
      stopTasks();
      stopProjects();
    };
  });

  function normalize(value: string): string {
    return value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim()
      .toLocaleLowerCase("pt-BR");
  }

  function tasksFor(workspaceId: string): EntityRecord[] {
    return tasks.filter(
      (task) => (task.workspaceId ?? PERSONAL_WORKSPACE_ID) === workspaceId,
    );
  }

  function projectsFor(workspace: Workspace): EntityRecord[] {
    return workspace.projectPreviews.map((project) => ({
      id: project.id,
      workspaceId: project.workspaceId,
      nome: project.name,
      negocio: project.businessName,
      status: project.status,
      dataFim: project.endDate ?? "",
      responsavel: project.responsibleNames.join(", "),
      servicos: project.serviceNames.join(", "),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));
  }

  function isTerminal(record: EntityRecord): boolean {
    if (isArchivedRecord(record)) return true;
    const status = normalize(record.status ?? record.tipo ?? "");
    const terminal = new Set([
      "entregue",
      "concluido",
      "concluida",
      "conclusao",
      "finalizado",
      "finalizada",
      "arquivado",
    ]);
    return terminal.has(status);
  }

  function isWorkspaceActive(workspaceId: string): boolean {
    return tasksFor(workspaceId).some((task) => !isTerminal(task));
  }

  function ownerFor(workspace: Workspace): WorkspaceUser {
    return (
      users.find(({ id }) => id === workspace.ownerId) ?? {
        id: workspace.ownerId,
        username: "",
        name: "Proprietário",
        email: "",
      }
    );
  }

  function collaboratorsFor(workspace: Workspace): WorkspaceUser[] {
    const roleOrder: Record<WorkspaceRole, number> = {
      owner: 0,
      admin: 1,
      member: 2,
    };

    return [...workspace.members]
      .sort(
        (left, right) =>
          roleOrder[left.role] - roleOrder[right.role] ||
          left.joinedAt.localeCompare(right.joinedAt),
      )
      .map(
        ({ userId }) =>
          users.find(({ id }) => id === userId) ?? {
            id: userId,
            username: "",
            name: "Usuário",
            email: "",
          },
      );
  }

  function firstName(name: string): string {
    return name.trim().split(/\s+/)[0] || "Usuário";
  }

  function shortName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 2) return parts.join(" ") || "Usuário";

    const connectors = new Set(["da", "das", "de", "do", "dos", "e"]);
    return connectors.has(parts[1].toLocaleLowerCase("pt-BR"))
      ? parts.slice(0, 3).join(" ")
      : parts.slice(0, 2).join(" ");
  }

  function collaboratorNames(collaborators: WorkspaceUser[]): string {
    if (collaborators.length === 1) return shortName(collaborators[0].name);
    if (collaborators.length === 2) {
      return `${firstName(collaborators[0].name)} e ${firstName(collaborators[1].name)}`;
    }
    if (collaborators.length > 2) {
      return `${firstName(collaborators[0].name)} e +${collaborators.length - 1}`;
    }
    return "";
  }

  function initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toLocaleUpperCase("pt-BR");
  }

  function collaboratorAvatarStyle(avatarUrl?: string): string | undefined {
    const avatar = parseAvatarProfileUrl(avatarUrl ?? "");
    return avatar
      ? `--collaborator-avatar-background: ${avatar.avatarColor}`
      : undefined;
  }

  async function useWorkspace(workspace: Workspace): Promise<void> {
    await setActiveWorkspaceId(workspace.id);
    activeId = workspace.id;
    manageMessage = "Workspace selecionado.";
  }

  function openCreate(): void {
    formError = "";
    createOpen = true;
  }

  function openEdit(workspace: Workspace): void {
    formError = "";
    managedId = null;
    editingId = workspace.id;
  }

  function openManagement(workspace: Workspace): void {
    managedId = workspace.id;
    editingId = null;
    confirmingDelete = false;
    manageMessage = "";
  }

  function formInitial(workspace: Workspace): WorkspaceFormValue {
    const selectedPeople: GlobalSelectorItem[] = workspace.members
      .filter(({ userId }) => userId !== workspace.ownerId)
      .flatMap(({ userId }) => {
        const user = users.find(({ id }) => id === userId);
        return user
          ? [
              {
                id: user.id,
                label: `@${user.username}`,
                description: `${user.name} · ${user.email}`,
                email: user.email,
                avatarUrl: user.avatarUrl,
              },
            ]
          : [];
      });
    selectedPeople.push(
      ...workspace.invitations.map((invitation) => ({
        id: `invitation:${invitation.id}`,
        label: invitation.email,
        description: "Convite pendente",
        email: invitation.email,
        pending: true,
      })),
    );
    return {
      name: workspace.kind === "personal" ? "Pessoal" : workspace.name,
      description: workspace.description,
      icon: workspace.icon,
      color: workspace.color,
      people: selectedPeople,
    };
  }

  function emailFromPerson(person: GlobalSelectorItem): string {
    return person.email?.trim() ?? "";
  }

  async function syncMembers(
    workspaceId: string,
    selected: GlobalSelectorItem[],
  ): Promise<void> {
    let workspace = loadWorkspaces().find(({ id }) => id === workspaceId);
    if (!workspace || workspace.kind === "personal") return;
    const selectedEmails = new Set(
      selected.map(emailFromPerson).filter(Boolean).map(normalize),
    );

    for (const membership of workspace.members) {
      if (membership.userId === workspace.ownerId) continue;
      const user = loadWorkspaceUsers().find(
        ({ id }) => id === membership.userId,
      );
      if (user && !selectedEmails.has(normalize(user.email))) {
        await removeWorkspaceMember(workspaceId, membership.userId);
      }
    }

    for (const invitation of workspace.invitations) {
      if (!selectedEmails.has(normalize(invitation.email))) {
        await revokeWorkspaceInvitation(workspaceId, invitation.id);
      }
    }

    workspace = loadWorkspaces().find(({ id }) => id === workspaceId);
    const workspaceUsers = loadWorkspaceUsers();
    const currentEmails = new Set([
      ...(workspace?.members ?? []).flatMap(({ userId }) => {
        const user = workspaceUsers.find(({ id }) => id === userId);
        return user ? [normalize(user.email)] : [];
      }),
      ...(workspace?.invitations ?? []).map(({ email }) => normalize(email)),
    ]);
    for (const person of selected) {
      const email = emailFromPerson(person);
      if (!email || currentEmails.has(normalize(email))) continue;
      await addWorkspaceCollaborator(workspaceId, {
        email,
      });
      currentEmails.add(normalize(email));
    }
  }

  async function submitCreate(value: WorkspaceFormValue): Promise<void> {
    formError = "";
    try {
      const workspace = await createWorkspace(value);
      await syncMembers(workspace.id, value.people);
      await setActiveWorkspaceId(workspace.id);
      createOpen = false;
      syncWorkspaceState();
    } catch (cause) {
      formError =
        cause instanceof Error ? cause.message : "Não foi possível criar.";
    }
  }

  async function submitEdit(value: WorkspaceFormValue): Promise<void> {
    if (!editingWorkspace) return;
    formError = "";
    try {
      await updateWorkspace(editingWorkspace.id, value);
      await syncMembers(editingWorkspace.id, value.people);
      editingId = null;
      syncWorkspaceState();
    } catch (cause) {
      formError =
        cause instanceof Error ? cause.message : "Não foi possível salvar.";
    }
  }

  async function changeRole(
    userId: string,
    role: "admin" | "member",
  ): Promise<void> {
    if (!managedWorkspace) return;
    await updateWorkspaceMemberRole(managedWorkspace.id, userId, role);
    manageMessage = "Permissão atualizada.";
    syncWorkspaceState();
  }

  async function removeMember(userId: string): Promise<void> {
    if (!managedWorkspace) return;
    if (await removeWorkspaceMember(managedWorkspace.id, userId)) {
      manageMessage = "Membro removido.";
      syncWorkspaceState();
    }
  }

  async function cancelInvitation(invitationId: string): Promise<void> {
    if (!managedWorkspace) return;
    await revokeWorkspaceInvitation(managedWorkspace.id, invitationId);
    manageMessage = "Convite cancelado.";
    syncWorkspaceState();
  }

  async function confirmDeleteWorkspace(): Promise<void> {
    if (!managedWorkspace) return;
    const workspaceId = managedWorkspace.id;
    if (!(await deleteWorkspace(workspaceId))) {
      manageMessage = "Este workspace não pode ser excluído.";
      return;
    }
    managedId = null;
    confirmingDelete = false;
    syncWorkspaceState();
  }
</script>

<svelte:head><title>Workspaces · Demanda</title></svelte:head>

<PageHeader eyebrow="Colaboração" title="Workspaces" icon={UsersRound}>
  {#snippet actions()}
    <button class="header-add" type="button" onclick={openCreate}>
      <Plus size={17} />Adicionar workspace
    </button>
  {/snippet}
</PageHeader>

<section class="workspace-list" aria-label="Lista de workspaces">
  {#each visibleWorkspaces as workspace (workspace.id)}
    {@const WorkspaceIcon = resolveIcon(workspace.icon)}
    {@const workspaceColor = resolveColor(workspace.color)}
    {@const workspaceOwner = ownerFor(workspace)}
    {@const collaborators = collaboratorsFor(workspace)}
    <article
      class:current={workspace.id === activeId}
      class:without-projects={!workspaceShowProjectPreviews}
      class="workspace-drawer"
    >
      <div class="workspace-info">
        <div class="workspace-heading">
          <span
            class="workspace-icon"
            style={`--workspace-color:${workspaceColor}`}
          >
            <WorkspaceIcon size={20} strokeWidth={1.9} />
          </span>
          <div>
            <small
              >{workspace.kind === "personal"
                ? "Pessoal"
                : "Colaborativo"}</small
            >
            <h2>{workspace.name}</h2>
          </div>
        </div>

        <dl class="workspace-body">
          <div>
            <dt><Crown size={15} />Proprietário</dt>
            <dd>{workspaceOwner.name}</dd>
          </div>
          <div>
            <dt><FolderKanban size={15} />Projetos</dt>
            <dd>
              {workspace.projectCount}
              {workspace.projectCount === 1 ? " projeto" : " projetos"}
            </dd>
          </div>
        </dl>

        <footer class="workspace-footer">
          {#if workspaceShowCollaborators}
            <div class="workspace-collaborators" aria-label="Colaboradores">
              {#each collaborators.slice(0, 5) as collaborator (collaborator.id)}
                <span
                  class="collaborator-avatar"
                  title={collaborator.name}
                  style={collaboratorAvatarStyle(collaborator.avatarUrl)}
                >
                  {#if collaborator.avatarUrl}
                    <img src={collaborator.avatarUrl} alt={collaborator.name} />
                  {:else}
                    {initials(collaborator.name)}
                  {/if}
                </span>
              {/each}
              {#if collaborators.length > 0}
                <span class="collaborator-names"
                  >{collaboratorNames(collaborators)}</span
                >
              {/if}
            </div>
          {/if}
          <div class="workspace-footer-actions">
            {#if workspace.id !== activeId}
              <button
                type="button"
                title="Usar workspace"
                aria-label={`Usar ${workspace.name}`}
                onclick={() => useWorkspace(workspace)}
                ><ArrowRightLeft size={16} /></button
              >
            {/if}
            <button
              type="button"
              title="Gerenciar workspace"
              aria-label={`Gerenciar ${workspace.name}`}
              onclick={() => openManagement(workspace)}
              ><Settings2 size={16} /></button
            >
          </div>
        </footer>
      </div>

      {#if workspaceShowProjectPreviews}
        <div class="workspace-projects">
          {#if workspace.projectCount > 0}
            <WorkspaceProjectStrip projects={projectsFor(workspace)} />
          {:else}
            <div class="workspace-projects-empty">
              <strong>Sem projetos nesse workspace</strong>
            </div>
          {/if}
        </div>
      {/if}
    </article>
  {/each}

  {#if visibleWorkspaces.length === 0}
    <div class="workspace-empty">
      <strong>Nenhum workspace ativo</strong>
      <p>Ative a exibição de workspaces inativos nas configurações.</p>
    </div>
  {/if}
</section>

{#if createOpen}
  <WorkspaceForm
    title="Novo workspace"
    actionLabel="Criar workspace"
    initialValue={{ icon: "briefcase-business", color: "blue" }}
    error={formError}
    oncancel={() => (createOpen = false)}
    onsave={submitCreate}
  />
{/if}

{#if editingWorkspace}
  <WorkspaceForm
    title="Editar workspace"
    actionLabel="Salvar workspace"
    initialValue={formInitial(editingWorkspace)}
    nameDisabled={editingWorkspace.kind === "personal"}
    peopleDisabled={editingWorkspace.kind === "personal"}
    error={formError}
    oncancel={() => (editingId = null)}
    onsave={submitEdit}
  />
{/if}

{#if managedWorkspace}
  <div
    class="manage-backdrop"
    role="presentation"
    onclick={(event) =>
      event.target === event.currentTarget && (managedId = null)}
  >
    <div
      class="manage-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-title"
    >
      <header>
        <div>
          <small>Gerenciar workspace</small>
          <h2 id="manage-title">{managedWorkspace.name}</h2>
        </div>
        <button
          class="close-button"
          type="button"
          aria-label="Fechar"
          onclick={() => (managedId = null)}
        >
          <X size={18} />
        </button>
      </header>

      <div class="manage-content">
        {#if manageMessage}<p class="manage-message" role="status">
            {manageMessage}
          </p>{/if}

        <div class="manage-actions">
          {#if managedWorkspace.id !== activeId}
            <button
              type="button"
              onclick={() => useWorkspace(managedWorkspace)}
            >
              <ArrowRightLeft size={16} />Usar workspace
            </button>
          {/if}
          {#if canManageWorkspace(managedWorkspace)}
            <button type="button" onclick={() => openEdit(managedWorkspace)}>
              <Pencil size={16} />Editar informações
            </button>
          {/if}
        </div>

        {#if managedWorkspace.kind === "personal"}
          <div class="personal-message">
            <LockKeyhole size={18} />
            <div>
              <strong>Workspace pessoal e permanente</strong>
              <p>Não aceita outros membros e não pode ser excluído.</p>
            </div>
          </div>
        {/if}

        <section class="members-section">
          <div class="section-title">
            <strong>Membros</strong>
            <span
              >{managedWorkspace.members.length +
                managedWorkspace.invitations.length}</span
            >
          </div>
          <div class="member-list">
            {#each managedMembers as { membership, user } (membership.userId)}
              <div class="member-row">
                <span class="member-avatar">
                  {#if user.avatarUrl}<img
                      src={user.avatarUrl}
                      alt={user.name}
                    />{:else}{initials(user.name)}{/if}
                </span>
                <div class="member-copy">
                  <strong
                    >{user.name}{user.id === CURRENT_USER.id
                      ? " (você)"
                      : ""}</strong
                  >
                  <small>{user.email}</small>
                </div>
                {#if membership.role === "owner"}
                  <span class="role owner"
                    ><Crown size={14} />{roleLabels.owner}</span
                  >
                {:else if canManageWorkspace(managedWorkspace)}
                  <select
                    aria-label={`Permissão de ${user.name}`}
                    value={membership.role}
                    onchange={(event) =>
                      changeRole(
                        user.id,
                        event.currentTarget.value as "admin" | "member",
                      )}
                  >
                    <option value="member">Membro</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <button
                    class="remove-button"
                    type="button"
                    aria-label={`Remover ${user.name}`}
                    onclick={() => removeMember(user.id)}
                  >
                    <X size={16} />
                  </button>
                {:else}
                  <span class="role">{roleLabels[membership.role]}</span>
                {/if}
              </div>
            {/each}
            {#each managedWorkspace.invitations as invitation (invitation.id)}
              <div class="member-row">
                <span class="member-avatar"><UserRound size={18} /></span>
                <div class="member-copy">
                  <strong>{invitation.email}</strong>
                  <small>Convite aguardando aceite do usuário</small>
                </div>
                <span class="role">Pendente</span>
                {#if canManageWorkspace(managedWorkspace)}
                  <button
                    class="remove-member"
                    type="button"
                    aria-label={`Cancelar convite para ${invitation.email}`}
                    onclick={() => cancelInvitation(invitation.id)}
                  >
                    <X size={16} />
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </section>

        {#if canDeleteWorkspace(managedWorkspace)}
          <section class="danger-zone">
            <div>
              <strong>Excluir workspace</strong>
              <small>Projetos persistidos no servidor não serão movidos.</small>
            </div>
            {#if confirmingDelete}
              <div class="delete-confirm">
                <button type="button" onclick={() => (confirmingDelete = false)}
                  >Cancelar</button
                >
                <button
                  class="danger"
                  type="button"
                  onclick={confirmDeleteWorkspace}>Excluir</button
                >
              </div>
            {:else}
              <button
                class="danger-outline"
                type="button"
                onclick={() => (confirmingDelete = true)}
              >
                <Trash2 size={16} />Excluir
              </button>
            {/if}
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  button,
  select {
    font: inherit;
  }

  .header-add {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 14px;
    border: 0;
    border-radius: 10px;
    color: white;
    background: var(--brand-600);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.18);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .workspace-list {
    display: grid;
    gap: 12px;
    background: transparent;
  }

  .workspace-drawer {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
    gap: 18px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--surface);
    box-shadow: 0 5px 18px rgba(15, 23, 42, 0.045);
  }

  .workspace-drawer.current {
    border-color: color-mix(in srgb, var(--green-500) 35%, var(--border));
    background: color-mix(in srgb, var(--green-500) 9%, var(--surface));
  }

  .workspace-drawer.without-projects {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-drawer.without-projects .workspace-info {
    min-height: 0;
    padding: 0;
    border: 0;
  }

  .workspace-info {
    display: flex;
    min-width: 0;
    flex-direction: column;
    padding-right: 17px;
    border-right: 1px solid var(--border);
  }

  .workspace-heading {
    display: grid;
    min-width: 0;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }

  .workspace-icon {
    display: grid;
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    place-items: center;
    border: 1px solid
      color-mix(in srgb, var(--workspace-color) 22%, transparent);
    border-radius: 11px;
    color: var(--workspace-color);
    background: color-mix(in srgb, var(--workspace-color) 9%, white);
  }

  .workspace-heading small {
    display: block;
    color: var(--ink-400);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .workspace-heading h2 {
    margin-top: 2px;
    overflow: hidden;
    color: var(--ink-800);
    font-size: var(--text-lg);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workspace-body {
    display: grid;
    gap: 9px;
    margin: 6px 0 4px;
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 12px;
  }

  .workspace-body > div {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
  }

  .workspace-body dt,
  .workspace-body dd {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 7px;
    margin: 0;
    font-size: var(--text-xs);
  }

  .workspace-body dt {
    color: var(--ink-500);
  }

  .workspace-body dd {
    overflow: hidden;
    color: var(--ink-700);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workspace-footer {
    display: flex;
    align-items: center;
    margin-top: auto;
  }

  .workspace-collaborators {
    display: flex;
    min-width: 0;
    align-items: center;
  }

  .workspace-footer-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    padding-left: 10px;
  }

  .workspace-footer-actions button {
    display: grid;
    width: 31px;
    height: 31px;
    place-items: center;
    border: 0;
    border-radius: 9px;
    color: var(--ink-400);
    background: transparent;
  }

  .workspace-footer-actions button:hover {
    color: var(--brand-600);
    background: var(--brand-50);
  }

  .collaborator-avatar {
    display: grid;
    width: 30px;
    height: 30px;
    overflow: hidden;
    place-items: center;
    border: 2px solid white;
    border-radius: 50%;
    color: var(--brand-700);
    background: var(--collaborator-avatar-background, var(--brand-100));
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.01em;
  }

  .collaborator-avatar + .collaborator-avatar {
    margin-left: -8px;
  }

  .collaborator-names {
    min-width: 0;
    overflow: hidden;
    margin-left: 10px;
    color: var(--ink-600);
    font-size: var(--text-xs);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .collaborator-avatar img,
  .member-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .workspace-projects {
    display: flex;
    min-width: 0;
    align-items: stretch;
  }

  .workspace-projects > :global(.project-strip) {
    flex: 1 1 auto;
  }

  .workspace-projects-empty {
    display: grid;
    width: min(100%, 215px);
    min-height: 100%;
    place-items: center;
    padding: 16px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    color: var(--ink-500);
    background: var(--surface-soft);
    font-size: var(--text-xs);
    text-align: center;
  }

  .workspace-projects-empty strong {
    color: var(--ink-700);
    font-size: var(--text-sm);
  }

  .workspace-empty {
    display: grid;
    min-height: 180px;
    place-content: center;
    padding: 24px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-xl);
    color: var(--ink-500);
    background: var(--surface-soft);
    text-align: center;
  }

  .workspace-empty strong {
    color: var(--ink-700);
    font-size: var(--text-sm);
  }

  .workspace-empty p {
    margin-top: 4px;
    font-size: var(--text-xs);
  }

  .manage-backdrop {
    position: fixed;
    z-index: 3200;
    inset: 0;
    display: grid;
    padding: 20px;
    background: rgba(15, 23, 42, 0.48);
    backdrop-filter: blur(3px);
    place-items: center;
  }

  .manage-dialog {
    width: min(700px, 100%);
    max-height: min(88dvh, 820px);
    overflow: hidden auto;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--surface);
    box-shadow: var(--shadow-lg);
  }

  .manage-dialog > header {
    position: sticky;
    z-index: 2;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 17px 18px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .manage-dialog header small {
    color: var(--ink-400);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .manage-dialog header h2 {
    margin-top: 2px;
    color: var(--ink-800);
    font-size: var(--text-lg);
  }

  .close-button,
  .remove-button {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 0;
    border-radius: 9px;
    color: var(--ink-500);
    background: var(--surface-hover);
  }

  .manage-content {
    display: grid;
    gap: 14px;
    padding: 17px 18px;
  }

  .manage-message,
  .personal-message {
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--green-500) 25%, var(--border));
    border-radius: 11px;
    color: #347457;
    background: color-mix(in srgb, var(--green-500) 7%, white);
    font-size: var(--text-xs);
  }

  .manage-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .manage-actions button,
  .danger-outline,
  .danger,
  .delete-confirm button {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 12px;
    border-radius: 9px;
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .manage-actions button {
    border: 1px solid var(--border);
    color: var(--ink-700);
    background: var(--surface);
  }

  .personal-message {
    display: flex;
    gap: 9px;
    color: var(--brand-600);
    background: var(--brand-50);
  }

  .personal-message strong {
    color: var(--ink-700);
  }

  .personal-message p {
    margin-top: 2px;
    color: var(--ink-500);
  }

  .members-section {
    display: grid;
    gap: 9px;
  }

  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-title strong {
    color: var(--ink-700);
    font-size: var(--text-sm);
  }

  .section-title span {
    color: var(--ink-400);
    font-size: var(--text-xs);
  }

  .member-list {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 12px;
  }

  .member-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 9px;
    padding: 9px 10px;
    border-bottom: 1px solid var(--border);
  }

  .member-row:last-child {
    border-bottom: 0;
  }

  .member-avatar {
    display: grid;
    width: 36px;
    height: 36px;
    overflow: hidden;
    place-items: center;
    border-radius: 50%;
    color: var(--brand-700);
    background: var(--brand-50);
    font-size: 10px;
    font-weight: 700;
  }

  .member-copy,
  .member-copy strong,
  .member-copy small {
    display: block;
    min-width: 0;
  }

  .member-copy strong,
  .member-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .member-copy strong {
    color: var(--ink-700);
    font-size: var(--text-xs);
  }

  .member-copy small {
    margin-top: 2px;
    color: var(--ink-400);
    font-size: 10px;
  }

  .member-row select {
    width: 132px;
    min-height: 34px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-700);
    background: var(--surface);
    font-size: var(--text-xs);
  }

  .role {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 8px;
    border-radius: var(--radius-pill);
    color: var(--ink-500);
    background: var(--surface-hover);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .role.owner {
    color: #a56b00;
    background: color-mix(in srgb, var(--amber-500) 12%, white);
  }

  .danger-zone {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px;
    border: 1px solid color-mix(in srgb, var(--red-500) 20%, var(--border));
    border-radius: 11px;
    background: color-mix(in srgb, var(--red-500) 3%, white);
  }

  .danger-zone strong,
  .danger-zone small {
    display: block;
  }

  .danger-zone strong {
    color: var(--ink-700);
    font-size: var(--text-xs);
  }

  .danger-zone small {
    margin-top: 2px;
    color: var(--ink-400);
    font-size: 10px;
  }

  .danger-outline {
    border: 1px solid color-mix(in srgb, var(--red-500) 35%, var(--border));
    color: var(--red-500);
    background: white;
  }

  .danger {
    border: 0;
    color: white;
    background: var(--red-500);
  }

  .delete-confirm {
    display: flex;
    gap: 7px;
  }

  .delete-confirm button:not(.danger) {
    border: 0;
    color: var(--ink-500);
    background: transparent;
  }

  @media (max-width: 1100px) {
    .workspace-drawer {
      grid-template-columns: minmax(200px, 230px) minmax(0, 1fr);
    }
  }

  @media (max-width: 820px) {
    .workspace-drawer {
      grid-template-columns: minmax(0, 1fr);
    }

    .workspace-info {
      min-height: 220px;
      padding: 0 0 14px;
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
  }

  @media (max-width: 580px) {
    .workspace-drawer {
      padding: 12px;
    }

    .manage-backdrop {
      align-items: end;
      padding: 0;
    }

    .manage-dialog {
      max-height: 94dvh;
      border-radius: 20px 20px 0 0;
    }

    .member-row {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .member-row select,
    .member-row .role {
      grid-column: 2;
      width: 100%;
    }

    .remove-button {
      grid-column: 3;
      grid-row: 1;
    }

    .danger-zone {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
