import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canManageRepairOrders } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import {
  RepairOrderWorkspace,
  type RepairOrderDefaults,
  type RepairOrderMeta,
} from "../repair-order-workspace";

export default async function OrdemServicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar a assistência técnica.
      </div>
    );
  }

  const order = await prisma.repairOrder.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      customer: { select: { id: true, name: true, document: true, phone: true } },
      items: { select: { description: true, unitPrice: true, quantity: true } },
      photos: { select: { url: true }, orderBy: { order: "asc" } },
      events: {
        select: { id: true, message: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order) notFound();

  const defaults: RepairOrderDefaults = {
    customer: order.customer
      ? {
          id: order.customer.id,
          name: order.customer.name,
          document: order.customer.document,
          phone: order.customer.phone,
        }
      : null,
    brand: order.brand,
    model: order.model,
    color: order.color ?? "",
    imei: order.imei ?? "",
    passcode: order.passcode ?? "",
    turnsOn: order.turnsOn,
    condition: order.condition ?? "",
    reportedDefects: order.reportedDefects ?? "",
    internalNotes: order.internalNotes ?? "",
    estimatedAt: order.estimatedAt ? order.estimatedAt.toISOString().slice(0, 10) : "",
    discount: Number(order.discount),
    items: order.items.map((item) => ({
      description: item.description,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
    })),
    photoUrls: order.photos.map((photo) => photo.url),
  };

  const meta: RepairOrderMeta = {
    id: order.id,
    number: order.number,
    status: order.status,
    createdAt: formatDateTime(order.createdAt),
    updatedAt: formatDateTime(order.updatedAt),
    pickedUpAt: order.pickedUpAt ? formatDateTime(order.pickedUpAt) : null,
    events: order.events.map((event) => ({
      id: event.id,
      message: event.message,
      createdAt: formatDateTime(event.createdAt),
    })),
  };

  return <RepairOrderWorkspace defaults={defaults} meta={meta} />;
}
