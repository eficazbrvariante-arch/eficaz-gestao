import { ConvenioForm } from "../convenio-form";

export default function NovoConvenioPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-foreground">Novo convênio</h1>
      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <ConvenioForm />
      </div>
    </div>
  );
}
