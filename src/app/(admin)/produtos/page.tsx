import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ProdutosTabs } from "./produtos-tabs";
import { deleteProductAction } from "./actions";
import { stockStatusLabel } from "@/modules/products/stock-status";

function formatBRL(value: number | { toString(): string }) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const user = await requireUser();

  const products = await prisma.product.findMany({
    where: {
      tenantId: user.tenantId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { internalCode: { contains: q, mode: "insensitive" } },
              { barcode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      category: true,
      brand: true,
      // Produtos com vendas registradas não podem ser excluídos (o histórico
      // precisa continuar íntegro) — o botão de excluir é desabilitado.
      _count: { select: { saleItems: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Produtos</h1>
      <ProdutosTabs />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form className="flex min-w-0 gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome, código ou EAN..."
            className="w-full min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 sm:w-72 sm:flex-none"
          />
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Buscar
          </button>
        </form>

        <div className="flex gap-2">
          <Link
            href="/produtos/exportar"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Exportar CSV
          </Link>
          <Link
            href="/produtos/importar"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Importar CSV
          </Link>
          <Link
            href="/produtos/novo"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Novo produto
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Produto</th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              <th className="px-4 py-3 font-medium">Preço</th>
              <th className="px-4 py-3 font-medium">Estoque</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const stockLabel = stockStatusLabel(product);
              return (
                <tr key={product.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{product.name}</div>
                    <div className="text-xs text-slate-400">
                      {product.internalCode ?? "sem código"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {product.category?.name ?? "-"}
                    {product.brand ? ` · ${product.brand.name}` : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-900">
                    {formatBRL(product.salePrice)}
                    {product.promoPrice && (
                      <div className="text-xs text-emerald-600">
                        Promo: {formatBRL(product.promoPrice)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={stockLabel ? "font-medium text-red-600" : "text-slate-700"}>
                      {product.stockQty}
                    </span>
                    {stockLabel && <div className="text-xs text-red-500">{stockLabel}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        product.active
                          ? "rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                          : "rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                      }
                    >
                      {product.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/produtos/${product.id}`}
                        className="text-sm text-slate-600 hover:underline"
                      >
                        Editar
                      </Link>
                      <form action={deleteProductAction.bind(null, product.id)}>
                        <button
                          type="submit"
                          className="text-sm text-red-600 hover:underline disabled:text-slate-300 disabled:no-underline"
                          disabled={product._count.saleItems > 0}
                          title={
                            product._count.saleItems > 0
                              ? "Produtos com vendas registradas não podem ser excluídos. Desative o produto para removê-lo do PDV e do catálogo."
                              : undefined
                          }
                        >
                          Excluir
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
