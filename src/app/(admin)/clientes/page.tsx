import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatBRL, formatDate } from "@/lib/format";
import { deleteCustomerAction } from "./actions";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const user = await requireUser();

  const customers = await prisma.customer.findMany({
    where: {
      tenantId: user.tenantId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { document: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { sales: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500">
            Histórico de compras e dados de contato dos seus clientes.
          </p>
        </div>
        <Link
          href="/clientes/novo"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Novo cliente
        </Link>
      </div>

      <form className="mb-4 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
          className="w-80 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Buscar
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Contato</th>
              <th className="px-4 py-3 font-medium">Compras</th>
              <th className="px-4 py-3 font-medium">Total gasto</th>
              <th className="px-4 py-3 font-medium">Última compra</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{customer.name}</div>
                  <div className="text-xs text-slate-400">{customer.document ?? "sem documento"}</div>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {customer.phone ?? customer.whatsapp ?? "-"}
                </td>
                <td className="px-4 py-3 text-slate-500">{customer._count.sales}</td>
                <td className="px-4 py-3 text-slate-900">{formatBRL(customer.totalSpent)}</td>
                <td className="px-4 py-3 text-slate-500">
                  {customer.lastPurchaseAt ? formatDate(customer.lastPurchaseAt) : "-"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/clientes/${customer.id}`}
                      className="text-sm text-slate-600 hover:underline"
                    >
                      Ver ficha
                    </Link>
                    <form action={deleteCustomerAction.bind(null, customer.id)}>
                      <button
                        type="submit"
                        className="text-sm text-red-600 hover:underline disabled:text-slate-300"
                        disabled={customer._count.sales > 0}
                        title={
                          customer._count.sales > 0
                            ? "Clientes com vendas registradas não podem ser excluídos"
                            : undefined
                        }
                      >
                        Excluir
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
