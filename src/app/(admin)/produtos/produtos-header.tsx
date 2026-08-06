import Link from "next/link";
import { Download, Plus, Upload } from "lucide-react";

export function ProdutosHeader() {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">Produtos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gerencie os produtos, preços, estoque e publicação da sua loja.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/produtos/exportar"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </Link>
        <Link
          href="/produtos/importar"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Upload className="h-4 w-4" />
          Importar CSV
        </Link>
        <Link
          href="/produtos/novo"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
        >
          <Plus className="h-4 w-4" />
          Novo produto
        </Link>
      </div>
    </div>
  );
}
