"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  loginSchema,
  registerCustomerSchema,
  isSafeReturnTo,
  type LoginInput,
  type RegisterCustomerInput,
} from "@/lib/validations/customer-auth";
import { authenticateCustomer, registerCustomer } from "@/modules/customers/customer-service";
import { createCustomerSession, rotateCustomerSession } from "@/modules/customers/customer-session";

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

/**
 * Cadastro fora do checkout (botão "Cadastrar" do cabeçalho) — mesma
 * `registerCustomer` reaproveitada, só que sem pedido nenhum junto: a conta
 * é criada sozinha, numa transação só para ela.
 */
export async function registerCustomerAction(
  subdomain: string,
  input: RegisterCustomerInput,
  returnTo: string | null
) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return { error: "Loja indisponível no momento." };

  const parsed = registerCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revise os dados." };
  }

  let customer: { id: string };
  try {
    customer = await prisma.$transaction((tx) =>
      registerCustomer(tx, tenant.id, {
        username: parsed.data.username,
        password: parsed.data.password,
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
      })
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Esse @usuário já está em uso nesta loja.", field: "username" as const };
    }
    return { error: "Não foi possível criar sua conta. Tente novamente." };
  }

  await createCustomerSession(tenant.id, subdomain, customer.id);

  const base = `/loja/${subdomain}`;
  redirect(isSafeReturnTo(returnTo, base) ?? `${base}/conta`);
}
