import Link from "next/link";
import { CategoryIcon } from "./icons";
import type { listCatalogCategories } from "@/modules/catalog/catalog-service";

export function CategoryGrid({
  base,
  categories,
}: {
  base: string;
  categories: Awaited<ReturnType<typeof listCatalogCategories>>;
}) {
  if (categories.length === 0) return null;

  return (
    <section>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`${base}/produtos?categoria=${category.id}`}
            className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <CategoryIcon icon={category.icon} className="h-6 w-6 text-slate-700" />
            <span className="line-clamp-2 text-[11px] font-medium text-slate-700">
              {category.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
