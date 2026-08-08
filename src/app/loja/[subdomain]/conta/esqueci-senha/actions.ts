"use server";

import { getStoreBySubdomain, storeDisplayName, storeOrigin } from "@/modules/catalog/tenant-resolver";
import {
  requestCustomerPasswordResetSchema,
  type RequestCustomerPasswordResetInput,
} from "@/lib/validations/customer-auth";
import { requestCustomerPasswordReset } from "@/modules/customers/customer-service";
import { sendEmail } from "@/lib/email";

export async function requestCustomerPasswordResetAction(
  subdomain: string,
  input: RequestCustomerPasswordResetInput
) {
  const store = await getStoreBySubdomain(subdomain);
  if (!store) return { error: "Loja indisponível no momento." };

  const parsed = requestCustomerPasswordResetSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Informe um e-mail válido." };
  }

  const result = await requestCustomerPasswordReset(store.id, parsed.data.email);
  if (result) {
    const storeName = storeDisplayName(store);
    const resetUrl = `${storeOrigin(store)}/loja/${subdomain}/conta/redefinir-senha/${result.rawToken}`;

    await sendEmail({
      to: result.email,
      subject: `Redefinição de senha — ${storeName}`,
      html: `
        <p>Olá, ${result.name}.</p>
        <p>Recebemos um pedido para redefinir a senha da sua conta em ${storeName}.</p>
        <p><a href="${resetUrl}">Clique aqui para escolher uma nova senha</a>. O link expira em 1 hora.</p>
        <p>Se você não pediu essa redefinição, pode ignorar este e-mail.</p>
      `,
    });
  }

  // Mensagem genérica sempre, para não revelar se o e-mail existe na base.
  return {
    success:
      "Se este e-mail estiver cadastrado, você receberá instruções para redefinir sua senha em instantes.",
  };
}
