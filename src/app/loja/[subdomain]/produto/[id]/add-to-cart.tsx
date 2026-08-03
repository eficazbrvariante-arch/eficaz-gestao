"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/modules/catalog/cart-context";
import { formatBRL } from "@/lib/format";

type Variant = {
  id: string;
  name: string;
  priceAdjustment: number;
  stockQty: number;
};

export function AddToCart({
  productId,
  productName,
  basePrice,
  stockQty,
  imageUrl,
  variants,
  cartHref,
}: {
  productId: string;
  productName: string;
  basePrice: number;
  stockQty: number;
  imageUrl: string | null;
  variants: Variant[];
  cartHref: string;
}) {
  const { addItem } = useCart();
  const hasVariants = variants.length > 0;

  const [variantId, setVariantId] = useState<string | null>(
    hasVariants ? variants[0].id : null
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const variant = variants.find((v) => v.id === variantId) ?? null;
  const unitPrice = Math.round((basePrice + (variant?.priceAdjustment ?? 0)) * 100) / 100;
  const available = variant ? variant.stockQty : stockQty;

  function handleAdd() {
    addItem(
      {
        productId,
        variantId: variant?.id ?? null,
        name: productName,
        variantName: variant?.name ?? null,
        unitPrice,
        imageUrl,
        stockQty: available,
      },
      quantity
    );
    setAdded(true);
  }

  return (
    <div>
      {hasVariants && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Escolha uma opção</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const isActive = v.id === variantId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setVariantId(v.id);
                    setQuantity(1);
                    setAdded(false);
                  }}
                  className={[
                    "rounded-md border px-3 py-2 text-sm",
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {v.name}
                  {v.priceAdjustment !== 0 && (
                    <span className="ml-1 text-xs">
                      ({v.priceAdjustment > 0 ? "+" : ""}
                      {formatBRL(v.priceAdjustment)})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4 text-2xl font-semibold" style={{ color: "var(--store-primary)" }}>
        {formatBRL(unitPrice)}
      </div>

      <p className="mb-3 flex items-center gap-1.5 text-sm text-emerald-700">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Em estoque
      </p>

      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-slate-600">Quantidade</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setQuantity((q) => Math.max(1, q - 1));
              setAdded(false);
            }}
            className="h-9 w-9 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
            aria-label="Diminuir quantidade"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => {
              const next = Number(e.target.value);
              setQuantity(Math.max(1, next || 1));
              setAdded(false);
            }}
            className="h-9 w-16 rounded border border-slate-300 px-2 text-center text-sm"
          />
          <button
            type="button"
            onClick={() => {
              setQuantity((q) => q + 1);
              setAdded(false);
            }}
            className="h-9 w-9 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
            aria-label="Aumentar quantidade"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="w-full rounded-md px-5 py-3 text-sm font-medium text-white sm:w-auto"
        style={{ backgroundColor: "var(--store-primary)" }}
      >
        Adicionar ao carrinho
      </button>

      {added && (
        <p className="mt-3 text-sm text-emerald-700">
          Adicionado ao carrinho.{" "}
          <Link href={cartHref} className="font-medium underline">
            Ver carrinho
          </Link>
        </p>
      )}
    </div>
  );
}
