"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { clsx } from "@/lib/clsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormBanner } from "@/components/ui/form-banner";
import { MixedPaymentPanel, type PaymentPanelSlot } from "@/components/payments/mixed-payment-panel";
import {
  PAYMENT_SLOTS,
  EMPTY_PAYMENT_AMOUNTS,
  type PaymentSlotKey,
  type PaymentAmounts,
} from "@/lib/payment-slots";
import { searchProductsAction, createSaleAction, type PdvProduct } from "./actions";
import { searchCustomersAction } from "../clientes/actions";
import { SellerPickerModal } from "./seller-picker-modal";
import { ConvenioModal } from "./convenio-modal";
import type { ConvenioCredential } from "@/modules/convenios/convenio-redemption-service";
import {
  allocateSellerDiscountBudget,
  getSellerDiscountRule,
  isCapinhaCategory,
} from "@/lib/seller-discount-rules";

type CartLine = {
  /** Identidade da linha no carrinho: produto + variação. */
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  stockQty: number;
  /** Desconto (R$) concedido só neste item — não existe mais desconto na nota inteira. */
  discount: number;
  /** Nome da categoria — usado só pra detectar capinha no carrinho (ver `seller-discount-rules.ts`). */
  categoryName: string | null;
};

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
  canDiscountFreely,
  canFiado,
  autoPrintReceipt,
}: {
  canDiscount: boolean;
  /** Só ADMIN — a trava de capinha na película (ver `seller-discount-rules.ts`) vale até pro Gerente. */
  canDiscountFreely: boolean;
  /** Só ADMIN — nem Gerente vende fiado (ver `canManageFiado`). */
  canFiado: boolean;
  /** Config da empresa (Configurações > PDV: impressão) — dispara a impressão
   *  do cupom sozinha ao finalizar, sem sair do PDV (ver `printSaleId`). */
  autoPrintReceipt: boolean;
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PdvProduct[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState<string>();
  const [discountNotice, setDiscountNotice] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const [customerTerm, setCustomerTerm] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [customer, setCustomer] = useState<CustomerOption | null>(null);

  const [amounts, setAmounts] = useState<PaymentAmounts>(EMPTY_PAYMENT_AMOUNTS);
  const [cashReceived, setCashReceived] = useState<number | "">("");
  const [fiadoDueDate, setFiadoDueDate] = useState("");

  // Vendedor da venda: nunca inferido de quem operou o caixa — é sempre
  // escolhido explicitamente aqui, e revalidado no servidor em
  // `createSaleAction`. Enquanto não houver um vendedor, a seção de
  // pagamento fica desabilitada (ver os `disabled={!sellerId}` abaixo).
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [sellerName, setSellerName] = useState<string | null>(null);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);

  // Benefício de Convênio Corporativo — nunca escolhido/digitado como valor
  // pelo vendedor, só o resultado já validado do QR (ver `ConvenioModal`).
  // Some do carrinho se o vendedor remover, e a venda é revalidada de novo
  // no servidor no momento de fechar (ver `revalidateConvenioMember`).
  const [convenioMember, setConvenioMember] = useState<ConvenioCredential | null>(null);
  const [convenioModalOpen, setConvenioModalOpen] = useState(false);

  // Aviso de sucesso depois de finalizar uma venda — o PDV fica pronto pra
  // próxima venda na hora, sem navegar pra página do comprovante; este
  // banner só oferece o link de impressão pra quem precisar dele.
  const [lastSale, setLastSale] = useState<{
    saleId: string;
    number: number;
    changeAmount: number;
  } | null>(null);

  // Id da venda a imprimir sozinha, via iframe invisível carregando o
  // comprovante (que já dispara `window.print()` sozinho quando
  // `autoPrintReceipt` está ligado — ver `AutoPrint` em `vendas/[id]`). Assim
  // o cupom sai sem sair do PDV. `key={printSaleId}` força o iframe a
  // recarregar do zero a cada venda nova, então cada uma dispara a impressão
  // de novo mesmo que o id mude rápido.
  const [printSaleId, setPrintSaleId] = useState<string | null>(null);

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
  const discount = round2(cart.reduce((sum, line) => sum + (line.discount || 0), 0));
  // Nunca some com `discount` — o benefício de convênio é separado de
  // propósito (ver nota em `sale-service.ts`), só pra não afetar a comissão.
  const convenioBenefit = convenioMember
    ? round2(Math.min(convenioMember.benefitAmount, Math.max(0, subtotal - discount)))
    : 0;
  const total = round2(Math.max(0, subtotal - discount - convenioBenefit));

  // Desconto de segurança nas películas 3D (ver `seller-discount-rules.ts`):
  // cada capinha no carrinho libera o desconto de uma película — nunca
  // "qualquer quantidade de película com uma capinha só". Vale pra Vendedor
  // e Gerente — só Admin (canDiscountFreely) não passa por essa trava.
  const capinhaUnits = cart.reduce(
    (sum, line) => sum + (isCapinhaCategory(line.categoryName) ? line.quantity : 0),
    0
  );
  const sellerDiscountAllocation = allocateSellerDiscountBudget(cart, capinhaUnits);

  function maxLineDiscount(line: CartLine) {
    const grossTotal = round2(line.unitPrice * line.quantity);
    const rule = getSellerDiscountRule(line.name, line.unitPrice);
    if (rule) {
      if (canDiscountFreely) return grossTotal;
      const allocatedUnits = sellerDiscountAllocation.get(line.key) ?? 0;
      return Math.min(grossTotal, round2(allocatedUnits * rule.maxDiscountPerUnit));
    }
    return canDiscount ? grossTotal : 0;
  }

  // Se o orçamento de capinhas encolher (capinha removida, quantidade
  // reduzida, ou mais película entrando no carrinho do que capinha
  // sustenta), o desconto de película dado por quem não tem desconto livre
  // (Vendedor ou Gerente) se ajusta ao novo teto — durante a renderização
  // (não num efeito, mesmo padrão de `selectionItems` em
  // `produtos-tabela.tsx`: evita um reflow extra). A assinatura só muda
  // quando a composição do carrinho muda de verdade — editar o valor de um
  // desconto já dentro do teto não mexe nela, então não reprocessa à toa a
  // cada tecla digitada.
  const allocationSignature = canDiscountFreely
    ? ""
    : JSON.stringify([...sellerDiscountAllocation.entries()].sort());
  const [syncedAllocationSignature, setSyncedAllocationSignature] = useState(allocationSignature);
  if (!canDiscountFreely && allocationSignature !== syncedAllocationSignature) {
    setSyncedAllocationSignature(allocationSignature);
    const next = cart.map((line) => {
      const rule = getSellerDiscountRule(line.name, line.unitPrice);
      if (!rule) return line;
      const allocatedUnits = sellerDiscountAllocation.get(line.key) ?? 0;
      const cap = round2(Math.min(line.unitPrice * line.quantity, allocatedUnits * rule.maxDiscountPerUnit));
      return line.discount > cap + 0.005 ? { ...line, discount: cap } : line;
    });
    if (next.some((line, i) => line.discount !== cart[i].discount)) {
      setCart(next);
      setDiscountNotice(
        "O desconto de película foi ajustado — cada capinha no carrinho libera o desconto de uma película."
      );
    }
  }

  const paid = round2(PAYMENT_SLOTS.reduce((sum, slot) => sum + (amounts[slot.key] || 0), 0));
  const remaining = round2(total - paid);
  const cashPortion = round2(amounts.cash || 0);
  const storeCreditPortion = round2(amounts.store_credit || 0);
  const fiadoPortion = round2(amounts.fiado || 0);
  const change =
    cashPortion > 0 && cashReceived !== "" ? round2(Number(cashReceived) - cashPortion) : 0;

  const paymentPanelSlots: PaymentPanelSlot[] = PAYMENT_SLOTS.map((slot) => {
    const eligible =
      slot.key === "store_credit"
        ? !!customer && customer.creditBalance > 0
        : slot.key === "fiado"
          ? canFiado && !!customer
          : true;
    return {
      key: slot.key,
      label: slot.label,
      disabled: !eligible,
      disabledReason:
        slot.key === "store_credit"
          ? "Cliente sem crédito de loja disponível"
          : slot.key === "fiado"
            ? "Selecione um cliente elegível para fiado"
            : undefined,
    };
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
          discount: 0,
          categoryName: product.categoryName,
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
      current.map((line) => {
        if (line.key !== key) return line;
        const newQuantity = Math.max(1, quantity);
        // O desconto nunca pode passar do teto da linha — se a quantidade
        // cair, ele é reajustado pra baixo junto.
        const updated = { ...line, quantity: newQuantity };
        return { ...updated, discount: Math.min(line.discount, maxLineDiscount(updated)) };
      })
    );
  }

  function changeDiscount(key: string, discount: number) {
    setCart((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        return { ...line, discount: Math.min(Math.max(0, discount), maxLineDiscount(line)) };
      })
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

  function setPaymentAmount(key: PaymentSlotKey, amount: number) {
    setAmounts((current) => ({ ...current, [key]: amount }));
  }

  /** O campo "Dinheiro" é o valor que o cliente entregou em espécie, não o
   *  valor que sobra pra completar a venda — por isso, se digitar mais do
   *  que falta (ex.: total R$29,99, cliente entrega R$50), a parcela em
   *  dinheiro é travada no que falta e o excedente vira troco automático,
   *  em vez de acusar "excede o total". */
  function setCashAmount(raw: number) {
    const otherPaid = round2(
      PAYMENT_SLOTS.reduce(
        (sum, slot) => sum + (slot.key === "cash" ? 0 : amounts[slot.key] || 0),
        0
      )
    );
    const neededForCash = round2(Math.max(0, total - otherPaid));
    const effectiveCash = Math.min(raw, neededForCash);
    setAmounts((current) => ({ ...current, cash: effectiveCash }));
    setCashReceived(raw > 0 ? raw : "");
  }

  /** Ao selecionar um cliente com crédito de loja, pré-preenche o campo
   *  sozinho (menor valor entre o saldo disponível e o total da venda) —
   *  o vendedor não precisa calcular/digitar, mas pode ajustar depois. */
  function selectCustomer(picked: CustomerOption) {
    setCustomer(picked);
    if (picked.creditBalance > 0) {
      setAmounts((current) => ({
        ...current,
        store_credit: round2(Math.min(picked.creditBalance, total)),
      }));
    }
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
          discount: line.discount,
        })),
        payments: PAYMENT_SLOTS.filter((slot) => amounts[slot.key] > 0).map((slot) => ({
          method: slot.method,
          amount: amounts[slot.key],
        })),
        cashReceived: cashReceived === "" ? undefined : Number(cashReceived),
        fiadoDueDate: fiadoPortion > 0 ? fiadoDueDate : undefined,
        convenioMemberId: convenioMember?.member.id ?? "",
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
        if (autoPrintReceipt) setPrintSaleId(result.saleId);

        setCart([]);
        setError(undefined);
        setCustomer(null);
        setCustomerTerm("");
        setCustomerResults([]);
        setAmounts(EMPTY_PAYMENT_AMOUNTS);
        setCashReceived("");
        setFiadoDueDate("");
        setConvenioMember(null);
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

      {printSaleId && (
        <iframe
          key={printSaleId}
          src={`/vendas/${printSaleId}?nova=1`}
          aria-hidden="true"
          tabIndex={-1}
          style={{ position: "fixed", top: 0, left: "-10000px", width: "380px", height: "600px", border: "none" }}
        />
      )}

      {discountNotice && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-md bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          <span>{discountNotice}</span>
          <button
            type="button"
            onClick={() => setDiscountNotice(undefined)}
            className="text-amber-700 hover:text-amber-900"
            aria-label="Fechar aviso"
          >
            ×
          </button>
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
          {cart.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              Nenhum item no carrinho. Busque um produto acima para começar.
            </p>
          ) : (
            // Cada item é um bloco empilhado, não uma linha de tabela — numa
            // tela mais estreita ou com nome de produto grande, uma tabela de
            // 5 colunas passava da largura disponível e o botão Remover
            // (última coluna) ficava fora da área visível, só alcançável
            // rolando pro lado. Em blocos não existe rolagem horizontal
            // possível: o conteúdo sempre quebra linha, e Remover fica fixo
            // no canto do item, sempre visível.
            <div className="divide-y divide-slate-100">
              {cart.map((line) => (
                <div key={line.key} className="relative p-4">
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    aria-label={`Remover ${line.name}`}
                    title="Remover"
                    className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    ×
                  </button>

                  <p className="max-w-[calc(100%-2.5rem)] text-base font-bold text-black">
                    {line.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatBRL(line.unitPrice)} · estoque {line.stockQty}
                  </p>

                  <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="mb-1 text-xs font-medium text-slate-500">Quantidade</p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => changeQuantity(line.key, line.quantity - 1)}
                          className="h-8 w-8 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => changeQuantity(line.key, Number(e.target.value))}
                          className="money-input h-8 w-14 rounded border border-slate-300 px-1 text-center"
                        />
                        <button
                          type="button"
                          onClick={() => changeQuantity(line.key, line.quantity + 1)}
                          className="h-8 w-8 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {(() => {
                      const cap = maxLineDiscount(line);
                      const sellerRule =
                        !canDiscountFreely && getSellerDiscountRule(line.name, line.unitPrice);
                      if (!canDiscount && !sellerRule) return null;
                      const blockedBySellerRule = Boolean(sellerRule) && cap === 0;
                      const blockedReason =
                        capinhaUnits === 0
                          ? "precisa de capinha no carrinho"
                          : "capinha já usada em outra película";
                      return (
                        <div>
                          <p className="mb-1 text-xs font-medium text-slate-500">Desconto</p>
                          <div className="relative w-24">
                            <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-slate-500">
                              R$
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              max={cap}
                              disabled={paid > 0 || blockedBySellerRule}
                              title={
                                blockedBySellerRule
                                  ? `${blockedReason} — cada capinha libera o desconto de uma película`
                                  : paid > 0
                                    ? "Zere as formas de pagamento para alterar o desconto"
                                    : `Desconto máximo neste item: ${formatBRL(cap)}`
                              }
                              placeholder="0,00"
                              value={line.discount || ""}
                              onChange={(e) =>
                                changeDiscount(line.key, Math.max(0, Number(e.target.value) || 0))
                              }
                              className="money-input h-8 w-full rounded border border-slate-300 py-1 pl-7 pr-1 text-right text-xs disabled:bg-slate-50 disabled:text-slate-400"
                            />
                          </div>
                          {blockedBySellerRule && (
                            <p className="mt-0.5 max-w-[6rem] text-[10px] leading-tight text-amber-600">
                              {blockedReason}
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    <div className="text-right">
                      <p className="mb-1 text-xs font-medium text-slate-500">Total</p>
                      <p className="text-lg font-bold text-black">
                        {formatBRL(round2(line.unitPrice * line.quantity - line.discount))}
                      </p>
                      {line.discount > 0 && (
                        <p className="text-xs font-normal text-slate-500">
                          Desconto aplicado nesta linha: -{formatBRL(line.discount)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Coluna direita: cliente, totais e pagamento */}
      <div className="lg:col-span-2">
        <div className="space-y-4">
          {/* Ordem fixa da lateral: Cliente → Vendedor → Total → Forma de
              pagamento → Finalizar. */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Label htmlFor="pdv-customer" className="text-sm font-bold text-black">
              Cliente (opcional)
            </Label>
            {customer ? (
              <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-base font-bold text-black">{customer.name}</p>
                  <p className="text-xs text-slate-500">
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
                    setAmounts((current) => ({
                      ...current,
                      cash: round2(current.cash + current.store_credit + current.fiado),
                      store_credit: 0,
                      fiado: 0,
                    }));
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
                          selectCustomer(c);
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
            <Label className="mb-1 text-sm font-bold text-black">Vendedor</Label>
            {sellerName ? (
              <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                <span className="text-base font-bold text-black">{sellerName}</span>
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

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Label className="mb-1 text-sm font-bold text-black">Convênio corporativo</Label>
            {convenioMember ? (
              <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2">
                <div>
                  <span className="block text-sm font-bold text-black">{convenioMember.member.name}</span>
                  <span className="text-xs text-slate-500">Convênio {convenioMember.convenio.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setConvenioMember(null)}
                  className="text-xs font-medium text-slate-700 hover:underline"
                >
                  Remover
                </button>
              </div>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setConvenioModalOpen(true)}>
                Escanear QR do convênio
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="space-y-1.5 text-base">
              <div className="flex justify-between font-medium text-slate-700">
                <span>Subtotal</span>
                <span className="font-bold text-black">{formatBRL(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between font-medium text-slate-700">
                  <span>Desconto (nos itens)</span>
                  <span className="font-bold text-black">-{formatBRL(discount)}</span>
                </div>
              )}
              {convenioBenefit > 0 && (
                <div className="flex justify-between font-medium text-slate-700">
                  <span>Benefício convênio</span>
                  <span className="font-bold text-black">-{formatBRL(convenioBenefit)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-xl font-bold text-black">
                <span>Total</span>
                <span>{formatBRL(total)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {/* A seleção do vendedor acontece antes da forma de pagamento: sem
                vendedor escolhido, o painel abaixo fica desabilitado. */}
            <div className="mb-3">
              <MixedPaymentPanel
                slots={paymentPanelSlots}
                amounts={amounts}
                total={total}
                disabled={!sellerId}
                onChangeAmount={(key, value) => {
                  const slotKey = key as PaymentSlotKey;
                  if (slotKey === "cash") {
                    setCashAmount(value);
                  } else {
                    setPaymentAmount(slotKey, value);
                  }
                }}
              />

              {sellerId && remaining < -0.005 && (
                <p className="mt-2 text-xs text-red-600">
                  Excede o total em {formatBRL(Math.abs(remaining))}
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
                <Label htmlFor="cash-received" className="mb-1">
                  Calcular troco
                </Label>
                <div className="relative mb-2">
                  <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm text-slate-500">
                    R$
                  </span>
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
                    className="money-input h-9 w-full rounded border border-slate-300 py-1 pl-8 pr-2 text-right text-sm disabled:bg-slate-50"
                  />
                </div>
                <div className="flex justify-between text-base font-bold">
                  <span className="text-black">Troco</span>
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

      <ConvenioModal
        open={convenioModalOpen}
        onClose={() => setConvenioModalOpen(false)}
        onConfirm={(credential) => {
          setConvenioMember(credential);
          setConvenioModalOpen(false);
        }}
      />

      </div>
    </div>
  );
}
