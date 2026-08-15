"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";
import {
  searchProductsForConvenioDiscountAction,
  setConvenioProductDiscountAction,
  type ConvenioDiscountProductOption,
} from "../actions";

export type ConvenioDiscountRow = { productId: string; name: string; discountAmount: number };

/**
 * Produtos com desconto exclusivo no site pra colaboradores deste convênio —
 * mesmo padrão de busca+lista de Produtos Comissionados: busca por nome,
 * define o valor em R$ na hora, lista abaixo mostra o que já está selecionado.
 */
export function ProdutosDescontoPicker({
  convenioId,
  initialProducts,
}: {
  convenioId: string;
  initialProducts: ConvenioDiscountRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [products, setProducts] = useState(initialProducts);

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ConvenioDiscountProductOption[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const query = search.trim();
    const timeout = window.setTimeout(() => {
      if (query.length < 2) {
        setSearchResults([]);
        return;
      }
      searchProductsForConvenioDiscountAction(convenioId, query).then(setSearchResults);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search, convenioId]);

  function amountFor(product: ConvenioDiscountProductOption) {
    return amounts[product.id] ?? (product.discountAmount > 0 ? String(product.discountAmount) : "");
  }

  function save(product: ConvenioDiscountProductOption) {
    const raw = amountFor(product).replace(",", ".").trim();
    const amount = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(amount) || amount < 0) {
      setFeedback({ type: "error", message: "Informe um valor válido." });
      return;
    }
    setSavingId(product.id);
    setFeedback(undefined);
    startTransition(async () => {
      const result = await setConvenioProductDiscountAction(convenioId, product.id, amount);
      setSavingId(null);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: result?.success ?? "Desconto atualizado." });
      setSearchResults((current) =>
        current.map((p) => (p.id === product.id ? { ...p, discountAmount: amount } : p))
      );
      setProducts((current) => {
        if (amount > 0) {
          const rest = current.filter((p) => p.productId !== product.id);
          return [...rest, { productId: product.id, name: product.name, discountAmount: amount }].sort(
            (a, b) => a.name.localeCompare(b.name)
          );
        }
        return current.filter((p) => p.productId !== product.id);
      });
      router.refresh();
    });
  }

  function removeRow(row: ConvenioDiscountRow) {
    setSavingId(row.productId);
    setFeedback(undefined);
    startTransition(async () => {
      const result = await setConvenioProductDiscountAction(convenioId, row.productId, 0);
      setSavingId(null);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setProducts((current) => current.filter((p) => p.productId !== row.productId));
      setSearchResults((current) =>
        current.map((p) => (p.id === row.productId ? { ...p, discountAmount: 0 } : p))
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produto pelo nome..."
          className="max-w-sm"
        />
        {search.trim().length >= 2 && (
          <div className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
            {searchResults.length === 0 && (
              <p className="px-3 py-3 text-sm text-slate-400">Nenhum produto encontrado.</p>
            )}
            {searchResults.map((product) => (
              <div
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div>
                  <span className="text-slate-800">{product.name}</span>
                  <span className="ml-2 text-xs text-slate-400">{formatBRL(product.salePrice)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">R$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountFor(product)}
                    onChange={(e) =>
                      setAmounts((current) => ({ ...current, [product.id]: e.target.value }))
                    }
                    placeholder="0,00"
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth={false}
                    disabled={savingId === product.id}
                    onClick={() => save(product)}
                    className="px-3 py-1 text-xs"
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">
          Produtos com desconto exclusivo ({products.length})
        </p>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {products.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                Nenhum produto com desconto exclusivo ainda.
              </p>
            )}
            {products.map((row) => (
              <div key={row.productId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-slate-800">{row.name}</span>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-medium text-emerald-700">-{formatBRL(row.discountAmount)}</span>
                  <button
                    type="button"
                    disabled={savingId === row.productId}
                    onClick={() => removeRow(row)}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
