"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  resetCustomerPasswordSchema,
  type ResetCustomerPasswordInput,
} from "@/lib/validations/customer-auth";
import { resetCustomerPassword } from "@/modules/customers/customer-service";

export async function resetCustomerPasswordAction(subdomain: string, input: ResetCustomerPasswordInput) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return { error: "Loja indisponível no momento." };

  const parsed = resetCustomerPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const result = await resetCustomerPassword(tenant.id, parsed.data.token, parsed.data.password);
  if (!result.ok) return { error: result.error };

  redirect(`/loja/${subdomain}/conta/entrar`);
}
