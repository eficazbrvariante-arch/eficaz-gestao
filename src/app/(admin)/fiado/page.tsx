import Link from "next/link";
import { requireTenant } from "@/lib/session";
import { canManageFiado } from "@/lib/permissions";
import { StatCard } from "@/components/admin/stat-card";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { buildWhatsappLink } from "@/lib/whatsapp";
import { getFiadoOverview, type FiadoCustomerRow } from "@/modules/fiado/fiado-overview-service";

const FILTERS = [
  { key: "devendo", label: "Devendo" },
  { key: "vencidos", label: "Vencidos" },
  { key: "quitados", label: "Quitados" },
  { key: "todos", label: "Todos" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const METHOD_LABEL: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT: "Débito",
  CREDIT: "Crédito",
};

function applyFilter(rows: FiadoCustomerRow[], filter: FilterKey) {
  if (filter === "devendo") return rows.filter((row) => row.openAmount > 0);
  if (filter === "vencidos") return rows.filter((row) => row.overdueAmount > 0);
  if (filter === "quitados") return rows.filter((row) => row.openAmount <= 0);
  return rows;
}

/**
 * Controle do fiado (pedido do dono, no molde do Crédito Eficaz): quem
 * comprou fiado, quem está devendo, o que está vencido e o que já foi
 * recebido. Só leitura — receber é na ficha do cliente ("Receber pagamento").
 */
export default async function FiadoPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { user, tenant } = await requireTenant();
  if (!canManageFiado(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar o controle de fiado.
      </div>
    );
  }

  const { filtro } = await searchParams;
  const filter: FilterKey = FILTERS.some((f) => f.key === filtro) ? (filtro as FilterKey) : "devendo";
  const overview = await getFiadoOverview(user.tenantId);
  const rows = applyFilter(overview.customers, filter);
  const storeName = tenant.tradeName || tenant.name;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Fiado</h1>
        <p className="text-sm text-text-muted">
          Quem comprou fiado, quem está devendo e o que já venceu. Para registrar um pagamento, abra o cliente e
          clique em &quot;Receber pagamento&quot;.
        </p>
      </div>

      {overview.overdueCount > 0 && (
        <div className="mb-6 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {overview.overdueCount} fiado(s) vencido(s), somando {formatBRL(overview.totalOverdue)}.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Em aberto" value={formatBRL(overview.totalOpen)} />
        <StatCard
          label="Vencido"
          value={formatBRL(overview.totalOverdue)}
          tone={overview.totalOverdue > 0 ? "negative" : "default"}
        />
        <StatCard label="Clientes devendo" value={String(overview.customersOwing)} />
        <StatCard label="Vendido fiado no mês" value={formatBRL(overview.soldThisMonth)} />
        <StatCard label="Recebido no mês" value={formatBRL(overview.receivedThisMonth)} tone="positive" />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/fiado?filtro=${f.key}`}
            className={
              f.key === filter
                ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs text-white"
                : "rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 hover:bg-slate-50"
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mb-8 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 text-right font-medium">Devendo</th>
              <th className="px-4 py-3 text-right font-medium">Vencido</th>
              <th className="px-4 py-3 font-medium">Próximo vencimento</th>
              <th className="px-4 py-3 font-medium">Último fiado</th>
              <th className="px-4 py-3 font-medium">Último pagamento</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const overdueNow = row.nextDueDate && row.nextDueDate < new Date();
              return (
                <tr key={row.customerId} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/clientes/${row.customerId}`} className="font-medium text-slate-900 hover:underline">
                      {row.name}
                    </Link>
                    {row.openCount > 0 && (
                      <p className="text-xs text-slate-500">{row.openCount} fiado(s) em aberto</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {row.openAmount > 0 ? formatBRL(row.openAmount) : <span className="text-emerald-700">Quitado</span>}
                  </td>
                  <td className={`px-4 py-3 text-right ${row.overdueAmount > 0 ? "font-semibold text-red-600" : "text-slate-400"}`}>
                    {row.overdueAmount > 0 ? formatBRL(row.overdueAmount) : "—"}
                  </td>
                  <td className={`px-4 py-3 ${overdueNow ? "text-red-600" : "text-slate-600"}`}>
                    {row.openAmount > 0 && row.nextDueDate ? formatDate(row.nextDueDate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.lastFiadoAt ? formatDate(row.lastFiadoAt) : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.lastPaymentAt ? (
                      <>
                        {formatDate(row.lastPaymentAt)}
                        {row.lastPaymentMethod && (
                          <span className="text-xs text-slate-500"> · {METHOD_LABEL[row.lastPaymentMethod] ?? row.lastPaymentMethod}</span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.phone && row.openAmount > 0 && (
                      <a
                        href={buildWhatsappLink(
                          row.phone,
                          `Olá, ${row.name}! Aqui é da ${storeName}. Passando pra lembrar do seu fiado em aberto: ${formatBRL(row.openAmount)}.`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-emerald-700 hover:underline"
                      >
                        WhatsApp
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  {filter === "vencidos"
                    ? "Nenhum fiado vencido."
                    : filter === "devendo"
                      ? "Ninguém devendo fiado."
                      : "Nenhum fiado lançado ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-foreground">Últimos lançamentos</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Lançado em</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              <th className="px-4 py-3 font-medium">Venda</th>
            </tr>
          </thead>
          <tbody>
            {overview.recent.map((entry) => (
              <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-500">{formatDateTime(entry.createdAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/clientes/${entry.customerId}`} className="text-slate-900 hover:underline">
                    {entry.customerName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">{formatBRL(entry.amount)}</td>
                <td className="px-4 py-3 text-xs">
                  {entry.status === "PAID" ? (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      Pago{entry.paidAt ? ` em ${formatDate(entry.paidAt)}` : ""}
                      {entry.paymentMethod ? ` · ${METHOD_LABEL[entry.paymentMethod] ?? entry.paymentMethod}` : ""}
                    </span>
                  ) : entry.overdue ? (
                    <span className="rounded bg-red-50 px-2 py-0.5 text-red-700">
                      Vencido{entry.dueDate ? ` desde ${formatDate(entry.dueDate)}` : ""}
                    </span>
                  ) : (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                      Pendente{entry.dueDate ? ` · vence ${formatDate(entry.dueDate)}` : ""}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {entry.saleId ? (
                    <Link href={`/vendas/${entry.saleId}`} className="hover:underline">
                      #{entry.saleNumber}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {overview.recent.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Nenhum fiado lançado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
