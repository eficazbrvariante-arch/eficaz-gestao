import { requireTenant } from "@/lib/session";
import { CompanyForm } from "./company-form";

export default async function ConfiguracoesEmpresaPage() {
  const { tenant } = await requireTenant();

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-foreground">Dados da empresa</h1>
      <p className="mb-6 text-sm text-text-muted">
        Essas informações aparecerão no catálogo online e nos comprovantes de venda.
      </p>

      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <CompanyForm tenant={tenant} />
      </div>
    </div>
  );
}
