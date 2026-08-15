import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatBRL, formatDateTime } from "@/lib/format";
import { canCancelSale, canViewAllSales } from "@/lib/permissions";
import { storeDisplayHost, storeOrigin } from "@/modules/catalog/tenant-resolver";
import { SaleActions } from "./sale-controls";
import { AutoPrint } from "./auto-print";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT: "Cartão de débito",
  CREDIT: "Cartão de crédito",
  STORE_CREDIT: "Crédito de loja",
  FIADO: "Fiado",
};

export default async function ComprovantePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nova?: string; cancelar?: string }>;
}) {
  const { id } = await params;
  const { nova, cancelar } = await searchParams;
  const user = await requireUser();

  const [sale, tenant] = await Promise.all([
    prisma.sale.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        items: { include: { defects: true } },
        payments: true,
        customer: true,
        seller: { select: { name: true } },
        cancelledBy: { select: { name: true } },
        convenioRedemption: {
          include: { member: { select: { name: true } }, convenio: { select: { name: true } } },
        },
      },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId } }),
  ]);

  if (!sale) notFound();

  const siteHost = storeDisplayHost(tenant);
  // Sem `width`: o SVG sai só com `viewBox`, então o tamanho final (tela e
  // impressão) é controlado por CSS em `.receipt-qr` — mesmo princípio já
  // usado no resto do cupom, escala sem perda por ser vetor.
  const siteQrCode = await QRCode.toString(`${storeOrigin(tenant)}/`, {
    type: "svg",
    margin: 0,
  });

  const isCancelled = sale.status === "CANCELLED";

  const defectItems = sale.items.map((item) => ({
    id: item.id,
    nameSnapshot: item.nameSnapshot,
    remaining: item.quantity - item.defects.reduce((sum, d) => sum + d.quantity, 0),
  }));

  const shouldAutoPrint = nova === "1" && !isCancelled && tenant.autoPrintReceipt;

  return (
    <div>
      <AutoPrint enabled={shouldAutoPrint} />

      {nova === "1" && !isCancelled && (
        <div className="mb-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 print:hidden">
          Venda #{sale.number} registrada com sucesso.
          {Number(sale.changeAmount) > 0 && (
            <strong className="ml-1">Troco: {formatBRL(sale.changeAmount)}</strong>
          )}
        </div>
      )}

      <div className="mb-4 print:hidden">
        <SaleActions
          saleId={sale.id}
          saleTotal={Number(sale.total)}
          existingCustomer={sale.customer ? { id: sale.customer.id, name: sale.customer.name } : null}
          canCancel={canCancelSale(user.role)}
          canViewAllSales={canViewAllSales(user.role)}
          isCancelled={isCancelled}
          openCancelForm={cancelar === "1"}
          items={isCancelled ? [] : defectItems}
        />
      </div>

      {/* Comprovante */}
      <div
        id="recibo"
        className="max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:max-w-none print:border-0 print:shadow-none"
      >
        <div className="mb-4 border-b border-dashed border-slate-300 pb-4 text-center">
          <h2 className="text-base font-semibold text-slate-900">
            {tenant.tradeName || tenant.name}
          </h2>
          {tenant.document && <p className="text-xs text-slate-500">CNPJ {tenant.document}</p>}
          {tenant.addressStreet && (
            <p className="text-xs text-slate-500">
              {tenant.addressStreet}
              {tenant.addressNumber ? `, ${tenant.addressNumber}` : ""}
              {tenant.addressCity ? ` - ${tenant.addressCity}` : ""}
            </p>
          )}
          {tenant.phone && <p className="text-xs text-slate-500">Tel. {tenant.phone}</p>}
          {siteHost && <p className="text-xs text-slate-500">{siteHost}</p>}
          <div
            className="receipt-qr mt-2 flex justify-center"
            dangerouslySetInnerHTML={{ __html: siteQrCode }}
          />
        </div>

        {isCancelled && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 p-2 text-center">
            <p className="text-sm font-semibold text-red-800">VENDA CANCELADA</p>
            <p className="text-xs text-red-700">{sale.cancelReason}</p>
            <p className="mt-1 text-xs text-red-600">
              {sale.cancelledBy?.name}
              {sale.cancelledAt ? ` · ${formatDateTime(sale.cancelledAt)}` : ""}
            </p>
          </div>
        )}

        <div className="mb-4 space-y-0.5 text-xs text-slate-600">
          <div>
            <span>Venda </span>
            <span className="font-medium text-slate-900">#{sale.number}</span>
          </div>
          <div className="flex justify-between">
            <span>Data</span>
            <span>{formatDateTime(sale.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>Vendedor</span>
            <span>{sale.seller.name}</span>
          </div>
        </div>

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
              <th className="py-2 font-medium">Item</th>
              <th className="py-2 text-center font-medium">Qtd</th>
              <th className="py-2 text-right font-medium">Unit.</th>
              <th className="py-2"></th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => {
              const defectQty = item.defects.reduce((sum, d) => sum + d.quantity, 0);
              return (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-900">
                    {item.nameSnapshot}
                    {defectQty > 0 && (
                      <span className="ml-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        Trocado por defeito
                        {defectQty < item.quantity ? ` (${defectQty}/${item.quantity})` : ""}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-center text-slate-600">{item.quantity}</td>
                  <td className="py-1.5 text-right text-slate-600">{formatBRL(item.unitPrice)}</td>
                  <td className="py-1.5"></td>
                  <td className="py-1.5 text-right text-slate-900">{formatBRL(item.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="space-y-1 border-t border-dashed border-slate-300 pt-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{formatBRL(sale.subtotal)}</span>
          </div>
          {Number(sale.discount) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Desconto</span>
              <span>-{formatBRL(sale.discount)}</span>
            </div>
          )}
          {sale.convenioRedemption && Number(sale.convenioDiscount) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>
                Benefício Convênio {sale.convenioRedemption.convenio.name} —{" "}
                {sale.convenioRedemption.member.name}
                {sale.convenioRedemption.reversedAt ? " (revertido)" : ""}
              </span>
              <span>-{formatBRL(sale.convenioDiscount)}</span>
            </div>
          )}
          <div className="receipt-total flex justify-between border-t border-slate-200 pt-1 text-base font-semibold text-slate-900">
            <span>Total</span>
            <span>{formatBRL(sale.total)}</span>
          </div>
        </div>

        <div className="mt-3 space-y-1 border-t border-dashed border-slate-300 pt-3 text-xs text-slate-600">
          {sale.payments.map((payment) => (
            <div key={payment.id} className="flex justify-between">
              <span>{METHOD_LABELS[payment.method] ?? payment.method}</span>
              <span>{formatBRL(payment.amount)}</span>
            </div>
          ))}
          {sale.cashReceived !== null && (
            <>
              <div className="flex justify-between">
                <span>Recebido em dinheiro</span>
                <span>{formatBRL(sale.cashReceived)}</span>
              </div>
              <div className="flex justify-between font-medium text-slate-900">
                <span>Troco</span>
                <span>{formatBRL(sale.changeAmount)}</span>
              </div>
            </>
          )}
        </div>

        {sale.customer && (
          <div className="mt-3 space-y-0.5 border-t border-dashed border-slate-300 pt-3 text-xs text-slate-600">
            <p className="font-medium text-slate-900">{sale.customer.name}</p>
            {sale.customer.document && <p>CPF: {sale.customer.document}</p>}
            {(sale.customer.phone || sale.customer.whatsapp) && (
              <p>Contato: {sale.customer.phone || sale.customer.whatsapp}</p>
            )}
            {sale.customer.notes && <p>Obs.: {sale.customer.notes}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
