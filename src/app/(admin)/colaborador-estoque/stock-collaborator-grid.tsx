"use client";

import { useMemo, useState, useTransition } from "react";
import { updateStockQtyAction } from "./actions";

type Product = {
  id: string;
  name: string;
  stockQty: number;
  imageUrl: string | null;
};

export function StockCollaboratorGrid({ products }: { products: Product[] }) {
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(products.map((p) => [p.id, p.stockQty]))
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, "ok" | "error" | undefined>>({});
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => p.name.toLowerCase().includes(term));
  }, [search, products]);

  function commit(productId: string, quantity: number) {
    const safeQty = Math.max(0, Math.round(quantity));
    setQuantities((current) => ({ ...current, [productId]: safeQty }));
    setSavingId(productId);
    setFeedback((current) => ({ ...current, [productId]: undefined }));
    startTransition(async () => {
      const result = await updateStockQtyAction(productId, safeQty);
      setSavingId(null);
      setFeedback((current) => ({ ...current, [productId]: result?.error ? "error" : "ok" }));
    });
  }

  return (
    <div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar produto pelo nome..."
        className="mb-4 w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {filtered.map((product) => {
          const qty = quantities[product.id] ?? product.stockQty;
          const status = feedback[product.id];
          const isSaving = savingId === product.id;
          return (
            <div key={product.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 aspect-square w-full overflow-hidden rounded-md bg-slate-100">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- domínio da imagem não é conhecido em build time
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    Sem foto
                  </div>
                )}
              </div>
              <p className="mb-2 line-clamp-2 text-xs font-medium text-slate-900" title={product.name}>
                {product.name}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => commit(product.id, qty - 1)}
                  disabled={isSaving}
                  className="h-8 w-8 shrink-0 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={qty}
                  onChange={(e) =>
                    setQuantities((current) => ({
                      ...current,
                      [product.id]: Number(e.target.value) || 0,
                    }))
                  }
                  onBlur={(e) => commit(product.id, Number(e.target.value) || 0)}
                  className="h-8 w-full min-w-0 rounded border border-slate-300 px-1 text-center text-sm"
                />
                <button
                  type="button"
                  onClick={() => commit(product.id, qty + 1)}
                  disabled={isSaving}
                  className="h-8 w-8 shrink-0 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  +
                </button>
              </div>
              <p className="mt-1 h-4 text-center text-[11px]">
                {isSaving && <span className="text-slate-400">Salvando...</span>}
                {!isSaving && status === "ok" && <span className="text-emerald-600">Salvo</span>}
                {!isSaving && status === "error" && <span className="text-red-600">Erro ao salvar</span>}
              </p>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-400">
            Nenhum produto encontrado.
          </p>
        )}
      </div>
    </div>
  );
}
