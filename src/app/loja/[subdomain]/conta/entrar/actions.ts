"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { loginSchema, isSafeReturnTo, type LoginInput } from "@/lib/validations/customer-auth";
import { authenticateCustomer } from "@/modules/customers/customer-service";
import { rotateCustomerSession } from "@/modules/customers/customer-session";

export async function loginCustomerAction(subdomain: string, input: LoginInput, returnTo: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return { error: "Loja indisponível no momento." };

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };
  }

  const ipAddress = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const authenticated = await authenticateCustomer(
    tenant.id,
    parsed.data.username,
    parsed.data.password,
    ipAddress
  );
  if (!authenticated) {
    return { error: "Usuário ou senha inválidos." };
  }

  await rotateCustomerSession(tenant.id, subdomain, authenticated.customerId);

  const base = `/loja/${subdomain}`;
  redirect(isSafeReturnTo(returnTo, base) ?? `${base}/conta`);
}
