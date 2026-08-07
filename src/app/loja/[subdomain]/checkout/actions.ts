"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createOrder, findDeliveryZone, type OrderCustomerAuth } from "@/modules/orders/order-service";
import { checkoutSchema, type CheckoutSubmission } from "@/lib/validations/order";
import {
  getCustomerSession,
  createCustomerSession,
  rotateCustomerSession,
} from "@/modules/customers/customer-session";
import { authenticateCustomer, isUsernameAvailable } from "@/modules/customers/customer-service";

/**
 * Consulta a taxa de entrega de uma região.
 * Usada pelo checkout para mostrar o valor antes de finalizar — o valor gravado
 * no pedido é recalculado no servidor, então isto é apenas informativo.
 */
export async function quoteDeliveryFeeAction(
  subdomain: string,
  neighborhood: string,
  zip: string,
  subtotal: number
) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return { fee: 0, zoneName: null, estimate: null, found: false, free: false };

  const zone = await findDeliveryZone(tenant.id, neighborhood || undefined, zip || undefined);
  if (!zone) return { fee: 0, zoneName: null, estimate: null, found: false, free: false };

  const freeShippingMin = zone.freeShippingMin ? Number(zone.freeShippingMin) : null;
  const free = freeShippingMin !== null && subtotal >= freeShippingMin;

  return {
    fee: free ? 0 : Number(zone.fee),
    zoneName: zone.name,
    estimate: zone.estimate,
    found: true,
    free,
  };
}

/**
 * Disponibilidade de `@usuário` na aba "Criar conta" — diferente da regra de
 * login (que nunca revela se um usuário existe), aqui é isso mesmo que se
 * quer responder: é assim que o cliente escolhe um handle livre.
 */
export async function checkUsernameAvailableAction(subdomain: string, username: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return { available: false };
  if (!username.trim()) return { available: false };

  return { available: await isUsernameAvailable(tenant.id, username) };
}

export async function submitOrderAction(subdomain: string, input: CheckoutSubmission) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return { error: "Loja indisponível no momento." };

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revise os dados do pedido." };
  }

  // `authMode: "session"` só é aceito se realmente existir uma sessão válida
  // — nunca confia na palavra do cliente sobre já estar logado.
  let auth: OrderCustomerAuth;
  if (parsed.data.auth.authMode === "session") {
    const session = await getCustomerSession(tenant.id);
    if (!session) {
      return { error: "Sua sessão expirou. Atualize a página e entre novamente." };
    }
    auth = { mode: "session", customerId: session.customerId };
  } else if (parsed.data.auth.authMode === "login") {
    const ipAddress = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const authenticated = await authenticateCustomer(
      tenant.id,
      parsed.data.auth.username,
      parsed.data.auth.password,
      ipAddress
    );
    if (!authenticated) {
      return { error: "Usuário ou senha inválidos.", field: "auth.password" as const };
    }
    auth = { mode: "login", customerId: authenticated.customerId };
  } else {
    auth = {
      mode: "register",
      username: parsed.data.auth.username,
      password: parsed.data.auth.password,
    };
  }

  const result = await createOrder(tenant.id, parsed.data, auth);
  if (!result.ok) {
    return {
      error: result.error,
      field: result.field ? (`auth.${result.field}` as const) : undefined,
    };
  }

  // Sessão só é criada/rotacionada DEPOIS do pedido confirmado — nunca antes.
  if (auth.mode === "register") {
    await createCustomerSession(tenant.id, subdomain, result.customerId);
  } else if (auth.mode === "login") {
    await rotateCustomerSession(tenant.id, subdomain, result.customerId);
  }

  revalidatePath("/pedidos");
  revalidatePath("/dashboard");

  return { orderId: result.orderId, number: result.number, publicAccessToken: result.publicAccessToken };
}
