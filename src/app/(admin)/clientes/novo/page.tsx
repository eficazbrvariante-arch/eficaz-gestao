import { CustomerForm } from "../customer-form";

export default function NovoClientePage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Novo cliente</h1>
      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <CustomerForm />
      </div>
    </div>
  );
}
