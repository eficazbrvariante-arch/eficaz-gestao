"use client";

import { useState } from "react";
import { useCart } from "@/modules/catalog/cart-context";

type QuickAddProduct = {
  id: string;
  name: string;
  unitPrice: number;
  imageUrl: string | null;
  stockQty: number;
};

export function AddToCartQuickButton({
  product,
  className,
}: {
  product: QuickAddProduct;
  className?: string;
}) {
  const { addItem, flashDealOrderLimit } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const [capped, setCapped] = useState(false);

  function handleClick() {
    const result = addItem({
      productId: product.id,
      variantId: null,
      name: product.name,
      variantName: null,
      unitPrice: product.unitPrice,
      imageUrl: product.imageUrl,
      stockQty: product.stockQty,
    });

    if (result.capped) {
      setCapped(true);
      window.setTimeout(() => setCapped(false), 2500);
      return;
    }

    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1200);
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Adicionar ${product.name} ao carrinho`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-md transition hover:brightness-95"
        style={{ backgroundColor: justAdded ? "#047857" : "var(--store-primary)" }}
      >
        {justAdded ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        )}
      </button>

      {capped && (
        <span className="absolute right-0 top-full z-10 mt-1 w-max max-w-40 rounded bg-slate-900 px-2 py-1 text-[10px] text-white shadow-lg">
          Limite de {flashDealOrderLimit} un. por oferta
        </span>
      )}
    </div>
  );
}
