import Link from "next/link";
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
            className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <span className="line-clamp-2 text-[11px] font-medium text-slate-700">
              {category.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
