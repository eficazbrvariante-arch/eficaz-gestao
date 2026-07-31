"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createOrder, findDeliveryZone } from "@/modules/orders/order-service";
import { checkoutSchema, type CheckoutInput } from "@/lib/validations/order";

/**
 * Consulta a taxa de entrega de uma região.
 * Usada pelo checkout para mostrar o valor antes de finalizar — o valor gravado
 * no pedido é recalculado no servidor, então isto é apenas informativo.
 */
export async function quoteDeliveryFeeAction(
  subdomain: string,
  neighborhood: string,
  zip: string
) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return { fee: 0, zoneName: null, estimate: null, found: false };

  const zone = await findDeliveryZone(tenant.id, neighborhood || undefined, zip || undefined);
  if (!zone) return { fee: 0, zoneName: null, estimate: null, found: false };

  return {
    fee: Number(zone.fee),
    zoneName: zone.name,
    estimate: zone.estimate,
    found: true,
  };
}

export async function submitOrderAction(subdomain: string, input: CheckoutInput) {
  const tenant = await prisma.tenant.findFirst({
    where: { subdomain: subdomain.toLowerCase(), catalogEnabled: true },
    select: { id: true },
  });
  if (!tenant) return { error: "Loja indisponível no momento." };

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revise os dados do pedido." };
  }

  const result = await createOrder(tenant.id, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath("/pedidos");
  revalidatePath("/dashboard");

  return { orderId: result.orderId, number: result.number };
}
