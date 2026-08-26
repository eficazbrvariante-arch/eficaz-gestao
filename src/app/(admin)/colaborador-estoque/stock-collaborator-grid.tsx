"use client";

import { useMemo, useState, useTransition } from "react";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { BarcodeScannerField } from "@/components/ui/barcode-scanner-field";
import { confirmStockCheckAction } from "./actions";

type Product = {
  id: string;
  name: string;
  stockQty: number;
  barcode: string | null;
  imageUrl: string | null;
};

export function StockCollaboratorGrid({ products: initialProducts }: { products: Product[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialProducts.map((p) => [p.id, p.stockQty]))
  );
  const [newPhotos, setNewPhotos] = useState<Record<string, string>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(term) || p.barcode?.toLowerCase().includes(term)
    );
  }, [search, products]);

  function confirm(product: Product) {
    const quantity = Math.max(0, Math.round(quantities[product.id] ?? product.stockQty));
    const photoUrl = newPhotos[product.id];

    if (!product.imageUrl && !photoUrl) {
      setErrors((current) => ({ ...current, [product.id]: "Adicione uma foto antes de confirmar." }));
      return;
    }

    setConfirmingId(product.id);
    setErrors((current) => ({ ...current, [product.id]: undefined }));
    startTransition(async () => {
      const result = await confirmStockCheckAction({ productId: product.id, quantity, photoUrl });
      setConfirmingId(null);
      if (result?.error) {
        setErrors((current) => ({ ...current, [product.id]: result.error }));
        return;
      }
      setProducts((current) => current.filter((p) => p.id !== product.id));
    });
  }

  if (initialProducts.length === 0) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-800">
        Contagem concluída — nenhum produto pendente. 🎉
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex max-w-md gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produto pelo nome..."
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <BarcodeScannerField onScanned={(value) => setSearch(value)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {filtered.map((product) => {
          const qty = quantities[product.id] ?? product.stockQty;
          const isConfirming = confirmingId === product.id;
          const error = errors[product.id];
          const canConfirm = Boolean(product.imageUrl || newPhotos[product.id]);

          return (
            <div key={product.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              {product.imageUrl ? (
                <div className="mb-2 aspect-square w-full overflow-hidden rounded-md bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element -- domínio da imagem não é conhecido em build time */}
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="mb-2">
                  <ImageUploadField
                    value={newPhotos[product.id]}
                    onChange={(url) => setNewPhotos((current) => ({ ...current, [product.id]: url }))}
                    disabled={isConfirming}
                  />
                </div>
              )}

              <p className="mb-2 line-clamp-2 text-xs font-medium text-slate-900" title={product.name}>
                {product.name}
              </p>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setQuantities((current) => ({ ...current, [product.id]: Math.max(0, qty - 1) }))
                  }
                  disabled={isConfirming}
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
                  disabled={isConfirming}
                  className="h-8 w-full min-w-0 rounded border border-slate-300 px-1 text-center text-sm"
                />
                <button
                  type="button"
                  onClick={() => setQuantities((current) => ({ ...current, [product.id]: qty + 1 }))}
                  disabled={isConfirming}
                  className="h-8 w-8 shrink-0 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={() => confirm(product)}
                disabled={isConfirming || !canConfirm}
                className="mt-2 w-full rounded-md bg-slate-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isConfirming ? "Confirmando..." : "Confirmar"}
              </button>

              {error && <p className="mt-1 text-center text-[11px] text-red-600">{error}</p>}
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
