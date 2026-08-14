import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  canEnterRepairOrderCostOnCreate,
  canGrantRepairOrderCourtesy,
  canManageFiado,
  canManageRepairOrderCostAnytime,
  canManageRepairOrders,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { getRepairOrderFinancials } from "@/modules/repairs/repair-payment-service";
import {
  RepairOrderWorkspace,
  type RepairOrderDefaults,
  type RepairOrderFinancialsView,
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
      customer: {
        select: { id: true, name: true, document: true, phone: true, creditBalance: true },
      },
      seller: { select: { id: true, name: true } },
      items: { select: { description: true, unitPrice: true, quantity: true } },
      photos: { select: { url: true }, orderBy: { order: "asc" } },
      events: {
        select: { id: true, message: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order) notFound();

  const financialsRaw = await getRepairOrderFinancials(user.tenantId, id);
  const financials: RepairOrderFinancialsView | null = financialsRaw && {
    total: financialsRaw.total,
    paid: financialsRaw.paid,
    balance: financialsRaw.balance,
    situation: financialsRaw.situation,
    payments: financialsRaw.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: p.amount,
      createdAt: formatDateTime(p.createdAt),
      createdByName: p.createdByName,
    })),
  };

  // Gerente só vê/edita o custo enquanto ninguém tiver salvo um valor nesta OS
  // ainda; depois disso é só do administrador — em qualquer OS, não importa
  // quem a criou.
  const canEditCost =
    canManageRepairOrderCostAnytime(user.role) ||
    (canEnterRepairOrderCostOnCreate(user.role) && order.costPrice === null);
  const canViewProfit = canManageRepairOrderCostAnytime(user.role);

  const defaults: RepairOrderDefaults = {
    customer: order.customer
      ? {
          id: order.customer.id,
          name: order.customer.name,
          document: order.customer.document,
          phone: order.customer.phone,
          creditBalance: Number(order.customer.creditBalance),
        }
      : null,
    seller: order.seller,
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
    // Só entra no payload enviado ao cliente quando o papel pode mesmo ver o
    // custo desta OS — nunca em texto/props para quem não pode.
    costPrice: canEditCost && order.costPrice !== null ? Number(order.costPrice) : null,
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

  return (
    <RepairOrderWorkspace
      defaults={defaults}
      meta={meta}
      canEditCost={canEditCost}
      canViewProfit={canViewProfit}
      financials={financials}
      canFiado={canManageFiado(user.role)}
      canGrantCourtesy={canGrantRepairOrderCourtesy(user.role)}
    />
  );
}
