"use client";

import Link from "next/link";
import { useCart } from "@/modules/catalog/cart-context";
import { formatBRL } from "@/lib/format";

export function CartView({ base }: { base: string }) {
  const { items, subtotal, itemCount, ready, setQuantity, removeItem, clear } = useCart();

  if (!ready) {
    return <p className="text-sm text-slate-400">Carregando carrinho...</p>;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
        <p className="text-slate-600">Seu carrinho está vazio.</p>
        <Link
          href={`${base}/produtos`}
          className="mt-4 inline-block rounded-md px-5 py-2.5 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--store-primary)" }}
        >
          Ver produtos
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
          {items.map((line) => (
            <li key={line.key} className="flex gap-4 p-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-50">
                {line.imageUrl ? (
                  // URL cadastrada pela empresa; domínio desconhecido em build time.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={line.imageUrl}
                    alt={line.name}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    sem foto
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={`${base}/produto/${line.productId}`}
                  className="text-sm font-medium text-slate-900 hover:underline"
                >
                  {line.name}
                </Link>
                {line.variantName && (
                  <p className="text-xs text-slate-500">{line.variantName}</p>
                )}
                <p className="mt-1 text-sm text-slate-600">{formatBRL(line.unitPrice)} cada</p>

                <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setQuantity(line.key, line.quantity - 1)}
                      className="h-8 w-8 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                      aria-label="Diminuir quantidade"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={line.stockQty}
                      value={line.quantity}
                      onChange={(e) => setQuantity(line.key, Number(e.target.value) || 1)}
                      className="h-8 w-14 rounded border border-slate-300 px-1 text-center text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity(line.key, line.quantity + 1)}
                      className="h-8 w-8 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                      aria-label="Aumentar quantidade"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(line.key)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remover
                  </button>
                  {line.quantity >= line.stockQty && (
                    <span className="text-xs text-amber-600">
                      quantidade máxima disponível atingida
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right text-sm font-semibold text-slate-900">
                {formatBRL(line.unitPrice * line.quantity)}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-4">
          <Link href={`${base}/produtos`} className="text-sm text-slate-600 hover:underline">
            Continuar comprando
          </Link>
          <button
            type="button"
            onClick={clear}
            className="text-sm text-red-600 hover:underline"
          >
            Esvaziar carrinho
          </button>
        </div>
      </div>

      <aside className="lg:col-span-1">
        <div className="rounded-xl border border-slate-200 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Resumo do pedido</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>
                {itemCount} {itemCount === 1 ? "item" : "itens"}
              </span>
              <span>{formatBRL(subtotal)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-semibold text-slate-900">
              <span>Total</span>
              <span>{formatBRL(subtotal)}</span>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            A taxa de entrega é calculada na próxima etapa, conforme a sua região.
          </p>

          <Link
            href={`${base}/checkout`}
            className="mt-4 block w-full rounded-md px-5 py-3 text-center text-sm font-medium text-white"
            style={{ backgroundColor: "var(--store-primary)" }}
          >
            Finalizar pedido
          </Link>
        </div>
      </aside>
    </div>
  );
}
