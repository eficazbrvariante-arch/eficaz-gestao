import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { StockMovementForm } from "../stock-movement-form";

export default async function NovoLancamentoEstoquePage() {
  const user = await requireUser();
  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, stockQty: true },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-foreground">Novo lançamento de estoque</h1>
      <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <StockMovementForm products={products} />
      </div>
    </div>
  );
}
