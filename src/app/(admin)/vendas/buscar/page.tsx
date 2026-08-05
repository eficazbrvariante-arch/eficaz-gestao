import { BuscarVendaForm } from "./buscar-venda-form";

export default function BuscarVendaPage() {
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
    </div>
  );
}
