import { requireUser } from "@/lib/session";
import { canQuickEditStockQty } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { StockCollaboratorGrid } from "./stock-collaborator-grid";

export default async function ColaboradorEstoquePage() {
  const user = await requireUser();
  if (!canQuickEditStockQty(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar esta tela.
      </div>
    );
  }

  // Só o essencial pra identificar o produto pela foto e ajustar a
  // quantidade — nunca custo, preço de venda ou qualquer outro dado.
  // A fila só traz quem ainda não foi confirmado neste ciclo de contagem
  // (lastStockCheckAt nulo), e prioriza quem ainda não tem foto cadastrada.
  const [products, totalActive] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId: user.tenantId, active: true, lastStockCheckAt: null },
      select: {
        id: true,
        name: true,
        stockQty: true,
        barcode: true,
        images: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
      },
      orderBy: [{ images: { _count: "asc" } }, { name: "asc" }],
    }),
    prisma.product.count({ where: { tenantId: user.tenantId, active: true } }),
  ]);

  const doneCount = totalActive - products.length;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-foreground">Contagem de Estoque</h1>
      <p className="mb-1 text-sm text-text-muted">
        Confirme cada produto (foto, quando faltar, e a quantidade em estoque). Ao confirmar, ele
        sai da sua lista.
      </p>
      <p className="mb-6 text-sm font-medium text-slate-700">
        {doneCount} de {totalActive} produto(s) já confirmado(s).
      </p>
      <StockCollaboratorGrid
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          stockQty: product.stockQty,
          barcode: product.barcode,
          imageUrl: product.images[0]?.url ?? null,
        }))}
      />
    </div>
  );
}
