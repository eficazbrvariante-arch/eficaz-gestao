"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { destroyCustomerSession } from "@/modules/customers/customer-session";

/**
 * Logout de cliente — reaproveitado tanto pelo "Sair" de `/conta` quanto pelo
 * "Trocar de conta" do checkout. Revoga a sessão de verdade no servidor
 * (não só troca uma prop de UI) antes de limpar o cookie.
 */
export async function logoutCustomerAction(subdomain: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return;

  await destroyCustomerSession(tenant.id, subdomain);
  revalidatePath(`/loja/${subdomain}`);
}
