import { put } from "@vercel/blob";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { REPAIR_ORDER_STATUS_LABELS } from "@/lib/validations/repair-order";
import { RepairOrderReceiptDocument, type RepairOrderReceiptData } from "./receipt-pdf";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export type EnsureReceiptResult =
  | { ok: true; blobUrl: string }
  | { ok: false; error: string };

/**
 * Devolve a URL do comprovante em PDF da OS, gerando (e subindo pro blob) só
 * na primeira vez — `receiptPdfUrl` funciona como cache permanente.
 *
 * `tenantId` é opcional: passá-lo restringe a consulta à empresa dona da OS
 * (uso administrativo); a rota pública `/comprovante/[id]` chama sem ele,
 * já que o link é compartilhado com o cliente fora do painel autenticado.
 */
export async function ensureRepairOrderReceiptUrl(
  id: string,
  tenantId?: string
): Promise<EnsureReceiptResult> {
  const existing = await prisma.repairOrder.findFirst({
    where: { id, ...(tenantId ? { tenantId } : {}) },
    select: { id: true, receiptPdfUrl: true },
  });
  if (!existing) return { ok: false, error: "Ordem de serviço não encontrada." };
  if (existing.receiptPdfUrl) return { ok: true, blobUrl: existing.receiptPdfUrl };

  const order = await prisma.repairOrder.findUnique({
    where: { id: existing.id },
    include: {
      tenant: {
        select: {
          name: true,
          tradeName: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          phone: true,
          addressStreet: true,
          addressNumber: true,
          addressCity: true,
          addressState: true,
        },
      },
      customer: { select: { name: true } },
      items: { select: { description: true, unitPrice: true, quantity: true } },
      photos: { select: { url: true }, orderBy: { order: "asc" } },
    },
  });
  if (!order) return { ok: false, error: "Ordem de serviço não encontrada." };

  const subtotal = round2(
    order.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0)
  );
  const discount = Number(order.discount);
  const total = round2(Math.max(0, subtotal - discount));

  const addressParts = [
    order.tenant.addressStreet,
    order.tenant.addressNumber,
    order.tenant.addressCity,
    order.tenant.addressState,
  ].filter(Boolean);

  const data: RepairOrderReceiptData = {
    number: order.number,
    statusLabel: REPAIR_ORDER_STATUS_LABELS[order.status],
    createdAt: formatDate(order.createdAt),
    estimatedAt: order.estimatedAt ? formatDate(order.estimatedAt) : null,
    customerName: order.customer?.name ?? "Cliente não identificado",
    brand: order.brand,
    model: order.model,
    color: order.color,
    reportedDefects: order.reportedDefects,
    condition: order.condition,
    items: order.items.map((item) => ({
      description: item.description,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
    })),
    subtotal,
    discount,
    total,
    photoUrls: order.photos.map((photo) => photo.url),
    tenant: {
      name: order.tenant.tradeName || order.tenant.name,
      logoUrl: order.tenant.logoUrl,
      primaryColor: order.tenant.primaryColor,
      secondaryColor: order.tenant.secondaryColor,
      phone: order.tenant.phone,
      address: addressParts.length > 0 ? addressParts.join(", ") : null,
    },
  };

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(<RepairOrderReceiptDocument order={data} />);
  } catch {
    return { ok: false, error: "Não foi possível gerar o PDF do comprovante." };
  }

  const blob = await put(`comprovantes/${order.tenantId}/${order.id}.pdf`, buffer, {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: false,
  });

  await prisma.repairOrder.update({
    where: { id: order.id },
    data: { receiptPdfUrl: blob.url },
  });

  return { ok: true, blobUrl: blob.url };
}
