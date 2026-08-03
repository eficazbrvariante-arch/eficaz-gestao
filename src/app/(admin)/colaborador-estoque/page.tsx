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
  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, active: true },
    select: {
      id: true,
      name: true,
      stockQty: true,
      images: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Ajuste de Estoque</h1>
      <p className="mb-6 text-sm text-slate-500">
        Encontre o produto pela foto e informe a quantidade em estoque. A alteração é salva na hora.
      </p>
      <StockCollaboratorGrid
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          stockQty: product.stockQty,
          imageUrl: product.images[0]?.url ?? null,
        }))}
      />
    </div>
  );
}
