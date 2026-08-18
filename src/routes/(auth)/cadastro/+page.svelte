<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ActionData, PageData } from "./$types";
  import {
    ArrowRight,
    Eye,
    EyeOff,
    LockKeyhole,
    Mail,
    ShieldCheck,
    UserPlus,
    UserRound,
  } from "@lucide/svelte";
  import AuthShell from "$lib/auth/AuthShell.svelte";
  import "$lib/auth/auth.css";

  type Props = { data: PageData; form: ActionData };

  let { data, form }: Props = $props();
  let showPassword = $state(false);
  let showConfirmation = $state(false);
</script>

<svelte:head><title>Criar conta · Demanda</title></svelte:head>

<AuthShell compact brandFooter>
  <div class="auth-card__header">
    <div class="auth-card__title-row">
      <span class="auth-card__icon"><UserPlus size={21} /></span>
      <h1>Cadastro</h1>
    </div>
  </div>

  {#if form?.message}
    <div class="auth-notice" role="alert">{form.message}</div>
  {/if}

  <form class="auth-form" method="POST" use:enhance>
    <input
      type="hidden"
      name="avatarImage"
      value={data.generatedAvatar.avatarImage}
    />
    <input
      type="hidden"
      name="avatarColor"
      value={data.generatedAvatar.avatarColor}
    />
    <div class="auth-field">
      <span class="auth-control">
        <UserRound size={18} aria-hidden="true" />
        <input
          class="auth-input"
          name="username"
          autocomplete="username"
          placeholder="seu.usuario"
          aria-label="Nome de usuário"
          maxlength="40"
          value={form?.values?.username ?? ""}
          required
        />
      </span>
    </div>

    <div class="auth-field">
      <span class="auth-control">
        <Mail size={18} aria-hidden="true" />
        <input
          class="auth-input"
          name="email"
          type="email"
          autocomplete="email"
          placeholder="voce@exemplo.com"
          aria-label="E-mail"
          maxlength="320"
          value={form?.values?.email ?? data.invitedEmail}
          required
        />
      </span>
    </div>

    <div class="auth-field">
      <span class="auth-control auth-control--password">
        <LockKeyhole size={18} aria-hidden="true" />
        <input
          class="auth-input"
          name="password"
          type={showPassword ? "text" : "password"}
          autocomplete="new-password"
          placeholder="6 a 16 caracteres"
          aria-label="Senha"
          minlength="6"
          maxlength="16"
          required
        />
        <button
          class="password-toggle"
          type="button"
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={showPassword}
          onclick={() => (showPassword = !showPassword)}
        >
          {#if showPassword}<EyeOff size={18} />{:else}<Eye size={18} />{/if}
        </button>
      </span>
    </div>

    <div class="auth-field">
      <span class="auth-control auth-control--password">
        <ShieldCheck size={18} aria-hidden="true" />
        <input
          class="auth-input"
          name="passwordConfirmation"
          type={showConfirmation ? "text" : "password"}
          autocomplete="new-password"
          placeholder="digite a senha novamente"
          aria-label="Confirmar senha"
          minlength="6"
          maxlength="16"
          required
        />
        <button
          class="password-toggle"
          type="button"
          aria-label={showConfirmation
            ? "Ocultar confirmação"
            : "Mostrar confirmação"}
          aria-pressed={showConfirmation}
          onclick={() => (showConfirmation = !showConfirmation)}
        >
          {#if showConfirmation}<EyeOff size={18} />{:else}<Eye
              size={18}
            />{/if}
        </button>
      </span>
    </div>

    <button class="auth-submit" type="submit"
      >Criar conta <ArrowRight size={17} /></button
    >
  </form>

  <p class="auth-footer">Já possui uma conta? <a href="/login">Entrar</a></p>
</AuthShell>
