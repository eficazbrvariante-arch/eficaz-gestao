"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  ShoppingCart,
  User,
  UserCog,
  Wallet,
  HandCoins,
  ShieldCheck,
  ClipboardList,
  RefreshCw,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { clsx } from "@/lib/clsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormBanner } from "@/components/ui/form-banner";
import { BarcodeScannerField } from "@/components/ui/barcode-scanner-field";
import { MixedPaymentPanel, type PaymentPanelSlot } from "@/components/payments/mixed-payment-panel";
import {
  PAYMENT_SLOTS,
  EMPTY_PAYMENT_AMOUNTS,
  type PaymentSlotKey,
  type PaymentAmounts,
} from "@/lib/payment-slots";
import { searchProductsAction, createSaleAction, type PdvProduct } from "./actions";
import { CustomerPickerModal, type CustomerOption } from "./customer-picker-modal";
import { SellerPickerModal } from "./seller-picker-modal";
import { ConvenioModal } from "./convenio-modal";
import { ConvenioSignupsModal } from "./convenio-signups-modal";
import { ProtecaoEficazRedemptionModal } from "./protecao-eficaz-redemption-modal";
import { CashMovementModal } from "./cash-movement-modal";
import {
  computeCreditoEficazSurcharge,
  formatSurchargePercent,
} from "@/modules/credito-eficaz/credito-eficaz-surcharge";
import type { ConvenioCredential } from "@/modules/convenios/convenio-redemption-service";
import type { ProtecaoEficazRedemptionCredential } from "@/modules/protecao-eficaz/protecao-eficaz-service";
import {
  allocateSellerDiscountBudget,
  getSellerDiscountRule,
  isCapinhaCategory,
  isPeliculaCategory,
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

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Mesma linguagem visual da Central do Cliente (ícone em badge com gradiente,
 *  cor só no ícone e na borda — nunca no corpo do card inteiro), agora numa
 *  altura de card operacional em vez de painel. */
type PdvChipTone = "neutral" | "credit" | "benefits" | "protection";

const CHIP_TONE_CLASSES: Record<PdvChipTone, { icon: string; activeBorder: string }> = {
  neutral: { icon: "from-slate-300 to-slate-500", activeBorder: "border-slate-400/45" },
  credit: { icon: "from-amber-300 to-amber-600", activeBorder: "border-amber-400/50" },
  benefits: { icon: "from-violet-400 to-violet-600", activeBorder: "border-violet-400/50" },
  protection: { icon: "from-emerald-400 to-emerald-600", activeBorder: "border-emerald-500/50" },
};

/**
 * Card compacto de contexto da venda — Cliente, Vendedor, Caixa, Convênio,
 * Proteção, Troca. Substitui os painéis de ~120px de altura que empilhavam
 * mais de 1200px na lateral do PDV.
 *
 * Duas linhas fixas: o rótulo (o que é) e o estado (como está agora — "Não
 * identificado", "Maiza", "Aberto", "Nenhum"). O detalhe fica no modal que o
 * card abre, nunca na superfície. Altura mínima de 56px de propósito: é
 * compacto sem deixar de ser uma área de toque confortável no balcão.
 */
function PdvChip({
  tone = "neutral",
  icon: Icon,
  label,
  value,
  active = false,
  pending = false,
  badge,
  title,
  asSwitch = false,
  onClick,
  onClear,
  clearLabel,
}: {
  tone?: PdvChipTone;
  icon: React.ComponentType<{ className?: string }>;
  /** O que é — sempre curto, em caixa alta discreta. */
  label: string;
  /** Como está agora — o que o operador lê batendo o olho. */
  value: string;
  /** Já preenchido/escolhido: ganha a borda colorida e o texto forte. */
  active?: boolean;
  /** Falta preencher e isso trava a venda (ex.: vendedor com carrinho cheio). */
  pending?: boolean;
  badge?: React.ReactNode;
  /** Detalhe secundário que saiu da superfície (ver item 6 da reorganização). */
  title?: string;
  /** Liga/desliga em vez de abrir modal (Proteção Eficaz) — vira `role="switch"`. */
  asSwitch?: boolean;
  onClick: () => void;
  onClear?: () => void;
  clearLabel?: string;
}) {
  const t = CHIP_TONE_CLASSES[tone];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        // Um `title` só, no botão: o estado vem primeiro porque pode estar
        // cortado pelo `truncate` numa tela estreita (nome de cliente grande),
        // e aí o valor inteiro só existe aqui. Um segundo `title` no texto de
        // dentro engoliria a explicação — o mais interno é o que o navegador
        // mostra.
        title={title ? `${value} · ${title}` : value}
        role={asSwitch ? "switch" : undefined}
        aria-checked={asSwitch ? active : undefined}
        className={clsx(
          "flex min-h-14 w-full items-center gap-2.5 rounded-lg border bg-surface py-2 pl-2.5 text-left transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-border-active",
          onClear ? "pr-9" : "pr-2.5",
          pending ? "border-warning/60" : active ? t.activeBorder : "border-border"
        )}
      >
        <span
          className={clsx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br shadow-inner",
            t.icon
          )}
        >
          <Icon className="h-4 w-4 text-white" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium uppercase leading-tight tracking-wide text-text-muted">
            {label}
          </span>
          <span
            className={clsx(
              "block truncate text-sm font-bold leading-tight",
              active ? "text-foreground" : "text-text-secondary"
            )}
          >
            {value}
          </span>
        </span>
        {badge}
      </button>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-base text-text-muted hover:bg-danger/10 hover:text-danger"
        >
          ×
        </button>
      )}
    </div>
  );
}

