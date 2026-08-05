import { requireTenant } from "@/lib/session";
import { PdvSettingsForm } from "./pdv-settings-form";

export default async function ConfiguracoesPdvPage() {
  const { tenant } = await requireTenant();

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">PDV: impressão de comprovante</h1>
      <p className="mb-6 text-sm text-slate-500">
        Controla a impressão do comprovante de venda na impressora térmica configurada como
        padrão no computador do caixa.
      </p>

      <div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <PdvSettingsForm defaultValues={{ autoPrintReceipt: tenant.autoPrintReceipt }} />
      </div>
    </div>
  );
}
