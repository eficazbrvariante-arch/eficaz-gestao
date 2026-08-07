import Link from "next/link";
import type { CategoryGroup } from "@/modules/catalog/catalog-service";

/**
 * Linha de macrocategorias na home — só mostra as que agrupam subcategorias
 * (`groupCategoriesByParent`); categoria comum, sem filhos, continua só no
 * menu de categorias normal, sem entrar aqui.
 */
export function MacroCategoryRow({ groups, base }: { groups: CategoryGroup[]; base: string }) {
  const macros = groups.filter((group) => group.children.length > 0);
  if (macros.length === 0) return null;

  return (
    <section className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {macros.map((macro) => (
        <Link
          key={macro.id}
          href={`${base}/produtos?categoria=${macro.id}`}
          className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        >
          {macro.name}
        </Link>
      ))}
    </section>
  );
}
