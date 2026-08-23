import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { deleteSupplierAction } from "./actions";

export default async function FornecedoresPage() {
  const user = await requireUser();
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId: user.tenantId },
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Fornecedores</h1>
          <p className="text-sm text-text-muted">Fornecedores vinculados aos seus produtos.</p>
        </div>
        <Link
          href="/fornecedores/novo"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Novo fornecedor
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Telefone</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Produtos</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) => (
              <tr key={supplier.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-900">{supplier.name}</td>
                <td className="px-4 py-3 text-slate-500">{supplier.phone ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">{supplier.email ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">{supplier._count.products}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/fornecedores/${supplier.id}`}
                      className="text-sm text-slate-600 hover:underline"
                    >
                      Editar
                    </Link>
                    <form action={deleteSupplierAction.bind(null, supplier.id)}>
                      <button
                        type="submit"
                        className="text-sm text-red-600 hover:underline disabled:text-slate-300"
                        disabled={supplier._count.products > 0}
                        title={
                          supplier._count.products > 0
                            ? "Remova os produtos deste fornecedor antes de excluir"
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
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nenhum fornecedor cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
