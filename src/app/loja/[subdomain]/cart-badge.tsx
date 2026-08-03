"use client";

import Link from "next/link";
import { useCart } from "@/modules/catalog/cart-context";
import { formatBRL } from "@/lib/format";

export function CartBadge({ href }: { href: string }) {
  const { itemCount, subtotal, ready } = useCart();

  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md border border-slate-300 px-2 py-2 text-slate-700 hover:bg-slate-50 sm:px-3"
      aria-label="Ver carrinho"
    >
      <span className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 shrink-0"
        >
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        {ready && itemCount > 0 && (
          <span
            className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold text-white"
            style={{ backgroundColor: "var(--store-primary)" }}
          >
            {itemCount}
          </span>
        )}
      </span>
      <span className="hidden text-sm font-medium sm:inline">
        {ready && itemCount > 0 ? formatBRL(subtotal) : "Carrinho"}
      </span>
    </Link>
  );
}
