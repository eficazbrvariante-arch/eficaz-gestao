"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { clsx } from "@/lib/clsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormBanner } from "@/components/ui/form-banner";
import { searchProductsAction, createSaleAction, type PdvProduct } from "./actions";
import { searchCustomersAction } from "../clientes/actions";
import { SellerPickerModal } from "./seller-picker-modal";

type CartLine = {
  /** Identidade da linha no carrinho: produto + variação. */
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  stockQty: number;
};

type PaymentMethod = "CASH" | "PIX" | "DEBIT" | "CREDIT" | "STORE_CREDIT" | "FIADO";

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT: "Cartão de débito",
  CREDIT: "Cartão de crédito",
  STORE_CREDIT: "Crédito de loja",
  FIADO: "Fiado",
};

type PaymentLine = { id: number; method: PaymentMethod; amount: number };

type CustomerOption = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  creditBalance: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function PdvScreen({
  canDiscount,
  canFiado,
}: {
  canDiscount: boolean;
  /** Só ADMIN — nem Gerente vende fiado (ver `canManageFiado`). */
  canFiado: boolean;
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PdvProduct[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const [customerTerm, setCustomerTerm] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [customer, setCustomer] = useState<CustomerOption | null>(null);

  const [payments, setPayments] = useState<PaymentLine[]>([
    { id: 1, method: "CASH", amount: 0 },
  ]);
  const [cashReceived, setCashReceived] = useState<number | "">("");
  const [fiadoDueDate, setFiadoDueDate] = useState("");

  // Vendedor da venda: nunca inferido de quem operou o caixa — é sempre
  // escolhido explicitamente aqui, e revalidado no servidor em
  // `createSaleAction`. Enquanto não houver um vendedor, a seção de
  // pagamento fica desabilitada (ver `availableMethods`/inputs abaixo).
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [sellerName, setSellerName] = useState<string | null>(null);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);

  // Aviso de sucesso depois de finalizar uma venda — o PDV fica pronto pra
  // próxima venda na hora, sem navegar pra página do comprovante; este
  // banner só oferece o link de impressão pra quem precisar dele.
  const [lastSale, setLastSale] = useState<{
    saleId: string;
    number: number;
    changeAmount: number;
  } | null>(null);

  // Sugestões em tempo real conforme o operador digita (busca parcial pelo
  // nome). Separado do Enter/leitor de código de barras, que continua
  // adicionando direto quando casa exatamente com um código.
  useEffect(() => {
    const query = term.trim();

    const timeout = window.setTimeout(() => {
      if (query.length < 2) {
        setResults([]);
        setSuggestionsOpen(false);
        return;
      }
      startTransition(async () => {
        const { products } = await searchProductsAction(query);
        setResults(products);
        setSuggestionsOpen(true);
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [term]);

  // Fecha a lista de sugestões ao clicar fora do campo de busca.
  useEffect(() => {
    if (!suggestionsOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setSuggestionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [suggestionsOpen]);

  const subtotal = round2(cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const total = round2(Math.max(0, subtotal - discount));

  // Com uma única forma de pagamento o valor é sempre o total da venda (derivado, não
  // guardado em estado). Ao dividir o pagamento, cada linha passa a ter valor explícito.
  const isSplit = payments.length > 1;
  const effectivePayments = isSplit
    ? payments
    : [{ ...payments[0], amount: total }];

  const paid = round2(effectivePayments.reduce((sum, p) => sum + (p.amount || 0), 0));
  const remaining = round2(total - paid);
  const cashPortion = round2(
    effectivePayments
      .filter((p) => p.method === "CASH")
      .reduce((sum, p) => sum + (p.amount || 0), 0)
  );
  const storeCreditPortion = round2(
    effectivePayments
      .filter((p) => p.method === "STORE_CREDIT")
      .reduce((sum, p) => sum + (p.amount || 0), 0)
  );
  const fiadoPortion = round2(
    effectivePayments.filter((p) => p.method === "FIADO").reduce((sum, p) => sum + (p.amount || 0), 0)
  );
  const change =
    cashPortion > 0 && cashReceived !== "" ? round2(Number(cashReceived) - cashPortion) : 0;

  const availableMethods = (Object.keys(METHOD_LABELS) as PaymentMethod[]).filter((method) => {
    if (method === "STORE_CREDIT") return customer && customer.creditBalance > 0;
    if (method === "FIADO") return canFiado && customer;
    return true;
  });

  function addToCart(product: PdvProduct, variantId: string | null) {
    const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined;
    const key = `${product.id}:${variantId ?? ""}`;
    const unitPrice = round2(product.price + (variant?.priceAdjustment ?? 0));
    const availableStock = variant ? variant.stockQty : product.stockQty;

    setError(undefined);
    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) =>
          line.key === key ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [
        ...current,
        {
          key,
          productId: product.id,
          variantId: variantId ?? null,
          name: variant ? `${product.name} (${variant.name})` : product.name,
          unitPrice,
          quantity: 1,
          stockQty: availableStock,
        },
      ];
    });

    setTerm("");
    setResults([]);
    setSuggestionsOpen(false);
    searchRef.current?.focus();
  }

  function runSearch() {
    const query = term.trim();
    if (!query) return;
    setSearching(true);
    startTransition(async () => {
      const { products, exact } = await searchProductsAction(query);
      setSearching(false);
      if (exact && products.length === 1 && products[0].variants.length === 0) {
        addToCart(products[0], null);
      } else if (products.length === 0) {
        setError(`Nenhum produto encontrado para "${query}".`);
        setResults([]);
        setSuggestionsOpen(false);
      } else {
        setError(undefined);
        setResults(products);
        setSuggestionsOpen(true);
      }
    });
  }

  function changeQuantity(key: string, quantity: number) {
    setCart((current) =>
      current.map((line) => (line.key === key ? { ...line, quantity: Math.max(1, quantity) } : line))
    );
  }

  function removeLine(key: string) {
    setCart((current) => current.filter((line) => line.key !== key));
  }

  function searchCustomers() {
    const query = customerTerm.trim();
    if (query.length < 2) return;
    startTransition(async () => {
      setCustomerResults(await searchCustomersAction(query));
    });
  }

  function updatePayment(id: number, patch: Partial<PaymentLine>) {
    setPayments((current) => current.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addPaymentLine() {
    setPayments((current) => {
      // Ao sair do modo "pagamento único", a primeira linha passa a carregar o total
      // explicitamente, para o operador redistribuir os valores manualmente.
      const base =
        current.length === 1 ? [{ ...current[0], amount: total }] : current;
      return [
        ...base,
        {
          id: Math.max(0, ...base.map((p) => p.id)) + 1,
          method: "PIX",
          amount: 0,
        },
      ];
    });
  }

  function removePaymentLine(id: number) {
    setPayments((current) =>
      current.length === 1 ? current : current.filter((p) => p.id !== id)
    );
  }

  function finalizeSale() {
    setError(undefined);

    if (cart.length === 0) {
      setError("Adicione pelo menos um produto.");
      return;
    }
    if (!sellerId) {
      setSellerModalOpen(true);
      return;
    }
    if (Math.abs(remaining) > 0.005) {
      setError(
        remaining > 0
          ? `Falta distribuir ${formatBRL(remaining)} nas formas de pagamento.`
          : `Os pagamentos excedem o total em ${formatBRL(Math.abs(remaining))}.`
      );
      return;
    }
    if (cashPortion > 0 && cashReceived !== "" && Number(cashReceived) < cashPortion) {
      setError("O valor recebido em dinheiro é menor que a parcela em espécie.");
      return;
    }
    if (storeCreditPortion > 0 && (!customer || storeCreditPortion > customer.creditBalance + 0.005)) {
      setError(
        `Crédito de loja insuficiente. Saldo disponível: ${formatBRL(customer?.creditBalance ?? 0)}.`
      );
      return;
    }
    if (fiadoPortion > 0 && !customer) {
      setError("Selecione um cliente para vender fiado.");
      return;
    }
    if (fiadoPortion > 0 && !fiadoDueDate) {
      setError("Informe a data prevista de pagamento do fiado.");
      return;
    }

    startTransition(async () => {
      const result = await createSaleAction({
        customerId: customer?.id ?? "",
        sellerId,
        items: cart.map((line) => ({
          productId: line.productId,
          variantId: line.variantId ?? "",
          quantity: line.quantity,
        })),
        discount,
        payments: effectivePayments
          .filter((p) => p.amount > 0)
          .map((p) => ({ method: p.method, amount: p.amount })),
        cashReceived: cashReceived === "" ? undefined : Number(cashReceived),
        fiadoDueDate: fiadoPortion > 0 ? fiadoDueDate : undefined,
      });

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("saleId" in result) {
        // Atualiza os dados vindos do servidor (ex.: "Vendas neste caixa" no
        // topo da página) sem desmontar o PDV — o estado abaixo é resetado
        // manualmente, na hora, pra já deixar pronto pra próxima venda.
        router.refresh();

        setLastSale({
          saleId: result.saleId,
          number: result.number,
          changeAmount: Number(result.changeAmount),
        });

        setCart([]);
        setDiscount(0);
        setError(undefined);
        setCustomer(null);
        setCustomerTerm("");
        setCustomerResults([]);
        setPayments([{ id: 1, method: "CASH", amount: 0 }]);
        setCashReceived("");
        setFiadoDueDate("");
        setSellerId(null);
        setSellerName(null);

        searchRef.current?.focus();
      }
    });
  }

  return (
    <div>
      {lastSale && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>
            Venda #{lastSale.number} registrada com sucesso.
            {lastSale.changeAmount > 0 && (
              <strong className="ml-1">Troco: {formatBRL(lastSale.changeAmount)}</strong>
            )}
          </span>
          <div className="flex items-center gap-3">
            <Link href={`/vendas/${lastSale.saleId}`} target="_blank" className="font-medium underline">
              Imprimir comprovante
            </Link>
            <button
              type="button"
              onClick={() => setLastSale(null)}
              className="text-emerald-700 hover:text-emerald-900"
              aria-label="Fechar aviso"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Coluna esquerda: busca e carrinho */}
        <div className="lg:col-span-3">
        <div ref={searchBoxRef} className="relative mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <Label htmlFor="pdv-search">Produto (nome, código interno ou código de barras)</Label>
          <div className="flex gap-2">
            <Input
              id="pdv-search"
              ref={searchRef}
              autoFocus
              autoComplete="off"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onFocus={() => {
                if (results.length > 0) setSuggestionsOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
                if (e.key === "Escape") {
                  setSuggestionsOpen(false);
                }
              }}
              placeholder="Passe o leitor de código de barras ou digite o nome do produto"
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              onClick={runSearch}
              variant="secondary"
              fullWidth={false}
              className="shrink-0 px-4"
            >
              {searching ? "Buscando..." : "Buscar"}
            </Button>
          </div>

          {/* Sugestões em tempo real: atualiza a cada tecla digitada (busca parcial
              pelo nome) e some quando o campo esvazia ou uma opção é escolhida. */}
          {suggestionsOpen && results.length > 0 && (
            <div className="absolute inset-x-4 top-full z-20 mt-1 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
              {results.map((product) => {
                const hasVariants = product.variants.length > 0;
                return (
                  <div
                    key={product.id}
                    role={hasVariants ? undefined : "button"}
                    tabIndex={hasVariants ? undefined : 0}
                    onClick={hasVariants ? undefined : () => addToCart(product, null)}
                    onKeyDown={
                      hasVariants
                        ? undefined
                        : (e) => {
                            if (e.key === "Enter") addToCart(product, null);
                          }
                    }
                    className={clsx("p-3", !hasVariants && "cursor-pointer hover:bg-slate-50")}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-[9px] text-slate-400">sem foto</span>
                        )}
                      </div>
                      <div className="min-w-[140px] flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {product.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {product.internalCode ?? "sem código"} · estoque {product.stockQty}
                        </p>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-3">
                        <span className="text-sm text-slate-900">{formatBRL(product.price)}</span>
                        {!hasVariants && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(product, null);
                            }}
                            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                          >
                            Adicionar
                          </button>
                        )}
                      </div>
                    </div>

                    {hasVariants && (
                      <div className="mt-2 flex flex-wrap gap-2 pl-14">
                        {product.variants.map((variant) => (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => addToCart(product, variant.id)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            {variant.name} · {formatBRL(product.price + variant.priceAdjustment)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
            Carrinho ({cart.length} {cart.length === 1 ? "item" : "itens"})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {cart.map((line) => (
                  <tr key={line.key} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{line.name}</p>
                      <p className="text-xs text-slate-400">
                        {formatBRL(line.unitPrice)} · estoque {line.stockQty}
                      </p>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => changeQuantity(line.key, line.quantity - 1)}
                          className="h-7 w-7 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => changeQuantity(line.key, Number(e.target.value))}
                          className="h-7 w-14 rounded border border-slate-300 px-1 text-center"
                        />
                        <button
                          type="button"
                          onClick={() => changeQuantity(line.key, line.quantity + 1)}
                          className="h-7 w-7 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatBRL(line.unitPrice * line.quantity)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
                {cart.length === 0 && (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-400">
                      Nenhum item no carrinho. Busque um produto acima para começar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Coluna direita: cliente, totais e pagamento */}
      <div className="lg:col-span-2">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Label htmlFor="pdv-customer">Cliente (opcional)</Label>
            {customer ? (
              <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">{customer.name}</p>
                  <p className="text-xs text-slate-400">
                    {customer.document ?? customer.phone ?? "sem documento"}
                  </p>
                  {customer.creditBalance > 0 && (
                    <p className="text-xs font-medium text-emerald-700">
                      Crédito disponível: {formatBRL(customer.creditBalance)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCustomer(null);
                    setPayments((current) =>
                      current.map((p) =>
                        p.method === "STORE_CREDIT" || p.method === "FIADO"
                          ? { ...p, method: "CASH" }
                          : p
                      )
                    );
                  }}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remover
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    id="pdv-customer"
                    autoComplete="off"
                    value={customerTerm}
                    onChange={(e) => setCustomerTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchCustomers();
                      }
                    }}
                    placeholder="Nome, CPF/CNPJ ou telefone"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={searchCustomers}
                    fullWidth={false}
                    className="shrink-0 px-3"
                  >
                    Buscar
                  </Button>
                </div>
                {customerResults.length > 0 && (
                  <div className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCustomer(c);
                          setCustomerResults([]);
                          setCustomerTerm("");
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-900">{c.name}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {c.document ?? c.phone ?? ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatBRL(subtotal)}</span>
              </div>
              {canDiscount ? (
                <div className="flex items-center justify-between gap-2 py-1">
                  <span className="text-slate-600">Desconto (R$)</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={subtotal}
                    value={discount || ""}
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="h-8 w-28 rounded border border-slate-300 px-2 text-right text-sm"
                  />
                </div>
              ) : (
                discount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Desconto</span>
                    <span>-{formatBRL(discount)}</span>
                  </div>
                )
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-semibold text-slate-900">
                <span>Total</span>
                <span>{formatBRL(total)}</span>
              </div>
            </div>

            <div className="mb-3">
              <Label className="mb-1">Vendedor</Label>
              {sellerName ? (
                <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                  <span className="text-sm font-medium text-slate-900">{sellerName}</span>
                  <button
                    type="button"
                    onClick={() => setSellerModalOpen(true)}
                    className="text-xs font-medium text-slate-700 hover:underline"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <Button type="button" variant="secondary" onClick={() => setSellerModalOpen(true)}>
                  Selecionar vendedor
                </Button>
              )}
            </div>

            {/* A seleção do vendedor acontece antes da forma de pagamento: sem
                vendedor escolhido, os campos abaixo ficam desabilitados. */}
            <div className="mb-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="mb-0">Formas de pagamento</Label>
                <button
                  type="button"
                  onClick={addPaymentLine}
                  disabled={!sellerId}
                  className="text-xs font-medium text-slate-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
                >
                  + Dividir pagamento
                </button>
              </div>

              {effectivePayments.map((payment) => (
                <div key={payment.id} className="flex gap-2">
                  <Select
                    value={payment.method}
                    disabled={!sellerId}
                    onChange={(e) =>
                      updatePayment(payment.id, { method: e.target.value as PaymentMethod })
                    }
                  >
                    {availableMethods.map((method) => (
                      <option key={method} value={method}>
                        {METHOD_LABELS[method]}
                      </option>
                    ))}
                  </Select>
                  {isSplit ? (
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      disabled={!sellerId}
                      value={payment.amount || ""}
                      onChange={(e) =>
                        updatePayment(payment.id, { amount: Number(e.target.value) || 0 })
                      }
                      className="w-28 shrink-0 rounded-md border border-slate-300 px-2 text-right text-sm disabled:bg-slate-50"
                    />
                  ) : (
                    <div className="flex w-28 shrink-0 items-center justify-end rounded-md bg-slate-50 px-2 text-sm font-medium text-slate-900">
                      {formatBRL(payment.amount)}
                    </div>
                  )}
                  {isSplit && (
                    <button
                      type="button"
                      onClick={() => removePaymentLine(payment.id)}
                      className="shrink-0 text-xs text-red-600 hover:underline"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              {sellerId && Math.abs(remaining) > 0.005 && (
                <p className={remaining > 0 ? "text-xs text-amber-600" : "text-xs text-red-600"}>
                  {remaining > 0
                    ? `Falta distribuir ${formatBRL(remaining)}`
                    : `Excede o total em ${formatBRL(Math.abs(remaining))}`}
                </p>
              )}
            </div>

            {fiadoPortion > 0 && (
              <div className="mb-3 rounded-md bg-amber-50 p-3">
                <Label htmlFor="fiado-due-date">Data prevista de pagamento (fiado)</Label>
                <input
                  id="fiado-due-date"
                  type="date"
                  disabled={!sellerId}
                  value={fiadoDueDate}
                  onChange={(e) => setFiadoDueDate(e.target.value)}
                  className="h-9 w-full rounded border border-slate-300 px-2 text-sm disabled:bg-slate-50"
                />
              </div>
            )}

            {cashPortion > 0 && (
              <div className="mb-3 rounded-md bg-slate-50 p-3">
                <Label htmlFor="cash-received">Valor recebido em dinheiro (R$)</Label>
                <input
                  id="cash-received"
                  type="number"
                  step="0.01"
                  min={0}
                  disabled={!sellerId}
                  value={cashReceived}
                  onChange={(e) =>
                    setCashReceived(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder={String(cashPortion.toFixed(2))}
                  className="mb-2 h-9 w-full rounded border border-slate-300 px-2 text-right text-sm disabled:bg-slate-50"
                />
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-slate-700">Troco</span>
                  <span className={change < 0 ? "text-red-600" : "text-emerald-700"}>
                    {formatBRL(Math.max(0, change))}
                  </span>
                </div>
              </div>
            )}

            <FormBanner message={error} variant="error" />

            <Button
              type="button"
              onClick={finalizeSale}
              disabled={isPending || cart.length === 0}
              className="py-3 text-base"
            >
              {isPending ? "Finalizando..." : `Finalizar venda · ${formatBRL(total)}`}
            </Button>
          </div>
        </div>
      </div>

      <SellerPickerModal
        open={sellerModalOpen}
        onClose={() => setSellerModalOpen(false)}
        onSelect={(seller) => {
          setSellerId(seller.id);
          setSellerName(seller.name);
          setSellerModalOpen(false);
        }}
      />
      </div>
    </div>
  );
}
