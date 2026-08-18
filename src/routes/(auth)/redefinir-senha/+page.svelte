<script lang="ts">
  import {
    ArrowLeft,
    ArrowRight,
    Eye,
    EyeOff,
    LockKeyhole,
    ShieldCheck,
  } from "@lucide/svelte";
  import type { ActionData, PageData } from "./$types";
  import AuthShell from "$lib/auth/AuthShell.svelte";
  import "$lib/auth/auth.css";

  type Props = { data: PageData; form: ActionData };

  let { data, form }: Props = $props();
  let showPassword = $state(false);
  let showConfirmation = $state(false);
</script>

<svelte:head><title>Redefinir senha · Demanda</title></svelte:head>

<AuthShell>
  <div class="auth-card__header">
    <span class="auth-card__icon"><ShieldCheck size={21} /></span>
    <h1>Crie uma nova senha</h1>
    <p>Escolha uma senha segura e exclusiva para proteger sua conta.</p>
  </div>

  {#if form?.message}
    <div
      class:auth-notice--info={form.success}
      class="auth-notice"
      role={form.success ? "status" : "alert"}
    >
      {form.message}
    </div>
  {/if}

  <form class="auth-form" method="POST">
    <input type="hidden" name="token" value={data.token} />

    <label class="auth-field">
      <span>Nova senha</span>
      <span class="auth-control auth-control--password">
        <LockKeyhole size={18} aria-hidden="true" />
        <input
          class="auth-input"
          name="password"
          type={showPassword ? "text" : "password"}
          autocomplete="new-password"
          placeholder="6 a 16 caracteres"
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
    </label>

    <label class="auth-field">
      <span>Confirmar nova senha</span>
      <span class="auth-control auth-control--password">
        <ShieldCheck size={18} aria-hidden="true" />
        <input
          class="auth-input"
          name="passwordConfirmation"
          type={showConfirmation ? "text" : "password"}
          autocomplete="new-password"
          placeholder="digite a senha novamente"
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
          {#if showConfirmation}
            <EyeOff size={18} />
          {:else}
            <Eye size={18} />
          {/if}
        </button>
      </span>
    </label>

    <p class="password-help">
      Use de 6 a 16 caracteres, com maiúscula, minúscula e número. Caracteres
      especiais são permitidos.
    </p>

    <button class="auth-submit" type="submit">
      Redefinir senha <ArrowRight size={17} />
    </button>
    <a class="auth-secondary" href="/login">
      <ArrowLeft size={17} /> Voltar para entrar
    </a>
  </form>
</AuthShell>
