import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canEditCommission, canManageEmployeeLedger } from "@/lib/permissions";
import { ProdutosComissionadosPicker } from "./produtos-comissionados-picker";

/** Teto de itens carregados de uma vez — controle visual, não paginação completa. */
const LIST_LIMIT = 500;

export default async function ProdutosComissionadosPage() {
  const user = await requireUser();
  if (!canManageEmployeeLedger(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar esta página.
      </div>
    );
  }

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId: user.tenantId, active: true, commissionEnabled: true },
      select: { id: true, name: true, salePrice: true },
      orderBy: { name: "asc" },
      take: LIST_LIMIT,
    }),
    prisma.product.count({
      where: { tenantId: user.tenantId, active: true, commissionEnabled: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <Link href="/colaboradores" className="text-sm text-slate-500 hover:underline">
          ← Voltar para Colaboradores
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Produtos comissionados</h1>
        <p className="text-sm text-slate-500">
          {totalCount} produto(s) ativo(s) marcado(s) para comissão de venda. Busque um produto pra
          adicionar ou remover na hora, ou desmarque na lista abaixo e clique em Salvar.
        </p>
      </div>

      <ProdutosComissionadosPicker
        initialProducts={products.map((p) => ({
          id: p.id,
          name: p.name,
          salePrice: Number(p.salePrice),
        }))}
        totalCount={totalCount}
        listLimit={LIST_LIMIT}
        canEditCommission={canEditCommission(user.role)}
      />
    </div>
  );
}
