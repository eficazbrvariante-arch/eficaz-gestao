"use client";

import { useState } from "react";
import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { buildQuery, type SearchParams } from "./query-utils";

export function BrandFilter({
  brands,
  listUrl,
  search: currentSearch,
}: {
  brands: { id: string; name: string }[];
  listUrl: string;
  search: SearchParams;
}) {
  const activeBrandId = currentSearch.marca;
  const buildHref = (brandId?: string) =>
    `${listUrl}${buildQuery(currentSearch, { marca: brandId, pagina: undefined })}`;

  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const filtered = term ? brands.filter((brand) => brand.name.toLowerCase().includes(term)) : brands;

  return (
    <div>
      {brands.length > 8 && (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar marca..."
          aria-label="Buscar marca"
          className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      )}

      <ul className="max-h-56 space-y-1 overflow-y-auto pr-1 text-sm">
        <li>
          <Link
            href={buildHref(undefined)}
            className={clsx(
              "block",
              !activeBrandId ? "font-medium text-slate-900" : "text-slate-600 hover:text-slate-900"
            )}
          >
            Todas
          </Link>
        </li>
        {filtered.map((brand) => (
          <li key={brand.id}>
            <Link
              href={buildHref(brand.id)}
              className={clsx(
                "block truncate",
                activeBrandId === brand.id
                  ? "font-medium text-slate-900"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {brand.name}
            </Link>
          </li>
        ))}
        {filtered.length === 0 && <li className="text-slate-400">Nenhuma marca encontrada</li>}
      </ul>
    </div>
  );
}
