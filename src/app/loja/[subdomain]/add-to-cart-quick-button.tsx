"use client";

import { useState } from "react";
import { useCart } from "@/modules/catalog/cart-context";
import { clsx } from "@/lib/clsx";

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
  const { addItem } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  function handleClick() {
    addItem({
      productId: product.id,
      variantId: null,
      name: product.name,
      variantName: null,
      unitPrice: product.unitPrice,
      imageUrl: product.imageUrl,
      stockQty: product.stockQty,
    });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Adicionar ${product.name} ao carrinho`}
      className={clsx(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-md transition hover:brightness-95",
        className
      )}
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
  );
}
