import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatBRL, formatDateTime } from "@/lib/format";
import { CustomerForm } from "../customer-form";

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
    },
  });
  if (!customer) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href="/clientes" className="text-sm text-slate-500 hover:underline">
          ← Voltar para clientes
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">{customer.name}</h1>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