/**
 * Tempo parado (sem interação nenhuma) até o PDV recarregar a página
 * sozinho — garante que o terminal sempre rode o JS mais recente depois de
 * um deploy, sem precisar de alguém lembrar de dar F5. Só dispara com o
 * carrinho vazio (ver `PdvScreen`), nunca no meio de uma venda.
 */
const PDV_IDLE_RELOAD_MS = 2 * 60 * 1000;

export function PdvScreen({
  canDiscount,
  canDiscountFreely,
  canFiado,
  canMoveCash,
  autoPrintReceipt,
  creditoEficazSurchargePercent,
  pendingConvenioSignups,
}: {
  canDiscount: boolean;
  /** Só ADMIN — a trava de capinha na película (ver `seller-discount-rules.ts`) vale até pro Gerente. */
  canDiscountFreely: boolean;
  /** Só ADMIN — nem Gerente vende fiado (ver `canManageFiado`). */
  canFiado: boolean;
  /** Sangria/suprimento sem sair do PDV — todo mundo que vende (ver `canRecordCashMovement`), sempre com "quem está fazendo" e cupom/selfie na sangria. */
  canMoveCash: boolean;
  /** Config da empresa (Configurações > PDV: impressão) — dispara a impressão
   *  do cupom sozinha ao finalizar, sem sair do PDV (ver `printSaleId`). */
  autoPrintReceipt: boolean;
  /** Acréscimo (%) sobre a parte paga no Crédito Eficaz (Configurações do
   *  Crédito Eficaz) — mostrado antes do PIN e reconferido no servidor. */
  creditoEficazSurchargePercent: number
  /** Cadastros de convênio aguardando aprovação (todos os convênios) — ver `ConvenioSignupsModal`. */
  pendingConvenioSignups: number;
}) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PdvProduct[]>([]);
  // Total de produtos que batem com a busca — pode ser maior que `results`
  // (a sugestão mostra só os 30 primeiros); usado só pra avisar "mostrando X
  // de Y" quando corta, nunca pra decidir o que renderizar.
  const [resultsTotalCount, setResultsTotalCount] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState<string>();
  const [discountNotice, setDiscountNotice] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  const [amounts, setAmounts] = useState<PaymentAmounts>(EMPTY_PAYMENT_AMOUNTS);
  const [cashReceived, setCashReceived] = useState<number | "">("");
  const [fiadoDueDate, setFiadoDueDate] = useState("");
  const [creditoEficazPin, setCreditoEficazPin] = useState("");

  // Vendedor da venda: nunca inferido de quem operou o caixa — é sempre
  // escolhido explicitamente aqui, e revalidado no servidor em
  // `createSaleAction`. Enquanto não houver um vendedor, a seção de
  // pagamento fica desabilitada (ver os `disabled={!sellerId}` abaixo).
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [sellerName, setSellerName] = useState<string | null>(null);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);
  const [cashMovementModalOpen, setCashMovementModalOpen] = useState(false);

  // Benefício de Convênio Corporativo — nunca escolhido/digitado como valor
  // pelo vendedor, só o resultado já validado do QR (ver `ConvenioModal`).
  // Some do carrinho se o vendedor remover, e a venda é revalidada de novo
  // no servidor no momento de fechar (ver `revalidateConvenioMember`).
  const [convenioMember, setConvenioMember] = useState<ConvenioCredential | null>(null);
  const [convenioModalOpen, setConvenioModalOpen] = useState(false);
  const [convenioSignupsOpen, setConvenioSignupsOpen] = useState(false);
  // Enquanto a janela de cadastros está aberta, a recarga por inatividade
  // espera (ver efeito abaixo) — nunca fecha a revisão no meio.
  const convenioSignupsOpenRef = useRef(false);
  useEffect(() => {
    convenioSignupsOpenRef.current = convenioSignupsOpen;
  }, [convenioSignupsOpen]);

  // Proteção Eficaz: cliente abre mão do desconto de película em troca da
  // garantia de troca em 30 dias (ver `Sale.protecaoEficazOptedIn`). Marcação
  // manual do vendedor — só aparece quando o carrinho já é elegível (capinha
  // + película juntas), e é revalidada de novo no servidor (nunca aceita só
  // porque veio marcada daqui).
  const [protecaoEficazOptedIn, setProtecaoEficazOptedIn] = useState(false);

  // Troca gratuita de uma Proteção Eficaz já aprovada — validada no
  // `ProtecaoEficazRedemptionModal` (número da venda original), some do
  // carrinho se o vendedor remover. Só some efeito de fato com exatamente 1
  // película no carrinho (ver `protecaoEficazRedemptionReady` abaixo);
  // revalidada de novo no servidor ao fechar (`resolveProtecaoEficazRedemption`).
  const [protecaoEficazRedemption, setProtecaoEficazRedemption] =
    useState<ProtecaoEficazRedemptionCredential | null>(null);
  const [protecaoEficazRedemptionModalOpen, setProtecaoEficazRedemptionModalOpen] = useState(false);

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
        setResultsTotalCount(0);
        setSuggestionsOpen(false);
        return;
      }
      startTransition(async () => {
        const { products, totalCount } = await searchProductsAction(query);
        setResults(products);
        setResultsTotalCount(totalCount);
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

  // Recarrega o PDV sozinho depois de `PDV_IDLE_RELOAD_MS` sem nenhuma
  // interação — sempre que isso acontece, confere o carrinho de novo antes
  // de recarregar de fato: com item no carrinho, só adia a checagem (nunca
  // derruba uma venda em andamento, mesmo que o vendedor tenha ficado
  // parado pensando). `cartRef` evita fechar sobre um `cart` desatualizado
  // nas re-tentativas encadeadas.
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);
  useEffect(() => {
    let timer: number;
    function reloadIfIdleAndEmpty() {
      if (cartRef.current.length === 0 && !convenioSignupsOpenRef.current) {
        window.location.reload();
        return;
      }
      timer = window.setTimeout(reloadIfIdleAndEmpty, PDV_IDLE_RELOAD_MS);
    }
    function resetTimer() {
      window.clearTimeout(timer);
      timer = window.setTimeout(reloadIfIdleAndEmpty, PDV_IDLE_RELOAD_MS);
    }
    const activityEvents = ["mousedown", "mousemove", "keydown", "touchstart", "scroll"] as const;
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      window.clearTimeout(timer);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, []);

  const subtotal = round2(cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const discount = round2(cart.reduce((sum, line) => sum + (line.discount || 0), 0));
  // Nunca some com `discount` — o benefício de convênio é separado de
  // propósito (ver nota em `sale-service.ts`), só pra não afetar a comissão.
  const convenioBenefit = convenioMember
    ? round2(Math.min(convenioMember.benefitAmount, Math.max(0, subtotal - discount)))
    : 0;

  // Desconto de segurança nas películas 3D (ver `seller-discount-rules.ts`):
  // cada capinha no carrinho libera o desconto de uma película — nunca
  // "qualquer quantidade de película com uma capinha só". Vale pra Vendedor
  // e Gerente — só Admin (canDiscountFreely) não passa por essa trava.
  const capinhaUnits = cart.reduce(
    (sum, line) =>
      sum +
      (isCapinhaCategory({ categoryName: line.categoryName, name: line.name, unitPrice: line.unitPrice })
        ? line.quantity
        : 0),
    0
  );
  const sellerDiscountAllocation = allocateSellerDiscountBudget(cart, capinhaUnits);

  // Proteção Eficaz: vale pra qualquer película do catálogo (não só as duas
  // elegíveis ao desconto de segurança acima), desde que haja capinha junto.
  const peliculaUnits = cart.reduce(
    (sum, line) => sum + (isPeliculaCategory(line.categoryName) ? line.quantity : 0),
    0
  );
  const protecaoEficazEligible = capinhaUnits > 0 && peliculaUnits > 0;

  // Troca gratuita da Proteção Eficaz: só tem efeito com exatamente 1
  // película no carrinho (nenhuma ambiguidade sobre qual linha fica grátis
  // — mesma trava do servidor). `line.discount` já foi somado em `discount`
  // acima, então só falta o que resta daquela linha pra zerá-la de vez.
  const protecaoEficazPeliculaLine = protecaoEficazRedemption
    ? cart.find((line) => isPeliculaCategory(line.categoryName))
    : undefined;
  const protecaoEficazRedemptionReady = Boolean(protecaoEficazRedemption) && peliculaUnits === 1;
  const protecaoEficazRedemptionAmount =
    protecaoEficazRedemptionReady && protecaoEficazPeliculaLine
      ? round2(
          Math.max(
            0,
            protecaoEficazPeliculaLine.unitPrice * protecaoEficazPeliculaLine.quantity -
              protecaoEficazPeliculaLine.discount
          )
        )
      : 0;

  const total = round2(
    Math.max(0, subtotal - discount - convenioBenefit - protecaoEficazRedemptionAmount)
  );

  // Se o carrinho deixar de ser elegível (removeu a capinha ou a película),
  // a marcação não fica presa escondida — desmarca sozinha.
  if (!protecaoEficazEligible && protecaoEficazOptedIn) {
    setProtecaoEficazOptedIn(false);
  }
  // Sem nenhuma película no carrinho não há mais o que trocar — limpa a
  // validação pra não ficar presa "confirmada" sem sentido nenhum.
  if (protecaoEficazRedemption && peliculaUnits === 0) {
    setProtecaoEficazRedemption(null);
  }

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

  // Faixa de avisos abaixo dos cards de contexto — `Boolean(...)` explícito
  // porque as parcelas são números: um `saldo || ...` com saldo 0 devolveria o
  // próprio `0`, que o JSX renderizaria como o caractere "0" na tela.
  const hasContextNotes = Boolean(
    convenioMember ||
      (customer && customer.creditBalance > 0) ||
      (customer && customer.creditoEficazAvailableAmount > 0 && !customer.creditoEficazBlocked) ||
      customer?.creditoEficazBlocked ||
      (protecaoEficazRedemption && !protecaoEficazRedemptionReady)
  );

  const paid = round2(PAYMENT_SLOTS.reduce((sum, slot) => sum + (amounts[slot.key] || 0), 0));
  const remaining = round2(total - paid);
  const cashPortion = round2(amounts.cash || 0);
  const storeCreditPortion = round2(amounts.store_credit || 0);
  const fiadoPortion = round2(amounts.fiado || 0);
  const creditoEficazPortion = round2(amounts.credito_eficaz || 0);
  // As formas de pagamento fecham com `total` (sem acréscimo); o acréscimo
  // entra só em cima da parte no crédito e vira o total a pagar de verdade
  // (mesma conta de `createSale`, via `computeCreditoEficazSurcharge`).
  const creditoEficazSurcharge = computeCreditoEficazSurcharge(
    creditoEficazPortion,
    creditoEficazSurchargePercent
  );
  const creditoEficazOwed = round2(creditoEficazPortion + creditoEficazSurcharge);
  const totalToPay = round2(total + creditoEficazSurcharge);
  const change =
    cashPortion > 0 && cashReceived !== "" ? round2(Number(cashReceived) - cashPortion) : 0;

  const paymentPanelSlots: PaymentPanelSlot[] = PAYMENT_SLOTS.map((slot) => {
    const eligible =
      slot.key === "store_credit"
        ? !!customer && customer.creditBalance > 0
        : slot.key === "fiado"
          ? canFiado && !!customer
          : slot.key === "credito_eficaz"
            ? !!customer && customer.creditoEficazAvailableAmount > 0 && !customer.creditoEficazBlocked
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
            : slot.key === "credito_eficaz"
              ? customer?.creditoEficazBlocked
                ? "Crédito Eficaz bloqueado para este cliente"
                : "Cliente sem Crédito Eficaz disponível"
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
    setResultsTotalCount(0);
    setSuggestionsOpen(false);
    searchRef.current?.focus();
  }

  function runSearch(query = term.trim()) {
    if (!query) return;
    setSearching(true);
    startTransition(async () => {
      const { products, exact, totalCount } = await searchProductsAction(query);
      setSearching(false);
      if (exact && products.length === 1 && products[0].variants.length === 0) {
        addToCart(products[0], null);
      } else if (products.length === 0) {
        setError(`Nenhum produto encontrado para "${query}".`);
        setResults([]);
        setResultsTotalCount(0);
        setSuggestionsOpen(false);
      } else {
        setError(undefined);
        setResults(products);
        setResultsTotalCount(totalCount);
        setSuggestionsOpen(true);
      }
    });
  }

  function handleScanned(value: string) {
    setTerm(value);
    runSearch(value);
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
    // Trocar de cliente (não só escolher o primeiro) passou a ser possível
    // quando a busca virou modal — antes era preciso Remover e buscar de novo,
    // e o Remover já realocava tudo. Sem isto, o crédito de loja, o fiado, o
    // Crédito Eficaz e o PIN do cliente ANTERIOR continuariam na tela em nome
    // do novo, e o erro só apareceria ao fechar a venda (ou, no caso do PIN,
    // só no servidor).
    // Só quando TROCA de cliente. Escolher o primeiro segue idêntico ao que
    // era antes (só o pré-preenchimento do crédito de loja) — o objetivo aqui
    // é fechar a brecha nova, não mexer no comportamento que já funcionava.
    const isSwitch = !!customer && customer.id !== picked.id;

    setCustomer(picked);
    if (isSwitch) {
      setCreditoEficazPin("");
      setFiadoDueDate("");
    }

    setAmounts((current) => {
      const next = { ...current };

      if (isSwitch) {
        // Mesma realocação do "Remover cliente": o que estava em forma ligada
        // ao cliente antigo volta pro Dinheiro, em vez de sumir e deixar a
        // venda com pagamento faltando sem avisar.
        next.cash = round2(
          current.cash + current.store_credit + current.fiado + current.credito_eficaz
        );
        next.store_credit = 0;
        next.fiado = 0;
        next.credito_eficaz = 0;
      }

      if (picked.creditBalance > 0) {
        const prefilled = round2(Math.min(picked.creditBalance, total));
        next.store_credit = prefilled;
        // Só na troca: o Dinheiro acabou de absorver os slots liberados acima,
        // então o que o crédito do novo cliente cobre sai de lá — senão a soma
        // passaria do total e acusaria "excede" sem o operador ter feito nada.
        if (isSwitch) next.cash = round2(Math.max(0, next.cash - prefilled));
      }

      return next;
    });
  }

  /** Tirar o cliente derruba junto tudo que só existia por causa dele (crédito
   *  de loja, fiado, Crédito Eficaz) — o valor volta pra "Dinheiro" em vez de
   *  sumir, senão a venda ficaria com pagamento faltando sem avisar. Mesma
   *  realocação que já existia no botão "Remover" do painel antigo. */
  function clearCustomer() {
    setCustomer(null);
    setAmounts((current) => ({
      ...current,
      cash: round2(current.cash + current.store_credit + current.fiado + current.credito_eficaz),
      store_credit: 0,
      fiado: 0,
      credito_eficaz: 0,
    }));
    setCreditoEficazPin("");
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
    if (creditoEficazPortion > 0 && !customer) {
      setError("Selecione um cliente para usar o Crédito Eficaz.");
      return;
    }
    if (creditoEficazPortion > 0 && !/^\d{4}$/.test(creditoEficazPin)) {
      setError("Informe o PIN de 4 dígitos do Crédito Eficaz.");
      return;
    }
    if (customer && creditoEficazOwed > customer.creditoEficazAvailableAmount + 0.005) {
      setError(
        `Limite do Crédito Eficaz insuficiente: com o acréscimo, a parte no crédito fica ${formatBRL(creditoEficazOwed)} e o cliente tem ${formatBRL(customer.creditoEficazAvailableAmount)} disponível.`
      );
      return;
    }
    if (protecaoEficazRedemption && !protecaoEficazRedemptionReady) {
      setError(
        peliculaUnits === 0
          ? "Adicione a película ao carrinho pra aplicar a troca da Proteção Eficaz."
          : "A troca da Proteção Eficaz exige exatamente 1 película no carrinho — remova as demais."
      );
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
        creditoEficazPin: creditoEficazPortion > 0 ? creditoEficazPin : undefined,
        creditoEficazSurchargePercent: creditoEficazPortion > 0 ? creditoEficazSurchargePercent : undefined,
        convenioMemberId: convenioMember?.member.id ?? "",
        protecaoEficazOptedIn,
        protecaoEficazRedemptionSaleNumber: protecaoEficazRedemption?.saleNumber,
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
        setAmounts(EMPTY_PAYMENT_AMOUNTS);
        setCashReceived("");
        setFiadoDueDate("");
        setCreditoEficazPin("");
        setConvenioMember(null);
        setSellerId(null);
        setSellerName(null);
        setProtecaoEficazOptedIn(false);
        setProtecaoEficazRedemption(null);

        searchRef.current?.focus();
      }
    });
  }

  return (
    <div>
      {lastSale && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-success/10 px-4 py-3 text-sm text-success">
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
              className="text-success hover:opacity-80"
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
          src={`/vendas/${printSaleId}`}
          aria-hidden="true"
          tabIndex={-1}
          // Chama print() no iframe a partir do PAI, só depois do `onLoad`
          // (documento carregado por completo) — mais confiável do que o
          // próprio documento do iframe se auto-imprimir ao montar (ver
          // histórico de `AutoPrint`, removido): alguns navegadores tratam
          // `window.print()` disparado de dentro de um iframe recém-criado
          // de forma inconsistente, silenciosamente ignorando a chamada.
          onLoad={(e) => e.currentTarget.contentWindow?.print()}
          style={{ position: "fixed", top: 0, left: "-10000px", width: "380px", height: "600px", border: "none" }}
        />
      )}

      {discountNotice && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-md bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          <span>{discountNotice}</span>
          <button
            type="button"
            onClick={() => setDiscountNotice(undefined)}
            className="text-warning hover:opacity-80"
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      )}

      {/* Duas colunas a partir de `lg`, com o gap menor que os 24px de antes:
          em 1366x768 (o monitor típico do caixa) cada 8px de gap vertical
          contava. Abaixo de `lg` empilha na ordem de prioridade — busca,
          carrinho, contexto, finalização. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-4">
        {/* Coluna esquerda: busca e carrinho */}
        <div className="lg:col-span-3">
        {/* Cliente e Vendedor ACIMA da busca, por pedido do dono: na prática a
            venda começa identificando quem vende e quem compra, e só depois o
            leitor de código de barras entra em ação. Com eles embaixo, o
            operador passava o produto primeiro e voltava atrás. */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <PdvChip
            icon={User}
            label="Cliente"
            value={customer ? customer.name : "Não identificado"}
            active={!!customer}
            title="Opcional — necessário para crédito de loja, fiado e Crédito Eficaz"
            onClick={() => setCustomerModalOpen(true)}
            onClear={customer ? clearCustomer : undefined}
            clearLabel="Remover cliente da venda"
          />

          <PdvChip
            icon={UserCog}
            label="Vendedor"
            value={sellerName ?? "Selecionar"}
            active={!!sellerId}
            pending={!sellerId && cart.length > 0}
            title="Quem realizou esta venda — obrigatório para liberar o pagamento"
            onClick={() => setSellerModalOpen(true)}
          />
        </div>

        {/* Barra operacional: uma linha só. O painel que existia aqui (badge de
            ícone + rótulo explicativo + padding) custava ~90px de altura pra
            enfeitar um campo de texto — a explicação virou o próprio
            placeholder, e o rótulo continua existindo pra leitor de tela. */}
        <div ref={searchBoxRef} className="relative mb-3">
          <label htmlFor="pdv-search" className="sr-only">
            Buscar produto por nome, código interno ou código de barras
          </label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
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
                placeholder="Produto, código ou código de barras"
                className="h-11 pl-9 text-base"
              />
            </div>
            <Button
              type="button"
              onClick={() => runSearch()}
              variant="secondary"
              fullWidth={false}
              className="h-11 shrink-0 px-4"
            >
              {searching ? "Buscando..." : "Buscar"}
            </Button>
            <BarcodeScannerField onScanned={handleScanned} className="h-11" />
          </div>

          {/* Sugestões em tempo real: atualiza a cada tecla digitada (busca parcial
              pelo nome) e some quando o campo esvazia ou uma opção é escolhida. */}
          {suggestionsOpen && results.length > 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
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
                    className={clsx("p-3", !hasVariants && "cursor-pointer hover:bg-surface-hover")}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface-hover">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-[9px] text-text-muted">sem foto</span>
                        )}
                      </div>
                      <div className="min-w-[140px] flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {product.name}
                        </p>
                        <p className="text-xs text-text-muted">
                          {product.internalCode ?? "sem código"} · estoque {product.stockQty}
                        </p>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-3">
                        <span className="text-sm text-foreground">{formatBRL(product.price)}</span>
                        {!hasVariants && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(product, null);
                            }}
                            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
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
                            className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover"
                          >
                            {variant.name} · {formatBRL(product.price + variant.priceAdjustment)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {resultsTotalCount > results.length && (
                <p className="bg-warning/10 px-3 py-2 text-xs text-warning">
                  Mostrando {results.length} de {resultsTotalCount} — digite mais pra refinar (ex.:
                  a marca ou o modelo).
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-blue-400/25 bg-surface shadow-[0_0_24px_-16px_rgba(59,130,246,0.55)]">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-blue-400 to-blue-600 shadow-inner">
              <ShoppingCart className="h-4 w-4 text-white" />
            </span>
            <span className="text-sm font-bold text-foreground">
              Carrinho · {cart.length} {cart.length === 1 ? "item" : "itens"}
            </span>
          </div>
          {cart.length === 0 ? (
            // Empty state compacto: com o carrinho vazio essa área não precisa
            // de 160px pra dizer que está vazia — o operador acabou de chegar
            // no campo de busca, que está logo acima e já está com o foco.
            <p className="px-4 py-6 text-center text-sm text-text-muted">
              Carrinho vazio — busque um produto acima para começar.
            </p>
          ) : (
            // Cada item é um bloco empilhado, não uma linha de tabela — numa
            // tela mais estreita ou com nome de produto grande, uma tabela de
            // 5 colunas passava da largura disponível e o botão Remover
            // (última coluna) ficava fora da área visível, só alcançável
            // rolando pro lado. Em blocos não existe rolagem horizontal
            // possível: o conteúdo sempre quebra linha, e Remover fica fixo
            // no canto do item, sempre visível.
            <div className="divide-y divide-border">
              {cart.map((line) => (
                <div key={line.key} className="relative p-3">
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    aria-label={`Remover ${line.name}`}
                    title="Remover"
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-lg text-text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    ×
                  </button>

                  <p className="max-w-[calc(100%-2.5rem)] text-base font-bold leading-snug text-foreground">
                    {line.name}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatBRL(line.unitPrice)} · estoque {line.stockQty}
                  </p>

                  <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                    <div>
                      <p className="mb-1 text-xs font-medium text-text-muted">Quantidade</p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => changeQuantity(line.key, line.quantity - 1)}
                          className="h-8 w-8 rounded border border-border text-text-secondary hover:bg-surface-hover"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => changeQuantity(line.key, Number(e.target.value))}
                          className="money-input h-8 w-14 rounded border border-border bg-surface px-1 text-center text-foreground"
                        />
                        <button
                          type="button"
                          onClick={() => changeQuantity(line.key, line.quantity + 1)}
                          className="h-8 w-8 rounded border border-border text-text-secondary hover:bg-surface-hover"
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
                          <p className="mb-1 text-xs font-medium text-text-muted">Desconto</p>
                          <div className="relative w-24">
                            <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-text-muted">
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
                              className="money-input h-8 w-full rounded border border-border bg-surface py-1 pl-7 pr-1 text-right text-xs text-foreground disabled:bg-surface-hover disabled:text-text-muted"
                            />
                          </div>
                          {blockedBySellerRule && (
                            <p className="mt-0.5 max-w-[6rem] text-[10px] leading-tight text-warning">
                              {blockedReason}
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    <div className="text-right">
                      <p className="mb-1 text-xs font-medium text-text-muted">Total</p>
                      <p className="text-lg font-bold text-foreground">
                        {formatBRL(round2(line.unitPrice * line.quantity - line.discount))}
                      </p>
                      {line.discount > 0 && (
                        <p className="text-xs font-normal text-text-muted">
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

      {/* Coluna direita: contexto da venda (cards compactos) e finalização */}
      <div className="lg:col-span-2">
        <div className="space-y-3">
          {/* Funções auxiliares da venda em cards de 56px, no lugar dos painéis
              empilhados de ~120px cada. Cliente e Vendedor não estão aqui: eles
              abrem a venda e ficam acima da busca, na coluna da esquerda. */}
          {/* Duas colunas, menos na faixa `lg` (1024–1279px): ali a coluna da
              direita vale ~2/5 de uma tela já estreita, e dois cards lado a
              lado deixariam ~140px pra cada um — "Não identificado" sairia
              cortado. Os monitores de caixa (1366, 1920) caem em `xl`, então
              recebem as duas colunas. */}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 xl:grid-cols-2">
            {canMoveCash && (
              <PdvChip
                tone="credit"
                icon={Wallet}
                label="Caixa"
                value="Sangria / suprimento"
                // Sem `active`: na gramática dos cards, borda colorida quer
                // dizer "escolhido/preenchido nesta venda". O Caixa é uma ação
                // sempre disponível, não um estado da venda — deixá-lo aceso
                // competiria com Cliente e Vendedor sem informar nada.
                title="Registrar retirada ou entrada de dinheiro sem sair do PDV"
                onClick={() => setCashMovementModalOpen(true)}
              />
            )}

            <PdvChip
              tone="benefits"
              icon={HandCoins}
              label="Convênio"
              // O NOME DA PESSOA na superfície, não o do convênio: o fluxo
              // pede que o vendedor confira se quem está no balcão é o titular
              // da credencial (ver `ConvenioModal`). Esconder o nome atrás de
              // um tooltip enfraqueceria justamente essa conferência — o nome
              // do convênio e o valor vão pra faixa de avisos logo abaixo.
              value={convenioMember ? convenioMember.member.name : "Nenhum"}
              active={!!convenioMember}
              title={
                convenioMember
                  ? `Convênio ${convenioMember.convenio.name} · benefício de ${formatBRL(convenioMember.benefitAmount)}`
                  : "Escanear o QR do convênio corporativo do cliente"
              }
              onClick={() => setConvenioModalOpen(true)}
              onClear={convenioMember ? () => setConvenioMember(null) : undefined}
              clearLabel="Remover benefício de convênio"
            />

            <PdvChip
              tone="benefits"
              icon={ClipboardList}
              label="Cadastros"
              value={
                pendingConvenioSignups > 0
                  ? `${pendingConvenioSignups} pendente${pendingConvenioSignups === 1 ? "" : "s"}`
                  : "Nenhum pendente"
              }
              active={pendingConvenioSignups > 0}
              title="Cadastros de convênio aguardando aprovação e links de inscrição"
              badge={
                pendingConvenioSignups > 0 ? (
                  <span className="shrink-0 rounded-full bg-warning px-1.5 py-0.5 text-[11px] font-bold text-white">
                    {pendingConvenioSignups}
                  </span>
                ) : undefined
              }
              onClick={() => setConvenioSignupsOpen(true)}
            />

            {protecaoEficazEligible && (
              <PdvChip
                tone="protection"
                icon={ShieldCheck}
                label="Proteção Eficaz"
                value={protecaoEficazOptedIn ? "Cliente optou" : "Não aplicada"}
                active={protecaoEficazOptedIn}
                asSwitch
                title="Sem desconto na película agora — em troca, garantia de trocar a película em até 30 dias da venda. Sai marcado no cupom; o cliente valida em /conta no site."
                onClick={() => setProtecaoEficazOptedIn((current) => !current)}
              />
            )}

            <PdvChip
              tone="protection"
              icon={RefreshCw}
              label="Troca"
              value={
                protecaoEficazRedemption
                  ? `Venda #${protecaoEficazRedemption.saleNumber}`
                  : "Nenhuma"
              }
              active={!!protecaoEficazRedemption}
              pending={Boolean(protecaoEficazRedemption) && !protecaoEficazRedemptionReady}
              title={
                protecaoEficazRedemption
                  ? `Troca de película de ${protecaoEficazRedemption.customerName}`
                  : "Validar uma troca gratuita de película da Proteção Eficaz"
              }
              onClick={() => setProtecaoEficazRedemptionModalOpen(true)}
              onClear={
                protecaoEficazRedemption ? () => setProtecaoEficazRedemption(null) : undefined
              }
              clearLabel="Remover troca da Proteção Eficaz"
            />
          </div>

          {/* Faixa de avisos: só aparece quando há algo de fato a dizer, em vez
              de reservar altura fixa dentro de cada card pra um texto que na
              maioria das vendas não existe. */}
          {hasContextNotes && (
            <div className="space-y-0.5 rounded-md bg-surface-hover px-2.5 py-1.5 text-xs">
              {convenioMember && (
                <p className="font-medium text-text-secondary">
                  Convênio {convenioMember.convenio.name} · benefício de{" "}
                  {formatBRL(convenioMember.benefitAmount)}
                </p>
              )}
              {customer && customer.creditBalance > 0 && (
                <p className="font-medium text-success">
                  Crédito de loja disponível: {formatBRL(customer.creditBalance)}
                </p>
              )}
              {customer &&
                customer.creditoEficazAvailableAmount > 0 &&
                !customer.creditoEficazBlocked && (
                  <p className="font-medium text-success">
                    Crédito Eficaz disponível: {formatBRL(customer.creditoEficazAvailableAmount)}
                  </p>
                )}
              {customer?.creditoEficazBlocked && (
                <p className="font-medium text-danger">Crédito Eficaz bloqueado</p>
              )}
              {protecaoEficazRedemption && !protecaoEficazRedemptionReady && (
                <p className="font-medium text-warning">
                  {peliculaUnits === 0
                    ? "Troca da Proteção Eficaz: adicione a película ao carrinho pra aplicar."
                    : "Troca da Proteção Eficaz: exige exatamente 1 película no carrinho — remova as demais."}
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-emerald-500/25 bg-surface p-3 shadow-[0_0_24px_-16px_rgba(34,197,94,0.5)]">
            {/* Resumo colado no pagamento: era um painel próprio, com cabeçalho
                e ícone, separado por 16px do card que ele explica. O total e a
                forma de pagar são a mesma decisão — agora são o mesmo card. */}
            <div className="mb-3 space-y-1 text-sm">
              <div className="flex justify-between font-medium text-text-secondary">
                <span>Subtotal</span>
                <span className="font-bold text-foreground">{formatBRL(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between font-medium text-text-secondary">
                  <span>Desconto (nos itens)</span>
                  <span className="font-bold text-foreground">-{formatBRL(discount)}</span>
                </div>
              )}
              {convenioBenefit > 0 && (
                <div className="flex justify-between font-medium text-text-secondary">
                  <span>Benefício convênio</span>
                  <span className="font-bold text-foreground">-{formatBRL(convenioBenefit)}</span>
                </div>
              )}
              {protecaoEficazRedemptionAmount > 0 && (
                <div className="flex justify-between font-medium text-text-secondary">
                  <span>Troca Proteção Eficaz</span>
                  <span className="font-bold text-foreground">-{formatBRL(protecaoEficazRedemptionAmount)}</span>
                </div>
              )}
              {creditoEficazSurcharge > 0 && (
                <div className="flex justify-between font-medium text-text-secondary">
                  <span>Acréscimo Crédito Eficaz ({formatSurchargePercent(creditoEficazSurchargePercent)})</span>
                  <span className="font-bold text-foreground">+{formatBRL(creditoEficazSurcharge)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1.5 text-xl font-bold text-foreground">
                <span>Total</span>
                <span>{formatBRL(totalToPay)}</span>
              </div>
            </div>

            {/* Card escuro de propósito (adiantado da Fase 4) — o MixedPaymentPanel
                compartilhado já usa os tokens escuros desde a Fase 1, e ficava
                com texto quase invisível dentro do card branco que ainda restava
                aqui (bug real reportado: "Pago"/"Restante"/"Calcular troco"
                só apareciam ao selecionar o texto). Glow verde adicionado junto
                com o tema premium da Central do Cliente — é a ação final da tela. */}
            {/* A seleção do vendedor acontece antes da forma de pagamento: sem
                vendedor escolhido, o painel abaixo fica desabilitado. */}
            <div className="mb-3">
              <MixedPaymentPanel
                slots={paymentPanelSlots}
                amounts={amounts}
                total={total}
                disabled={!sellerId}
                dense
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
                <p className="mt-2 text-xs text-danger">
                  Excede o total em {formatBRL(Math.abs(remaining))}
                </p>
              )}
            </div>

            {fiadoPortion > 0 && (
              <div className="mb-3 rounded-md bg-warning/10 p-3">
                <Label htmlFor="fiado-due-date">Data prevista de pagamento (fiado)</Label>
                <input
                  id="fiado-due-date"
                  type="date"
                  disabled={!sellerId}
                  value={fiadoDueDate}
                  onChange={(e) => setFiadoDueDate(e.target.value)}
                  className="h-9 w-full rounded border border-border bg-surface px-2 text-sm text-foreground disabled:bg-surface-hover"
                />
              </div>
            )}

            {creditoEficazPortion > 0 && (
              <div className="mb-3 rounded-md bg-warning/10 p-3">
                <Label htmlFor="credito-eficaz-pin">PIN do Crédito Eficaz (peça ao cliente)</Label>
                <input
                  id="credito-eficaz-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  disabled={!sellerId}
                  value={creditoEficazPin}
                  onChange={(e) => setCreditoEficazPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="h-9 w-28 rounded border border-border bg-surface px-2 text-sm tracking-widest text-foreground disabled:bg-surface-hover"
                />
                {creditoEficazSurcharge > 0 && (
                  <p className="mt-2 text-sm text-foreground">
                    No Crédito Eficaz: {formatBRL(creditoEficazPortion)} + acréscimo de{" "}
                    {formatSurchargePercent(creditoEficazSurchargePercent)} ({formatBRL(creditoEficazSurcharge)}) ={" "}
                    <strong>{formatBRL(creditoEficazOwed)}</strong> — é o que o cliente fica devendo. Confirme
                    com ele antes de pedir o PIN.
                  </p>
                )}
              </div>
            )}

            {cashPortion > 0 && (
              <div className="mb-3 rounded-md bg-surface-hover p-3">
                <Label htmlFor="cash-received" className="mb-1">
                  Calcular troco
                </Label>
                <div className="relative mb-2">
                  <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm text-text-muted">
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
                    className="money-input h-9 w-full rounded border border-border bg-surface py-1 pl-8 pr-2 text-right text-sm text-foreground disabled:bg-surface-hover"
                  />
                </div>
                <div className="flex justify-between text-base font-bold">
                  <span className="text-foreground">Troco</span>
                  <span className={change < 0 ? "text-danger" : "text-success"}>
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
              variant={Math.abs(remaining) <= 0.005 ? "primary" : "secondary"}
              className="py-3 text-base"
            >
              {isPending ? "Finalizando..." : `Finalizar venda · ${formatBRL(totalToPay)}`}
            </Button>
          </div>
        </div>
      </div>

      <CustomerPickerModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        selected={customer}
        onSelect={selectCustomer}
        onClear={clearCustomer}
      />

      <SellerPickerModal
        open={sellerModalOpen}
        onClose={() => setSellerModalOpen(false)}
        onSelect={(seller) => {
          setSellerId(seller.id);
          setSellerName(seller.name);
          setSellerModalOpen(false);
        }}
      />

      <ConvenioSignupsModal
        open={convenioSignupsOpen}
        onClose={() => setConvenioSignupsOpen(false)}
        onReviewed={() => router.refresh()}
      />

      <ConvenioModal
        open={convenioModalOpen}
        onClose={() => setConvenioModalOpen(false)}
        onConfirm={(credential) => {
          setConvenioMember(credential);
          setConvenioModalOpen(false);
        }}
      />

      <ProtecaoEficazRedemptionModal
        open={protecaoEficazRedemptionModalOpen}
        onClose={() => setProtecaoEficazRedemptionModalOpen(false)}
        onConfirm={(credential) => {
          setProtecaoEficazRedemption(credential);
          setProtecaoEficazRedemptionModalOpen(false);
        }}
      />

      {canMoveCash && (
        <CashMovementModal
          open={cashMovementModalOpen}
          onClose={() => setCashMovementModalOpen(false)}
        />
      )}

      </div>
    </div>
  );
}
