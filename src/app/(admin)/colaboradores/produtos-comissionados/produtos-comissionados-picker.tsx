"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormBanner } from "@/components/ui/form-banner";
import { bulkRemoveProductCommissionAction } from "../actions";

type Product = { id: string; name: string; salePrice: number };

/**
 * Revisão em lote dos produtos comissionados: todos vêm marcados (é isso que
 * já são); desmarcar um só some da lista depois de clicar em Salvar — evita
 * remover comissão sem querer com um clique só.
 */
export function ProdutosComissionadosPicker({
  initialProducts,
  totalCount,
  listLimit,
  canEditCommission,
}: {
  initialProducts: Product[];
  totalCount: number;
  listLimit: number;
  canEditCommission: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [products, setProducts] = useState(initialProducts);
  const [uncheckedIds, setUncheckedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  function toggle(id: string) {
    setUncheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    if (uncheckedIds.size === 0) return;
    const idsToRemove = [...uncheckedIds];
    setFeedback(undefined);
    startTransition(async () => {
      const result = await bulkRemoveProductCommissionAction(idsToRemove);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: result?.success ?? "Comissão removida." });
      setProducts((current) => current.filter((p) => !uncheckedIds.has(p.id)));
      setUncheckedIds(new Set());
      router.refresh();
    });
  }

  const visibleProducts = products.filter((p) =>
    p.name.toLowerCase().includes(filter.trim().toLowerCase())
  );

  return (
    <div className="space-y-4">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      {totalCount > listLimit && (
        <p className="text-xs text-amber-600">
          Mostrando os primeiros {listLimit} de {totalCount} produtos comissionados.
        </p>
      )}

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrar por nome..."
        className="max-w-sm"
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-100">
          {visibleProducts.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              {products.length === 0
                ? "Nenhum produto comissionado."
                : "Nenhum produto encontrado com esse filtro."}
            </p>
          )}
          {visibleProducts.map((product) => (
            <label
              key={product.id}
              className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50"
            >
              <span className="flex items-center gap-3">
                <Checkbox
                  checked={!uncheckedIds.has(product.id)}
                  disabled={!canEditCommission}
                  onChange={() => toggle(product.id)}
                />
                <span className="text-slate-800">{product.name}</span>
              </span>
              <span className="text-slate-500">{formatBRL(product.salePrice)}</span>
            </label>
          ))}
        </div>
      </div>

      {canEditCommission && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={isPending || uncheckedIds.size === 0}
            onClick={handleSave}
            fullWidth={false}
            className="px-6"
          >
            Salvar
          </Button>
          {uncheckedIds.size > 0 && (
            <span className="text-sm text-slate-500">
              {uncheckedIds.size} produto(s) vão perder a comissão ao salvar.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
