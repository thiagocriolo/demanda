<script lang="ts">
  import type { ActionData, PageData } from "./$types";
  import {
    ArrowRight,
    Eye,
    EyeOff,
    LockKeyhole,
    LogIn,
    UserRound,
  } from "@lucide/svelte";
  import AuthShell from "$lib/auth/AuthShell.svelte";
  import "$lib/auth/auth.css";

  type Props = { data: PageData; form: ActionData };

  let { form }: Props = $props();
  let showPassword = $state(false);
</script>

<svelte:head><title>Entrar · Demanda</title></svelte:head>

<AuthShell brandFooter>
  <div class="auth-card__header">
    <div class="auth-card__title-row">
      <span class="auth-card__icon"><LogIn size={21} /></span>
      <h1>Login</h1>
    </div>
  </div>

  {#if form?.message}
    <div class="auth-notice" role="alert">{form.message}</div>
  {/if}

  <form class="auth-form" method="POST">
    <div class="auth-field">
      <span class="auth-control">
        <UserRound size={18} aria-hidden="true" />
        <input
          class="auth-input"
          name="identifier"
          autocomplete="username"
          placeholder="seu usuário ou e-mail"
          aria-label="Usuário ou e-mail"
          value={form?.values?.identifier ?? ""}
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
          autocomplete="current-password"
          placeholder="sua senha"
          aria-label="Senha"
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

    <div class="auth-options">
      <label class="remember-option">
        <input
          type="checkbox"
          name="remember"
          value="true"
          checked={form?.values?.remember ?? true}
        />
        <span class="remember-switch" aria-hidden="true"></span>
        <span>Lembrar acesso</span>
      </label>
      <a class="auth-text-link" href="/esqueci-senha">Esqueci minha senha</a>
    </div>

    <button class="auth-submit" type="submit"
      >Entrar <ArrowRight size={17} /></button
    >
    <div class="auth-divider">ou</div>
    <a class="auth-secondary" href="/cadastro">Criar uma conta</a>
  </form>
</AuthShell>
