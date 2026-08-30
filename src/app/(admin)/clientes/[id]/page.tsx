import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canManageFiado, canManageCreditoEficaz, canMergeCustomers } from "@/lib/permissions";
import { formatBRL, formatDateTime } from "@/lib/format";
import { listFiadoEntriesByCustomer, isFiadoOverdue } from "@/modules/fiado/fiado-service";
import { CustomerForm } from "../customer-form";
import { ResetCustomerPasswordPanel } from "../reset-password-panel";
import { FiadoPanel } from "../fiado-panel";
import { MergeCustomerPanel } from "../merge-customer-panel";
import { CreditoEficazPanel } from "../credito-eficaz-panel";
import { getCustomerCreditSummary, listCustomerUsages } from "@/modules/credito-eficaz/credito-eficaz-service";

export default async function FichaClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const customer = await prisma.customer.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      sales: {
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      creditMovements: {
        include: { sale: { select: { number: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!customer) notFound();

  const showFiado = canManageFiado(user.role);
  const showMerge = canMergeCustomers(user.role);
  const canSeeCreditoEficaz = canManageCreditoEficaz(user.role);
  const fiadoEntries = showFiado ? await listFiadoEntriesByCustomer(user.tenantId, customer.id) : [];

  const creditoEficazSummary = canSeeCreditoEficaz
    ? await getCustomerCreditSummary(user.tenantId, customer.id)
    : null;
  const showCreditoEficaz = !!creditoEficazSummary && creditoEficazSummary.limitAmount > 0;
  const creditoEficazUsages = showCreditoEficaz
    ? (await listCustomerUsages(user.tenantId, customer.id)).map((usage) => ({
        id: usage.id,
        saleId: usage.saleId,
        amount: Number(usage.amount),
        status: usage.status,
        dueDate: usage.dueDate,
        createdAt: usage.createdAt,
        saleNumber: usage.sale?.number ?? null,
        paidAmount: usage.payments.reduce((sum, p) => sum + Number(p.amount), 0),
        paymentDates: usage.payments.map((p) => p.paidAt),
        installmentNumber: usage.installmentNumber,
        installmentCount: usage.installmentCount,
        repairOrderNumber: usage.financing?.repairOrder.number ?? null,
      }))
    : [];
  const fiadoRows = fiadoEntries.map((entry) => ({
    id: entry.id,
    amount: Number(entry.amount),
    status: entry.status,
    overdue: isFiadoOverdue(entry),
    dueDate: entry.dueDate,
    note: entry.note,
    createdAt: entry.createdAt,
    saleId: entry.saleId,
    saleNumber: entry.sale?.number ?? null,
  }));

  const CREDIT_MOVEMENT_LABELS: Record<string, string> = {
    GRANTED: "Crédito gerado",
    REDEEMED: "Usado em compra",
    ADJUSTED_ADD: "Ajuste administrativo (crédito)",
    ADJUSTED_REMOVE: "Ajuste administrativo (zerado)",
  };
  // Ajuste manual do Admin (zerar/conceder fora do fluxo automático de venda)
  // fica no extrato, mas só visível pro próprio Admin — outros papéis com
  // acesso à ficha do cliente (Gerente/Vendedor) não veem essas linhas.
  const visibleCreditMovements = showFiado
    ? customer.creditMovements
    : customer.creditMovements.filter(
        (movement) => movement.type !== "ADJUSTED_ADD" && movement.type !== "ADJUSTED_REMOVE"
      );

  return (
    <div>
      <div className="mb-6">
        <Link href="/clientes" className="text-sm text-text-muted hover:underline">
          ← Voltar para clientes
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-foreground">{customer.name}</h1>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total gasto</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatBRL(customer.totalSpent)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Compras realizadas</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{customer.sales.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Última compra</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {customer.lastPurchaseAt ? formatDateTime(customer.lastPurchaseAt) : "-"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Crédito disponível</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">
            {formatBRL(customer.creditBalance)}
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
          Histórico de compras
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Venda</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Itens</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {customer.sales.map((sale) => (
              <tr key={sale.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">#{sale.number}</td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(sale.createdAt)}</td>
                <td className="px-4 py-3 text-slate-500">{sale.items.length}</td>
                <td className="px-4 py-3 text-slate-900">{formatBRL(sale.total)}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      sale.status === "CANCELLED"
                        ? "rounded bg-red-50 px-2 py-0.5 text-xs text-red-700"
                        : "rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                    }
                  >
                    {sale.status === "CANCELLED" ? "Cancelada" : "Concluída"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/vendas/${sale.id}`}
                    className="text-sm text-slate-600 hover:underline"
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
            {customer.sales.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Este cliente ainda não realizou compras.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
          Extrato de crédito de loja
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Movimento</th>
              <th className="px-4 py-3 font-medium">Venda</th>
              <th className="px-4 py-3 font-medium">Motivo</th>
              <th className="px-4 py-3 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {visibleCreditMovements.map((movement) => {
              const isPositive = movement.type === "GRANTED" || movement.type === "ADJUSTED_ADD";
              return (
                <tr key={movement.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(movement.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-900">
                    {CREDIT_MOVEMENT_LABELS[movement.type] ?? movement.type}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {movement.sale ? (
                      <Link href={`/vendas/${movement.saleId}`} className="hover:underline">
                        #{movement.sale.number}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{movement.reason ?? "-"}</td>
                  <td
                    className={
                      isPositive
                        ? "px-4 py-3 font-medium text-emerald-700"
                        : "px-4 py-3 font-medium text-red-600"
                    }
                  >
                    {isPositive ? "+" : "-"}
                    {formatBRL(movement.amount)}
                  </td>
                </tr>
              );
            })}
            {visibleCreditMovements.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nenhuma movimentação de crédito ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showFiado && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
            Fiado
          </div>
          <div className="p-4">
            <FiadoPanel
              customerId={customer.id}
              entries={fiadoRows}
              creditBalance={Number(customer.creditBalance)}
            />
          </div>
        </div>
      )}

      {showCreditoEficaz && creditoEficazSummary && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
            Crédito Eficaz
          </div>
          <div className="p-4">
            <CreditoEficazPanel
              customerId={customer.id}
              summary={creditoEficazSummary}
              usages={creditoEficazUsages}
            />
          </div>
        </div>
      )}

      <div className="mb-6 max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Acesso à loja online</h2>
        <p className="mb-4 text-sm text-slate-500">
          {customer.username
            ? `Login: @${customer.username}`
            : "Cliente sem login na loja online."}
        </p>
        <ResetCustomerPasswordPanel customerId={customer.id} hasLogin={customer.username !== null} />
      </div>

      {showMerge && (
        <div className="mb-6 max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Mesclar cadastro duplicado</h2>
          <MergeCustomerPanel
            customerId={customer.id}
            customerName={customer.name}
            customerHasLogin={customer.username !== null}
          />
        </div>
      )}

      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Editar dados</h2>
        <CustomerForm
          customerId={customer.id}
          defaultValues={{
            name: customer.name,
            document: customer.document ?? "",
            phone: customer.phone ?? "",
            whatsapp: customer.whatsapp ?? "",
            email: customer.email ?? "",
            addressStreet: customer.addressStreet ?? "",
            addressNumber: customer.addressNumber ?? "",
            addressCity: customer.addressCity ?? "",
            addressState: customer.addressState ?? "",
            addressZip: customer.addressZip ?? "",
            notes: customer.notes ?? "",
            birthDate: customer.birthDate ? customer.birthDate.toISOString().slice(0, 10) : "",
          }}
        />
      </div>
    </div>
  );
}
