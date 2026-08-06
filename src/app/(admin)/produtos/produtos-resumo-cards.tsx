import Link from "next/link";
import { AlertTriangle, CheckCircle2, PackageX, Boxes } from "lucide-react";
import { clsx } from "@/lib/clsx";
import type { ProductSummary } from "@/modules/products/product-list-query";

export function ProdutosResumoCards({
  summary,
  status,
  stock,
}: {
  summary: ProductSummary;
  status: string;
  stock: string;
}) {
  const cards = [
    {
      label: "Total de produtos",
      value: summary.total,
      href: "/produtos",
      icon: Boxes,
      active: status === "all" && stock === "all",
      accent: "text-slate-500",
    },
    {
      label: "Produtos ativos",
      value: summary.active,
      href: "/produtos?status=active",
      icon: CheckCircle2,
      active: status === "active",
      accent: "text-emerald-600",
    },
    {
      label: "Estoque baixo",
      value: summary.lowStock,
      href: "/produtos?stock=low",
      icon: AlertTriangle,
      active: stock === "low",
      accent: "text-amber-600",
    },
    {
      label: "Sem estoque",
      value: summary.outOfStock,
      href: "/produtos?stock=out",
      icon: PackageX,
      active: stock === "out",
      accent: "text-red-600",
    },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <Link
          key={card.label}
          href={card.href}
          className={clsx(
            "rounded-xl border bg-white p-4 shadow-sm transition-colors hover:border-brand",
            card.active ? "border-brand ring-1 ring-brand" : "border-slate-200"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{card.label}</span>
            <card.icon className={clsx("h-4 w-4", card.accent)} />
          </div>
          <div className="mt-2 text-2xl font-semibold text-gray-800">{card.value}</div>
        </Link>
      ))}
    </div>
  );
}
