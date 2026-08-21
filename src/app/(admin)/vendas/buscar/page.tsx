import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatBRL, formatDateTime } from "@/lib/format";
import { BuscarVendaForm } from "./buscar-venda-form";

export default async function BuscarVendaPage() {
  const user = await requireUser();

  const trocas = await prisma.saleItemDefect.findMany({
    where: { tenantId: user.tenantId },
    include: {
      sale: { select: { id: true, number: true, customer: { select: { name: true } } } },
      saleItem: { select: { nameSnapshot: true } },
      reportedBy: { select: { name: true } },
    },
    orderBy: { reportedAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Troca</h1>
      <p className="mb-6 text-sm text-slate-500">
        Digite o número do cupom da venda original (impresso no comprovante) pra abrir o
        comprovante correspondente e processar a troca.
      </p>

      <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <BuscarVendaForm />
      </div>

      <h2 className="mt-10 mb-1 text-lg font-semibold text-slate-900">Histórico de trocas</h2>
      <p className="mb-4 text-sm text-slate-500">Últimas {trocas.length} trocas registradas.</p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Venda</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Qtd.</th>
              <th className="px-4 py-3 font-medium">Motivo</th>
              <th className="px-4 py-3 font-medium">Crédito gerado</th>
              <th className="px-4 py-3 font-medium">Registrado por</th>
            </tr>
          </thead>
          <tbody>
            {trocas.map((troca) => (
              <tr key={troca.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link href={`/vendas/${troca.sale.id}`} className="hover:underline">
                    #{troca.sale.number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(troca.reportedAt)}</td>
                <td className="px-4 py-3 text-slate-700">{troca.saleItem.nameSnapshot}</td>
                <td className="px-4 py-3 text-slate-500">
                  {troca.sale.customer?.name ?? "Consumidor final"}
                </td>
                <td className="px-4 py-3 text-slate-500">{troca.quantity}</td>
                <td className="px-4 py-3 text-slate-500">{troca.reason}</td>
                <td className="px-4 py-3 text-slate-900">{formatBRL(troca.creditAmount)}</td>
                <td className="px-4 py-3 text-slate-500">{troca.reportedBy.name}</td>
              </tr>
            ))}
            {trocas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  Nenhuma troca registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
