<script lang="ts">
  import { ArrowLeft, ArrowRight, Mail, RotateCcwKey } from "@lucide/svelte";
  import type { ActionData, PageData } from "./$types";
  import AuthShell from "$lib/auth/AuthShell.svelte";
  import "$lib/auth/auth.css";

  type Props = { data: PageData; form: ActionData };

  let { form }: Props = $props();
</script>

<svelte:head><title>Recuperar senha · Demanda</title></svelte:head>

<AuthShell>
  <div class="auth-card__header">
    <span class="auth-card__icon"><RotateCcwKey size={21} /></span>
    <h1>Recupere seu acesso</h1>
    <p>Informe seu e-mail para receber as instruções de redefinição.</p>
  </div>

  {#if form?.message}
    <div class="auth-notice auth-notice--info" role="status">
      {form.message}
    </div>
  {/if}

  <form class="auth-form" method="POST">
    <label class="auth-field">
      <span>E-mail</span>
      <span class="auth-control">
        <Mail size={18} aria-hidden="true" />
        <input
          class="auth-input"
          name="email"
          type="email"
          autocomplete="email"
          placeholder="voce@exemplo.com"
          maxlength="120"
          value={form?.values?.email ?? ""}
          required
        />
      </span>
    </label>

    <p class="password-help">
      Por segurança, a resposta será a mesma exista ou não uma conta com esse
      e-mail.
    </p>

    <button class="auth-submit" type="submit">
      Enviar instruções <ArrowRight size={17} />
    </button>
    <a class="auth-secondary" href="/login">
      <ArrowLeft size={17} /> Voltar para entrar
    </a>
  </form>
</AuthShell>
