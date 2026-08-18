import type { Actions, PageServerLoad } from "./$types";
import { deliverPasswordReset } from "$lib/server/auth/reset-delivery";
import { issuePasswordReset } from "$lib/server/auth/service";
import { passwordResetRequestSchema } from "$lib/server/auth/validation";
import { getDatabase } from "$lib/server/db";

const PUBLIC_MESSAGE =
  "Se houver uma conta com esse e-mail, as instruções de recuperação serão enviadas.";
const MINIMUM_RESPONSE_TIME_MS = 400;

async function waitForUniformResponse(startedAt: number): Promise<void> {
  const remaining = MINIMUM_RESPONSE_TIME_MS - (performance.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

export const load: PageServerLoad = () => ({});

export const actions: Actions = {
  default: async ({ request }) => {
    const startedAt = performance.now();
    const formData = await request.formData();
    const submittedEmail = String(formData.get("email") ?? "");
    const parsed = passwordResetRequestSchema.safeParse({
      email: submittedEmail,
    });

    if (parsed.success) {
      const delivery = await issuePasswordReset(
        getDatabase(),
        parsed.data.email,
      );
      if (delivery) await deliverPasswordReset(delivery);
    }

    await waitForUniformResponse(startedAt);
    return {
      message: PUBLIC_MESSAGE,
      values: { email: submittedEmail },
    };
  },
};
