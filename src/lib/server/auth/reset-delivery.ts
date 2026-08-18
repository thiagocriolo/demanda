import { getServerEnvironment } from "$lib/server/config/env";
import type { PasswordResetDelivery } from "./service";

let warnedAboutProductionDelivery = false;

export function createPasswordResetUrl(token: string): URL {
  const url = new URL("/redefinir-senha", getServerEnvironment().APP_ORIGIN);
  url.searchParams.set("token", token);
  return url;
}

/**
 * Adaptador local de entrega. Em desenvolvimento, o link aparece apenas no
 * terminal do servidor. A integração transacional com e-mail entra quando o
 * provedor de produção for escolhido, sem alterar o fluxo ou o token salvo.
 */
export async function deliverPasswordReset(
  delivery: PasswordResetDelivery,
): Promise<void> {
  const url = createPasswordResetUrl(delivery.token);

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[auth] Recuperação solicitada para ${delivery.recipient}: ${url.toString()}`,
    );
    return;
  }

  if (!warnedAboutProductionDelivery) {
    warnedAboutProductionDelivery = true;
    console.error(
      "[auth] Provedor de e-mail de recuperação ainda não foi configurado.",
    );
  }
}
