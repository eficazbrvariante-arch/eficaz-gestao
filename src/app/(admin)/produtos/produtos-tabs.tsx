"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/clsx";

const TABS = [
  { label: "Produtos", href: "/produtos" },
  { label: "Categorias", href: "/produtos/categorias" },
  { label: "Marcas", href: "/produtos/marcas" },
];

export function ProdutosTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex gap-2 border-b border-slate-200">
      {TABS.map((tab) => {
        const isActive =
          tab.href === "/produtos" ? pathname === "/produtos" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "border-b-2 px-3 py-2 text-sm font-medium",
              isActive
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
