import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatBRL, formatDateTime } from "@/lib/format";
import { canManageRepairOrders } from "@/lib/permissions";
import { REPAIR_ORDER_STATUS_LABELS } from "@/lib/validations/repair-order";
import { getRepairOrderFinancials } from "@/modules/repairs/repair-payment-service";
import { PrintButton } from "./print-button";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT: "Cartão de Débito",
  CREDIT: "Cartão de Crédito",
  STORE_CREDIT: "Crédito de loja",
  FIADO: "Fiado",
};

const SITUATION_LABELS: Record<string, string> = {
  QUITADO: "QUITADO",
  PENDENTE: "SALDO PENDENTE",
  SEM_COBRANCA: "SEM COBRANÇA",
};

export default async function CupomOrdemServicoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { id } = await params;
  const { tipo } = await searchParams;
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar a assistência técnica.
      </div>
    );
  }

  const [order, tenant] = await Promise.all([
    prisma.repairOrder.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        customer: { select: { name: true, document: true, phone: true, whatsapp: true } },
        items: { select: { description: true, unitPrice: true, quantity: true } },
        deliveredBy: { select: { name: true } },
      },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } }),
  ]);
  if (!order) notFound();

  const isEntrega = tipo === "entrega";
  const financials = await getRepairOrderFinancials(user.tenantId, id);

  const receiptOrigin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const qrCode = await QRCode.toString(`${receiptOrigin}/comprovante/${id}`, {
    type: "svg",
    margin: 0,
  }).catch(() => null);

  const osLabel = `#${String(order.number).padStart(6, "0")}`;
  const deviceLine = [order.brand, order.model].filter(Boolean).join(" ");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-sm text-slate-500">
          Comprovante de {isEntrega ? "entrega" : "entrada"} — OS {osLabel}
        </p>
        <PrintButton />
      </div>

      <div
        id="recibo"
        className="thermal-recibo max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:max-w-none print:border-0 print:shadow-none"
      >
        <div className="mb-4 border-b border-dashed border-slate-300 pb-4 text-center">
          <h2 className="text-base font-semibold text-slate-900">{tenant.tradeName || tenant.name}</h2>
          {tenant.document && <p className="text-xs text-slate-500">CNPJ {tenant.document}</p>}
          {tenant.phone && <p className="text-xs text-slate-500">Tel. {tenant.phone}</p>}
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Ordem de Serviço {osLabel} — {isEntrega ? "Comprovante de entrega" : "Comprovante de entrada"}
          </p>
          <p className="text-xs text-slate-500">{formatDateTime(order.createdAt)}</p>
          {qrCode && (
            <div className="receipt-qr mt-2 flex justify-center" dangerouslySetInnerHTML={{ __html: qrCode }} />
          )}
        </div>

        <div className="mb-4 space-y-0.5 text-xs text-slate-600">
          <div className="flex justify-between">
            <span>Cliente</span>
            <span className="font-medium text-slate-900">{order.customer?.name ?? "Não identificado"}</span>
          </div>
          {(order.customer?.phone || order.customer?.whatsapp) && (
            <div className="flex justify-between">
              <span>Contato</span>
              <span>{order.customer?.phone || order.customer?.whatsapp}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Aparelho</span>
            <span>{deviceLine || "—"}</span>
          </div>
          {order.color && (
            <div className="flex justify-between">
              <span>Cor</span>
              <span>{order.color}</span>
            </div>
          )}
          {order.imei && (
            <div className="flex justify-between">
              <span>IMEI/série</span>
              <span>{order.imei}</span>
            </div>
          )}
        </div>

        {!isEntrega && order.reportedDefects && (
          <div className="mb-3 border-t border-dashed border-slate-300 pt-3 text-xs text-slate-600">
            <p className="mb-1 font-medium text-slate-900">Defeito / relato do cliente</p>
            <p>{order.reportedDefects}</p>
          </div>
        )}

        {!isEntrega && order.condition && (
          <div className="mb-3 border-t border-dashed border-slate-300 pt-3 text-xs text-slate-600">
            <p className="mb-1 font-medium text-slate-900">Condição / observações</p>
            <p>{order.condition}</p>
          </div>
        )}

        {order.items.length > 0 && (
          <table className="mb-4 w-full border-t border-dashed border-slate-300 pt-2 text-xs">
            <colgroup>
              <col className="col-item" />
              <col className="col-qty" />
              <col className="col-unit" />
              <col className="col-gap" />
              <col className="col-total" />
            </colgroup>
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 font-medium">{isEntrega ? "Serviço realizado" : "Serviço / orçamento"}</th>
                <th className="py-2 text-center font-medium">Qtd</th>
                <th className="py-2 text-right font-medium">Unit.</th>
                <th className="py-2"></th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={index} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-900">{item.description}</td>
                  <td className="py-1.5 text-center text-slate-600">{item.quantity}</td>
                  <td className="py-1.5 text-right text-slate-600">{formatBRL(item.unitPrice)}</td>
                  <td className="py-1.5"></td>
                  <td className="py-1.5 text-right text-slate-900">
                    {formatBRL(Number(item.unitPrice) * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {financials && (
          <div className="space-y-1 border-t border-dashed border-slate-300 pt-3 text-sm">
            <div className="receipt-total flex justify-between font-semibold text-slate-900">
              <span>Total da OS</span>
              <span>{formatBRL(financials.total)}</span>
            </div>

            {isEntrega && financials.payments.length > 0 && (
              <div className="mt-2 space-y-0.5 border-t border-dashed border-slate-300 pt-2 text-xs text-slate-600">
                <p className="mb-1 font-medium text-slate-900">Pagamentos</p>
                {financials.payments.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <span>{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
                    <span>{formatBRL(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between text-xs text-slate-600">
              <span>Total recebido</span>
              <span>{formatBRL(financials.paid)}</span>
            </div>
            <div className="flex justify-between text-xs font-medium text-slate-900">
              <span>Saldo</span>
              <span>{formatBRL(financials.balance)}</span>
            </div>
            <p className="pt-1 text-center text-xs font-semibold text-slate-900">
              SITUAÇÃO: {SITUATION_LABELS[financials.situation]}
            </p>
          </div>
        )}

        <div className="mt-3 space-y-0.5 border-t border-dashed border-slate-300 pt-3 text-xs text-slate-600">
          {isEntrega ? (
            <>
              <div className="flex justify-between">
                <span>Entregue em</span>
                <span>{order.pickedUpAt ? formatDateTime(order.pickedUpAt) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>Atendente</span>
                <span>{order.deliveredBy?.name ?? "—"}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span>Status</span>
              <span>{REPAIR_ORDER_STATUS_LABELS[order.status]}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
