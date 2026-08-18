import { getServerEnvironment } from "$lib/server/config/env";

let warnedAboutProductionDelivery = false;

export function createWorkspaceInvitationUrl(email: string): URL {
  const url = new URL("/cadastro", getServerEnvironment().APP_ORIGIN);
  url.searchParams.set("email", email);
  return url;
}

/** Adaptador local; o provedor transacional será conectado na hospedagem. */
export async function deliverWorkspaceInvitation(email: string): Promise<void> {
  const url = createWorkspaceInvitationUrl(email);
  if (process.env.NODE_ENV !== "production") {
    console.info(`[workspace] Convite criado para ${email}: ${url.toString()}`);
    return;
  }
  if (!warnedAboutProductionDelivery) {
    warnedAboutProductionDelivery = true;
    console.error(
      "[workspace] Provedor de e-mail de convites ainda não foi configurado.",
    );
  }
}
