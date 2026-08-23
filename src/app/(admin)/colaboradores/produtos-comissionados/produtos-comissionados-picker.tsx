"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormBanner } from "@/components/ui/form-banner";
import {
  bulkRemoveProductCommissionAction,
  searchCommissionProductsAction,
  setProductCommissionEnabledAction,
  type CommissionProductOption,
} from "../actions";

type Product = { id: string; name: string; salePrice: number };

/**
 * Busca pra marcar/desmarcar qualquer produto ativo (comissionado ou não) em
 * cima da mesma lista mostrada embaixo — junta num lugar só o que antes
 * ficava dividido entre esta página e o painel de Colaboradores. Desmarcar
 * um só some da lista principal depois de clicar em Salvar (evita remover
 * comissão sem querer com um clique só); já marcar/desmarcar pela busca é
 * imediato, porque é uma ação de um produto só por vez.
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

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<CommissionProductOption[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  useEffect(() => {
    const query = search.trim();
    const timeout = window.setTimeout(() => {
      if (query.length < 2) {
        setSearchResults([]);
        return;
      }
      searchCommissionProductsAction(query).then(setSearchResults);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  function toggleFromSearch(product: CommissionProductOption) {
    const enabled = !product.commissionEnabled;
    setTogglingId(product.id);
    setFeedback(undefined);
    startTransition(async () => {
      const result = await setProductCommissionEnabledAction(product.id, enabled);
      setTogglingId(null);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setSearchResults((current) =>
        current.map((p) => (p.id === product.id ? { ...p, commissionEnabled: enabled } : p))
      );
      // Reflete na lista principal na hora, sem precisar recarregar a
      // página, pra ela continuar sendo o retrato real do que está marcado.
      setProducts((current) => {
        if (enabled) {
          if (current.some((p) => p.id === product.id)) return current;
          return [...current, { id: product.id, name: product.name, salePrice: product.salePrice }].sort(
            (a, b) => a.name.localeCompare(b.name)
          );
        }
        return current.filter((p) => p.id !== product.id);
      });
      setUncheckedIds((current) => {
        if (!current.has(product.id)) return current;
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    });
  }

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

  return (
    <div className="space-y-4">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      {canEditCommission && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-1 text-sm font-semibold text-slate-900">Buscar produto</p>
          <p className="mb-3 text-xs text-slate-500">
            Digite o nome pra marcar ou desmarcar a comissão dele — a lista abaixo mostra tudo que
            já está selecionado, pra você comparar antes de mexer.
          </p>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ex.: película 3D"
            className="max-w-sm"
          />
          {search.trim().length >= 2 && (
            <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
              {searchResults.length === 0 && (
                <p className="px-3 py-3 text-sm text-slate-400">Nenhum produto encontrado.</p>
              )}
              {searchResults.map((product) => (
                <label
                  key={product.id}
                  className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    <Checkbox
                      checked={product.commissionEnabled}
                      disabled={togglingId === product.id}
                      onChange={() => toggleFromSearch(product)}
                    />
                    <span className="text-slate-800">{product.name}</span>
                  </span>
                  <span className="text-slate-500">{formatBRL(product.salePrice)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">
          Já selecionados ({products.length})
        </p>
        {totalCount > listLimit && (
          <p className="mb-2 text-xs text-amber-600">
            Mostrando os primeiros {listLimit} de {totalCount} produtos comissionados.
          </p>
        )}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {products.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                Nenhum produto comissionado.
              </p>
            )}
            {products.map((product) => (
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
