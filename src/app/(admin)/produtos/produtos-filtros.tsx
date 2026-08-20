"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { BarcodeScannerField } from "@/components/ui/barcode-scanner-field";

const SEARCH_DEBOUNCE_MS = 400;

export function ProdutosFiltros({
  categories,
  brands,
}: {
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [term, setTerm] = useState(searchParams.get("q") ?? "");
  // Mantém a caixa de busca em sincronia se o filtro for limpo por outro caminho
  // (ex.: clicar num card de resumo, que navega direto pra URL sem passar por aqui).
  // Ajuste durante a renderização (não em efeito) — padrão recomendado pra
  // "resetar estado quando uma prop muda", sem o re-render em cascata de um efeito.
  const [prevSearchParams, setPrevSearchParams] = useState(searchParams);
  if (searchParams !== prevSearchParams) {
    setPrevSearchParams(searchParams);
    setTerm(searchParams.get("q") ?? "");
  }

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchChange(value: string) {
    setTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParams({ q: value || null }), SEARCH_DEBOUNCE_MS);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updateParams({ q: term || null });
  }

  function clearSearch() {
    setTerm("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updateParams({ q: null });
  }

  function handleScanned(value: string) {
    setTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updateParams({ q: value || null });
  }

  const category = searchParams.get("category") ?? "";
  const brand = searchParams.get("brand") ?? "";
  const status = searchParams.get("status") ?? "all";
  const stock = searchParams.get("stock") ?? "all";
  const hasActiveFilters = Boolean(
    searchParams.get("q") || category || brand || status !== "all" || stock !== "all"
  );

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={term}
            onChange={(event) => handleSearchChange(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Buscar por nome, código, SKU, código de barras ou marca"
            aria-label="Buscar produtos"
            className="w-full rounded-md border border-slate-300 py-2 pr-8 pl-9 text-sm text-gray-800 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
          />
          {term && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Limpar busca"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <BarcodeScannerField onScanned={handleScanned} />
      </div>

      <Select
        value={category}
        onChange={(event) => updateParams({ category: event.target.value || null })}
        aria-label="Filtrar por categoria"
        className="sm:w-40"
      >
        <option value="">Todas categorias</option>
        {categories.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </Select>

      <Select
        value={brand}
        onChange={(event) => updateParams({ brand: event.target.value || null })}
        aria-label="Filtrar por marca"
        className="sm:w-40"
      >
        <option value="">Todas marcas</option>
        {brands.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </Select>

      <Select
        value={status}
        onChange={(event) =>
          updateParams({ status: event.target.value === "all" ? null : event.target.value })
        }
        aria-label="Filtrar por status"
        className="sm:w-36"
      >
        <option value="all">Todos status</option>
        <option value="active">Ativos</option>
        <option value="inactive">Inativos</option>
      </Select>

      <Select
        value={stock}
        onChange={(event) =>
          updateParams({ stock: event.target.value === "all" ? null : event.target.value })
        }
        aria-label="Filtrar por estoque"
        className="sm:w-40"
      >
        <option value="all">Todo estoque</option>
        <option value="instock">Em estoque</option>
        <option value="low">Estoque baixo</option>
        <option value="out">Sem estoque</option>
      </Select>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
