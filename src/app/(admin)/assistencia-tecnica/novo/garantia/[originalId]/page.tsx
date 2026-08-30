import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import {
  canCancelRepairOrderWithoutBilling,
  canEnterRepairOrderCostOnCreate,
  canGrantRepairOrderCourtesy,
  canManageFiado,
  canManageRepairOrderCostAnytime,
  canManageRepairOrders,
} from "@/lib/permissions";
import { RepairOrderWorkspace, type RepairOrderDefaults } from "../../../repair-order-workspace";

export default async function NovaGarantiaPage({
  params,
}: {
  params: Promise<{ originalId: string }>;
}) {
  const { originalId } = await params;
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar a assistência técnica.
      </div>
    );
  }

  const original = await prisma.repairOrder.findFirst({
    where: { id: originalId, tenantId: user.tenantId, status: "DELIVERED" },
    select: {
      number: true,
      pickedUpAt: true,
      customer: {
        select: {
          id: true,
          name: true,
          document: true,
          phone: true,
          creditBalance: true,
          creditoEficazAvailableAmount: true,
          creditoEficazBlocked: true,
        },
      },
      seller: { select: { id: true, name: true } },
      brand: true,
      model: true,
      color: true,
      imei: true,
      passcode: true,
      turnsOn: true,
      items: { select: { description: true, unitPrice: true, quantity: true } },
    },
  });
  // Também barra uma OS que não existe, é de outro tenant, ou ainda não foi
  // entregue — garantia só faz sentido depois que o aparelho já voltou pro cliente.
  if (!original) notFound();

  // Serviços da OS original entram já zerados — só a descrição vem pronta,
  // pra não digitar tudo de novo; o valor é ajustado à mão se for cobrar algo
  // fora da garantia (peça nova, defeito diferente).
  const defaults: RepairOrderDefaults = {
    customer: original.customer
      ? {
          id: original.customer.id,
          name: original.customer.name,
          document: original.customer.document,
          phone: original.customer.phone,
          creditBalance: Number(original.customer.creditBalance),
          creditoEficazAvailableAmount: Number(original.customer.creditoEficazAvailableAmount),
          creditoEficazBlocked: original.customer.creditoEficazBlocked,
        }
      : null,
    seller: original.seller,
    brand: original.brand,
    model: original.model,
    color: original.color ?? "",
    imei: original.imei ?? "",
    passcode: original.passcode ?? "",
    turnsOn: original.turnsOn,
    condition: "",
    reportedDefects: "",
    internalNotes: "",
    estimatedAt: "",
    discount: 0,
    costPrice: null,
    items: original.items.map((item) => ({
      description: item.description,
      unitPrice: 0,
      quantity: item.quantity,
    })),
    photoUrls: [],
  };

  return (
    <RepairOrderWorkspace
      defaults={defaults}
      canEditCost={canEnterRepairOrderCostOnCreate(user.role)}
      canViewProfit={canManageRepairOrderCostAnytime(user.role)}
      financials={null}
      canFiado={canManageFiado(user.role)}
      canGrantCourtesy={canGrantRepairOrderCourtesy(user.role)}
      canCancelWithoutBilling={canCancelRepairOrderWithoutBilling(user.role)}
      warrantyOriginal={{
        id: originalId,
        number: original.number,
        deliveredAt: original.pickedUpAt ? formatDateTime(original.pickedUpAt) : null,
      }}
    />
  );
}
