import { SupplierForm } from "../supplier-form";

export default function NovoFornecedorPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-foreground">Novo fornecedor</h1>
      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <SupplierForm />
      </div>
    </div>
  );
}
