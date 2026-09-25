import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canManageRepairOrders, canManageRepairServiceCatalog } from "@/lib/permissions";
import { searchRepairServices } from "@/modules/repairs/repair-service-catalog";
import { RepairServiceCatalog } from "./repair-service-catalog";

export default async function ServicosAssistenciaPage() {
  const user = await requireUser();
  if (!canManageRepairOrders(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        Seu perfil não tem permissão para acessar a assistência técnica.
      </div>
    );
  }

  const isAdmin = canManageRepairServiceCatalog(user.role);
  // O catálogo é pequeno (dezenas/centenas de serviços): carrega tudo de uma
  // vez e filtra no navegador, para a consulta de preço no balcão ser imediata.
  const services = await searchRepairServices(user.tenantId, "", {
    withCost: isAdmin,
    includeInactive: isAdmin,
    take: 1000,
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Serviços da Assistência</h1>
          <p className="text-sm text-text-muted">Consulte preços e registre serviços novos.</p>
        </div>
        <Link
          href="/assistencia-tecnica"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Voltar para as OS
        </Link>
      </div>
      <RepairServiceCatalog initialServices={services} isAdmin={isAdmin} />
    </div>
  );
}
