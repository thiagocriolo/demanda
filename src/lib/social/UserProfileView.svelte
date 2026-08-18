<script lang="ts">
  import {
    ArrowRight,
    BriefcaseBusiness,
    ImageUp,
    LoaderCircle,
    LockKeyhole,
    Mail,
    MapPin,
    Newspaper,
    Pencil,
    Phone,
    Trash2,
    UserMinus,
    UserPlus,
    X,
  } from "@lucide/svelte";
  import Avatar from "$lib/avatar/Avatar.svelte";
  import PostCard from "./PostCard.svelte";
  import type { SocialPost } from "./types";
  import type { PublicProfileRelationship } from "$lib/server/social/public-profile";

  type Profile = {
    username: string;
    name: string;
    profession: string;
    bio: string;
    email: string;
    phone: string;
    photo: string;
    cover: string;
    avatarImage: string;
    avatarColor: string;
  };

  type TextField =
    "name" | "username" | "profession" | "bio" | "email" | "phone";

  let {
    profile,
    portfolioHref,
    shelled = false,
    editable = false,
    editingField = null,
    onedit = () => undefined,
    onfieldchange = () => undefined,
    oncancel = () => undefined,
    oncoverchange = () => undefined,
    oncoverremove = () => undefined,
    posts = [],
    canViewPosts = false,
    relationship,
    connectionBusy = false,
    connectionError = "",
    onconnect = () => undefined,
    ondisconnect = () => undefined,
  } = $props<{
    profile: Profile;
    portfolioHref: string;
    shelled?: boolean;
    editable?: boolean;
    editingField?: string | null;
    onedit?: (field: string) => void;
    onfieldchange?: (field: TextField, value: string) => void;
    oncancel?: () => void;
    oncoverchange?: (event: Event) => void;
    oncoverremove?: () => void;
    posts?: SocialPost[];
    canViewPosts?: boolean;
    relationship?: PublicProfileRelationship;
    connectionBusy?: boolean;
    connectionError?: string;
    onconnect?: () => void;
    ondisconnect?: () => void;
  }>();

  function editLabel(label: string): string {
    return `Editar ${label}`;
  }

  function editableContent(node: HTMLElement, value: string) {
    node.innerText = value;
    return {
      update(nextValue: string) {
        if (document.activeElement !== node && node.innerText !== nextValue) {
          node.innerText = nextValue;
        }
      },
    };
  }

  function handleEditableKeydown(
    event: KeyboardEvent,
    multiline = false,
  ): void {
    if (event.key === "Escape" || (event.key === "Enter" && !multiline)) {
      event.preventDefault();
      (event.currentTarget as HTMLElement).blur();
    }
  }

  function handleEditableInput(
    field: TextField,
    event: Event,
    maxLength: number,
  ): void {
    const node = event.currentTarget as HTMLElement;
    let value = node.innerText.replace(/\r/g, "");
    if (field !== "bio") value = value.replace(/\n/g, "");
    if (field === "username") value = value.replace(/^@+/, "");
    if (!value.trim()) value = "";
    value = value.slice(0, maxLength);

    if (node.innerText !== value) {
      node.innerText = value;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    onfieldchange(field, value);
  }
</script>

<div class:shelled class="public-page">
  <article class:editable class="profile-card">
    <div
      class:edit-zone={editable}
      class="cover"
      class:has-image={Boolean(profile.cover)}
      style:background-color={profile.avatarColor}
    >
      {#if profile.cover}<img src={profile.cover} alt="" />{/if}
      {#if relationship && relationship !== "anonymous" && relationship !== "self"}
        <div class="connection-action-wrap">
          <button
            class:connection-button--disconnect={relationship === "connected"}
            class="connection-button"
            type="button"
            disabled={connectionBusy || relationship === "outgoing"}
            title={relationship === "incoming"
              ? "Aceitar solicitação de conexão"
              : undefined}
            onclick={relationship === "connected" ? ondisconnect : onconnect}
          >
            {#if connectionBusy}
              <LoaderCircle class="spin" size={17} />Aguarde
            {:else if relationship === "connected"}
              <UserMinus size={17} />Desconectar
            {:else if relationship === "outgoing"}
              <UserPlus size={17} />Solicitação enviada
            {:else}
              <UserPlus size={17} />Conectar
            {/if}
          </button>
          {#if connectionError}
            <span class="connection-error" role="alert">{connectionError}</span>
          {/if}
        </div>
      {/if}
      {#if editable && editingField === "cover"}
        <div
          class="cover-editor"
          role="group"
          aria-label="Editar imagem de capa"
        >
          <label class="cover-action cover-action--primary">
            <ImageUp size={16} />Alterar imagem
            <input
              type="file"
              accept="image/jpeg,image/png"
              onchange={oncoverchange}
            />
          </label>
          {#if profile.cover}
            <button
              class="cover-action cover-action--danger"
              type="button"
              onclick={oncoverremove}
            >
              <Trash2 size={15} />Remover
            </button>
          {/if}
          <button
            class="cover-action cover-action--icon"
            type="button"
            aria-label="Cancelar edição da capa"
            onclick={oncancel}
          >
            <X size={16} />
          </button>
        </div>
      {:else if editable}
        <button
          class="edit-button edit-button--cover"
          type="button"
          aria-label={editLabel("imagem de capa")}
          title={editLabel("imagem de capa")}
          onclick={() => onedit("cover")}><Pencil size={17} /></button
        >
      {/if}
    </div>

    <div class="profile-content">
      <div class:edit-zone={editable} class="avatar-wrap">
        <Avatar
          photo={profile.photo}
          image={profile.avatarImage}
          color={profile.avatarColor}
          alt={`Avatar de ${profile.name}`}
        />
        {#if editable}
          <button
            class="edit-button edit-button--avatar"
            type="button"
            aria-label={editLabel("avatar")}
            title={editLabel("avatar")}
            onclick={() => onedit("avatar")}><Pencil size={16} /></button
          >
        {/if}
      </div>

      <div class="identity-item name-item">
        {#if editable}
          <div
            use:editableContent={profile.name}
            class="name-heading editable-text"
            contenteditable="plaintext-only"
            role="textbox"
            tabindex="0"
            spellcheck="false"
            aria-label="Nome"
            data-placeholder="Seu nome"
            oninput={(event) => handleEditableInput("name", event, 80)}
            onkeydown={(event) => handleEditableKeydown(event)}
          ></div>
        {:else}
          <h1>{profile.name || "Seu nome"}</h1>
        {/if}
      </div>

      <div class="identity-item handle-item">
        {#if editable}
          <div class="handle-line">
            <span class="input-prefix">@</span>
            <span
              use:editableContent={profile.username}
              class="handle editable-text"
              contenteditable="plaintext-only"
              role="textbox"
              tabindex="0"
              spellcheck="false"
              aria-label="Nome de usuário"
              data-placeholder="usuario"
              oninput={(event) => handleEditableInput("username", event, 40)}
              onkeydown={(event) => handleEditableKeydown(event)}
            ></span>
          </div>
        {:else}
          <span class="handle">@{profile.username || "usuario"}</span>
        {/if}
      </div>

      {#if profile.profession || editable}
        <div class="identity-item profession-item">
          <span class="field-label">Profissão</span>
          <div class="profession-value">
            {#if editable}
              <span
                use:editableContent={profile.profession}
                class="profession editable-text"
                contenteditable="plaintext-only"
                role="textbox"
                tabindex="0"
                spellcheck="false"
                aria-label="Profissão"
                data-placeholder="Adicionar profissão"
                oninput={(event) =>
                  handleEditableInput("profession", event, 120)}
                onkeydown={(event) => handleEditableKeydown(event)}
              ></span>
            {:else}
              <span class:placeholder={!profile.profession} class="profession">
                {profile.profession || "Adicionar profissão"}
              </span>
            {/if}
          </div>
        </div>
      {/if}

      <div class="bio-item">
        {#if editable}
          <div
            use:editableContent={profile.bio}
            class="bio editable-text"
            contenteditable="plaintext-only"
            role="textbox"
            tabindex="0"
            spellcheck="false"
            aria-multiline="true"
            aria-label="Apresentação"
            data-placeholder="Este usuário ainda não adicionou uma apresentação."
            oninput={(event) => handleEditableInput("bio", event, 360)}
            onkeydown={(event) => handleEditableKeydown(event, true)}
          ></div>
        {:else}
          <p class:muted={!profile.bio} class="bio">
            {profile.bio ||
              "Este usuário ainda não adicionou uma apresentação."}
          </p>
        {/if}
      </div>

      <div class="details-row">
        <ul class="contact" aria-label="Informações de contato">
          {#if profile.phone || editable}
            <li class:placeholder={!profile.phone}>
              <span class="contact-icon"><Phone size={18} /></span>
              <div class="contact-copy">
                <span class="contact-label">Telefone</span>
                {#if editable}
                  <span
                    use:editableContent={profile.phone}
                    class="contact-value editable-text"
                    contenteditable="plaintext-only"
                    role="textbox"
                    tabindex="0"
                    spellcheck="false"
                    aria-label="Telefone"
                    data-placeholder="Adicionar telefone"
                    oninput={(event) => handleEditableInput("phone", event, 40)}
                    onkeydown={(event) => handleEditableKeydown(event)}
                  ></span>
                {:else}
                  <a class="contact-value" href={`tel:${profile.phone}`}
                    >{profile.phone}</a
                  >
                {/if}
              </div>
            </li>
          {/if}
          {#if profile.email || editable}
            <li class:placeholder={!profile.email}>
              <span class="contact-icon"><Mail size={18} /></span>
              <div class="contact-copy">
                <span class="contact-label">Contato</span>
                {#if editable}
                  <span
                    use:editableContent={profile.email}
                    class="contact-value editable-text"
                    contenteditable="plaintext-only"
                    role="textbox"
                    tabindex="0"
                    spellcheck="false"
                    aria-label="E-mail de contato"
                    data-placeholder="Adicionar e-mail"
                    oninput={(event) =>
                      handleEditableInput("email", event, 120)}
                    onkeydown={(event) => handleEditableKeydown(event)}
                  ></span>
                {:else}
                  <a class="contact-value" href={`mailto:${profile.email}`}
                    >{profile.email}</a
                  >
                {/if}
              </div>
            </li>
          {/if}
          {#if !editable && !profile.phone && !profile.email}
            <li class="empty-contact">
              <MapPin size={17} />Contato não informado
            </li>
          {/if}
        </ul>

        <div class="portfolio-action">
          <a class="portfolio-button" href={portfolioHref}>
            <BriefcaseBusiness size={18} />
            Ver portfólio
            <ArrowRight size={17} />
          </a>
        </div>
      </div>
    </div>
  </article>

  {#if canViewPosts || (relationship && relationship !== "anonymous" && relationship !== "self")}
    <section class="profile-feed" aria-labelledby="profile-feed-title">
      <header class="profile-feed__header">
        <span><Newspaper size={18} /></span>
        <div>
          <h2 id="profile-feed-title">Últimas publicações</h2>
          <p>Publicações recentes feitas no feed.</p>
        </div>
      </header>

      {#if canViewPosts}
        {#if posts.length > 0}
          <div class="profile-feed__posts">
            {#each posts as post (post.id)}
              <PostCard {post} />
            {/each}
          </div>
        {:else}
          <div class="profile-feed__empty">
            <Newspaper size={24} />
            <p>Nenhuma publicação no feed ainda.</p>
          </div>
        {/if}
      {:else}
        <div class="profile-feed__locked">
          <LockKeyhole size={24} />
          <div>
            <strong>Conteúdo para conexões</strong>
            <p>Conecte-se com este usuário para ver suas publicações.</p>
          </div>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .public-page {
    display: grid;
    min-height: 100dvh;
    place-items: center;
    gap: 22px;
    padding: 28px clamp(18px, 4vw, 52px);
    background:
      radial-gradient(
        circle at 10% 5%,
        rgba(46, 86, 255, 0.12),
        transparent 28%
      ),
      radial-gradient(
        circle at 95% 90%,
        rgba(93, 172, 131, 0.13),
        transparent 30%
      ),
      #f7f8fc;
  }
  .public-page.shelled {
    min-height: 0;
    padding: 0;
    background: transparent;
  }
  .profile-card {
    width: min(var(--social-content-width), 100%);
    margin: 0 auto;
    overflow: hidden;
    border: 1px solid rgba(15, 23, 42, 0.09);
    border-radius: 26px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 30px 80px rgba(36, 69, 216, 0.1);
  }
  .cover {
    position: relative;
    height: 190px;
    overflow: hidden;
  }
  .cover:not(.has-image)::after {
    position: absolute;
    width: 290px;
    height: 290px;
    right: -70px;
    top: -145px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    box-shadow: 0 0 0 65px rgba(255, 255, 255, 0.045);
    content: "";
  }
  .cover img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .connection-action-wrap {
    position: absolute;
    z-index: 5;
    top: 18px;
    right: 18px;
    display: grid;
    justify-items: end;
    gap: 7px;
  }
  .connection-button {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 15px;
    border: 1px solid rgba(255, 255, 255, 0.62);
    border-radius: 12px;
    color: var(--brand-700);
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.2);
    font-size: 12px;
    font-weight: 700;
    backdrop-filter: blur(8px);
  }
  .connection-button:hover:not(:disabled) {
    background: white;
    transform: translateY(-1px);
  }
  .connection-button--disconnect {
    color: #b91c1c;
  }
  .connection-button:disabled {
    cursor: default;
    opacity: 0.78;
  }
  .connection-error {
    max-width: 280px;
    padding: 7px 9px;
    border-radius: 9px;
    color: #991b1b;
    background: rgba(255, 247, 247, 0.96);
    box-shadow: 0 7px 20px rgba(15, 23, 42, 0.14);
    font-size: 11px;
  }
  :global(.spin) {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .profile-feed {
    width: min(var(--social-content-width), 100%);
    margin: 0 auto;
    padding: 22px;
    border: 1px solid rgba(15, 23, 42, 0.09);
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 24px 60px rgba(36, 69, 216, 0.08);
  }
  .profile-feed__header {
    display: flex;
    align-items: center;
    gap: 11px;
    margin-bottom: 16px;
  }
  .profile-feed__header > span {
    display: grid;
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 11px;
    color: var(--brand-700);
    background: var(--brand-50);
  }
  .profile-feed__header h2 {
    color: var(--ink-950);
    font-size: 17px;
    line-height: 1.25;
  }
  .profile-feed__header p {
    margin-top: 2px;
    color: var(--ink-400);
    font-size: 11px;
  }
  .profile-feed__posts {
    display: grid;
    gap: 14px;
  }
  .profile-feed__empty,
  .profile-feed__locked {
    display: flex;
    min-height: 112px;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 20px;
    border: 1px dashed var(--border);
    border-radius: 15px;
    color: var(--ink-400);
    background: var(--surface-soft);
    text-align: left;
  }
  .profile-feed__locked strong {
    color: var(--ink-700);
    font-size: 13px;
  }
  .profile-feed__locked p,
  .profile-feed__empty p {
    margin-top: 3px;
    font-size: 12px;
  }
  .profile-content {
    display: grid;
    justify-items: center;
    padding: 0 42px 36px;
    text-align: center;
  }
  .avatar-wrap {
    position: relative;
    z-index: 1;
    width: 136px;
    height: 136px;
    margin-top: -68px;
    overflow: hidden;
    border: 7px solid white;
    border-radius: 50%;
    background: white;
    box-shadow:
      0 0 0 1px rgba(15, 23, 42, 0.1),
      0 15px 30px rgba(15, 23, 42, 0.12);
  }
  .identity-item,
  .bio-item,
  .portfolio-action {
    position: relative;
  }
  .name-item {
    max-width: 720px;
    margin-top: 18px;
  }
  h1,
  .name-heading {
    color: var(--ink-950);
    font-size: clamp(30px, 4vw, 44px);
    font-weight: 700;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }
  .handle-item {
    margin-top: 8px;
  }
  .handle {
    color: var(--brand-600);
    font-size: 13px;
    font-weight: 600;
  }
  .profession-item {
    display: grid;
    justify-items: center;
    gap: 3px;
    margin-top: 12px;
  }
  .field-label,
  .contact-label {
    color: var(--ink-400);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    line-height: 1.2;
    text-transform: uppercase;
  }
  .profession-value {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .profession {
    color: var(--ink-500);
    font-size: 13px;
  }
  .bio-item {
    width: min(680px, 100%);
    margin-top: 20px;
  }
  .bio {
    color: var(--ink-700);
    font-size: 15px;
    line-height: 1.7;
    white-space: pre-wrap;
  }
  .bio.muted,
  .placeholder,
  .profession.placeholder {
    color: var(--ink-400);
  }
  .details-row {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 22px;
  }
  .contact {
    display: contents;
  }
  .contact li {
    position: relative;
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 12px;
    min-height: 62px;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    color: var(--ink-600);
    background: var(--surface-soft);
    font-size: 13px;
  }
  .contact-icon {
    display: grid;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 11px;
    color: var(--brand-600);
    background: white;
    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.07);
  }
  .contact-icon :global(svg) {
    color: var(--brand-600);
  }
  .contact-copy {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 4px;
    text-align: left;
  }
  .contact-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .contact a:hover {
    color: var(--brand-700);
    text-decoration: underline;
  }
  .empty-contact {
    color: var(--ink-400) !important;
  }
  .portfolio-action {
    min-width: 0;
  }
  .portfolio-button {
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 62px;
    align-items: center;
    justify-content: center;
    gap: 9px;
    padding: 0 14px;
    border-radius: 14px;
    color: white;
    background: var(--brand-600);
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 10px 24px rgba(46, 86, 255, 0.23);
  }
  .portfolio-button:hover {
    background: var(--brand-700);
  }
  .portfolio-button :global(svg:last-child) {
    margin-left: 3px;
  }
  .cover-editor {
    position: absolute;
    z-index: 4;
    right: 18px;
    bottom: 18px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px;
    border: 1px solid rgba(255, 255, 255, 0.52);
    border-radius: 13px;
    background: rgba(15, 23, 42, 0.76);
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.2);
    backdrop-filter: blur(8px);
  }
  .cover-action {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 11px;
    border: 0;
    border-radius: 9px;
    color: white;
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
  }
  .cover-action--primary {
    background: var(--brand-600);
  }
  .cover-action--danger {
    background: rgba(220, 38, 38, 0.86);
  }
  .cover-action--icon {
    width: 36px;
    padding: 0;
    background: rgba(255, 255, 255, 0.14);
  }
  .cover-action input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .editable-text {
    min-width: 1ch;
    border: 0;
    outline: 0 !important;
    box-shadow: none !important;
    cursor: text;
  }
  .editable-text:focus,
  .editable-text:focus-visible {
    border: 0;
    outline: 0 !important;
    box-shadow: none !important;
  }
  .editable-text:empty::before {
    color: var(--ink-400);
    content: attr(data-placeholder);
  }
  .handle-line {
    display: inline-flex;
    align-items: baseline;
  }
  .input-prefix {
    color: var(--brand-600);
    font-size: 13px;
    font-weight: 600;
  }
  .edit-button {
    position: absolute;
    z-index: 3;
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: 10px;
    color: white;
    background: rgba(15, 23, 42, 0.76);
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.18);
    opacity: 0;
    transform: translateY(3px);
    transition:
      opacity 140ms ease,
      transform 140ms ease,
      background 140ms ease;
  }
  .edit-button:hover {
    background: var(--brand-600);
  }
  .edit-zone:hover > .edit-button,
  .edit-zone:focus-within > .edit-button,
  .edit-button:focus-visible {
    opacity: 1;
    transform: translateY(0);
  }
  .edit-button--cover {
    right: 18px;
    bottom: 18px;
  }
  .edit-button--avatar {
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    opacity: 1;
    transform: none;
  }
  .edit-button--avatar :global(svg) {
    width: 22px;
    height: 22px;
    opacity: 0;
    filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.35));
    transition: opacity 140ms ease;
  }
  .avatar-wrap:hover > .edit-button--avatar,
  .edit-button--avatar:focus-visible {
    background: rgba(15, 23, 42, 0.42);
  }
  .avatar-wrap:hover > .edit-button--avatar :global(svg),
  .edit-button--avatar:focus-visible :global(svg) {
    opacity: 1;
  }
  @media (hover: none) {
    .editable .edit-button {
      opacity: 1;
      transform: translateY(0);
    }
    .editable .edit-button--avatar :global(svg) {
      opacity: 1;
    }
    .editable .edit-button--avatar {
      background: rgba(15, 23, 42, 0.18);
    }
  }
  @media (max-width: 720px) {
    .public-page {
      padding: 18px 12px;
    }
    .cover {
      height: 160px;
    }
    .connection-action-wrap {
      top: 10px;
      right: 10px;
    }
    .connection-button {
      min-height: 36px;
      padding-inline: 11px;
    }
    .profile-feed {
      padding: 16px 12px;
      border-radius: 18px;
    }
    .profile-content {
      padding: 0 24px 32px;
    }
    .avatar-wrap {
      width: 118px;
      height: 118px;
      margin-top: -59px;
    }
    .name-item {
      margin-top: 17px;
    }
    .details-row {
      gap: 8px;
    }
    .portfolio-button {
      gap: 6px;
      padding-inline: 8px;
      font-size: 11px;
    }
    .contact li {
      gap: 8px;
      padding-inline: 10px;
    }
    .contact-icon {
      width: 32px;
      height: 32px;
    }
    .contact-label {
      font-size: 9px;
    }
    .contact-value {
      font-size: 11px;
    }
    .cover-editor {
      right: 10px;
      bottom: 10px;
      left: 10px;
      justify-content: flex-end;
    }
    .cover-action {
      padding-inline: 9px;
    }
  }
  @media (max-width: 520px) {
    .contact-icon,
    .portfolio-button :global(svg:last-child) {
      display: none;
    }
  }
</style>
