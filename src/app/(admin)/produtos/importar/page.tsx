import { ImportForm } from "./import-form";
import { CSV_COLUMNS } from "@/lib/csv-columns";

export default function ImportarProdutosPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-foreground">Importar produtos</h1>
      <p className="mb-6 text-sm text-text-muted">
        Envie um arquivo CSV com as colunas abaixo. Categorias, marcas e fornecedores informados
        que ainda não existirem serão criados automaticamente. Produtos com o mesmo código interno
        de um produto já existente serão atualizados.
      </p>

      <div className="mb-6 max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <ImportForm />
      </div>

      <div className="max-w-3xl rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        <p className="mb-2 font-medium text-slate-700">Colunas esperadas:</p>
        <code className="block overflow-x-auto whitespace-nowrap text-xs">
          {CSV_COLUMNS.join(", ")}
        </code>
      </div>
    </div>
  );
}
