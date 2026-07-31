"use client";

import Link from "next/link";
import { useCart } from "@/modules/catalog/cart-context";
import { formatBRL } from "@/lib/format";

export function CartBadge({ href }: { href: string }) {
  const { itemCount, subtotal, ready } = useCart();

  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
    >
      <span className="relative">
        Carrinho
        {ready && itemCount > 0 && (
          <span
            className="absolute -right-3 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold text-white"
            style={{ backgroundColor: "var(--store-primary)" }}
          >
            {itemCount}
          </span>
        )}
      </span>
      {ready && itemCount > 0 && (
        <span className="hidden font-medium text-slate-900 sm:inline">
          {formatBRL(subtotal)}
        </span>
      )}
    </Link>
  );
}
