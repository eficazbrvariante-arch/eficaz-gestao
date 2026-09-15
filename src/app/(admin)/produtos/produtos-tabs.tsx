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
    <div className="mb-6 flex gap-2 border-b border-border">
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
                ? "border-foreground text-foreground"
                : "border-transparent text-text-secondary hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
