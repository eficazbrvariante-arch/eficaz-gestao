"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormBanner } from "@/components/ui/form-banner";
import { MultiImageUploadField } from "@/components/ui/multi-image-upload-field";
import { MixedPaymentPanel, type PaymentPanelSlot } from "@/components/payments/mixed-payment-panel";
import { formatBRL } from "@/lib/format";
import {
  PAYMENT_SLOTS,
  EMPTY_PAYMENT_AMOUNTS,
  sumPaymentAmounts,
  toPaymentEntries,
  type PaymentAmounts,
} from "@/lib/payment-slots";
import { searchCustomersAction } from "../clientes/actions";
import {
  createRepairOrderAction,
  deliverRepairOrderAction,
  ensureRepairOrderReceiptAction,
  grantRepairOrderCourtesyAction,
  receiveRepairOrderPaymentAction,
  updateRepairOrderAction,
  updateRepairOrderStatusAction,
} from "./actions";
import {
  REPAIR_ORDER_STATUSES,
  REPAIR_ORDER_STATUS_BADGE_CLASSES,
  REPAIR_ORDER_STATUS_LABELS,
  type RepairOrderStatusValue,
} from "@/lib/validations/repair-order";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT: "Cartão de Débito",
  CREDIT: "Cartão de Crédito",
  STORE_CREDIT: "Crédito de loja",
  FIADO: "Fiado",
};

/** Status escolhíveis livremente no seletor — "Entregue" só acontece pelo
 *  acerto financeiro (ver `handleDeliver`), nunca como troca de status solta. */
const SELECTABLE_STATUSES = REPAIR_ORDER_STATUSES.filter((s) => s !== "DELIVERED");

type ServiceLine = {
  key: number;
  description: string;
  unitPrice: number;
  quantity: number;
};

type CustomerOption = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  creditBalance: number;
};

type HistoryEvent = { id: string; message: string; createdAt: string };

export type RepairOrderFinancialsView = {
  total: number;
  paid: number;
  balance: number;
  situation: "QUITADO" | "PENDENTE" | "SEM_COBRANCA";
  payments: {
    id: string;
    method: string;
    amount: number;
    createdAt: string;
    createdByName: string;
  }[];
};

export type RepairOrderDefaults = {
  customer: CustomerOption | null;
  brand: string;
  model: string;
  color: string;
  imei: string;
  passcode: string;
  turnsOn: boolean;
  condition: string;
  reportedDefects: string;
  internalNotes: string;
  estimatedAt: string;
  discount: number;
  /** `null` também quando o papel atual não pode ver o custo desta OS — não só quando ele não existe. */
  costPrice: number | null;
  items: { description: string; unitPrice: number; quantity: number }[];
  photoUrls: string[];
};

/** Existe apenas ao editar uma OS já criada. */
export type RepairOrderMeta = {
  id: string;
  number: number;
  status: RepairOrderStatusValue;
  createdAt: string;
  updatedAt: string;
  pickedUpAt: string | null;
  events: HistoryEvent[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

let lineKeySeq = 0;
function toServiceLines(items: RepairOrderDefaults["items"]): ServiceLine[] {
  return items.map((item) => ({ ...item, key: lineKeySeq++ }));
}

export function RepairOrderWorkspace({
  defaults,
  meta,
  canEditCost,
  canViewProfit,
  financials,
  canFiado,
  canGrantCourtesy,
}: {
  defaults: RepairOrderDefaults;
  meta?: RepairOrderMeta;
  /** Se o papel atual pode ver/editar o campo de custo nesta OS agora. */
  canEditCost: boolean;
  /** Admin: também vê o lucro (orçamento − custo) calculado. */
  canViewProfit: boolean;
  /** `null` só na criação de uma OS nova — o financeiro só existe depois de salva. */
  financials: RepairOrderFinancialsView | null;
  /** Só ADMIN — nem Gerente vende fiado (ver `canManageFiado`). */
  canFiado: boolean;
  /** Só ADMIN — dispensar saldo pendente sem cobrança. */
  canGrantCourtesy: boolean;
}) {
  const router = useRouter();
  const isEditing = Boolean(meta);

  const [customer, setCustomer] = useState<CustomerOption | null>(defaults.customer);
  const [customerTerm, setCustomerTerm] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);

  const [brand, setBrand] = useState(defaults.brand);
  const [model, setModel] = useState(defaults.model);
  const [color, setColor] = useState(defaults.color);
  const [imei, setImei] = useState(defaults.imei);
  const [passcode, setPasscode] = useState(defaults.passcode);
  const [turnsOn, setTurnsOn] = useState(defaults.turnsOn);
  const [condition, setCondition] = useState(defaults.condition);
  const [reportedDefects, setReportedDefects] = useState(defaults.reportedDefects);
  const [internalNotes, setInternalNotes] = useState(defaults.internalNotes);
  const [estimatedAt, setEstimatedAt] = useState(defaults.estimatedAt);
  const [discount, setDiscount] = useState(defaults.discount);
  const [costPrice, setCostPrice] = useState<number | null>(defaults.costPrice);
  const [items, setItems] = useState<ServiceLine[]>(() => toServiceLines(defaults.items));
  const [photoUrls, setPhotoUrls] = useState<string[]>(defaults.photoUrls);

  const [status, setStatus] = useState<RepairOrderStatusValue>(meta?.status ?? "RECEIVED");

  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const [isUpdatingStatus, startStatusTransition] = useTransition();
  const [isSendingWhatsapp, startWhatsappTransition] = useTransition();
  const [, startSearchTransition] = useTransition();
  const searchTimeout = useRef<number | undefined>(undefined);

  const servicesTotal = round2(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const totalWithDiscount = round2(Math.max(0, servicesTotal - discount));

  // Entrada antecipada — painel só aparece quando o atendente clica em
  // "Registrar pagamento", pra não poluir a tela em toda OS aberta.
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmounts, setPaymentAmounts] = useState<PaymentAmounts>(EMPTY_PAYMENT_AMOUNTS);
  const [paymentFiadoDueDate, setPaymentFiadoDueDate] = useState("");
  const [isReceivingPayment, startReceivePaymentTransition] = useTransition();

  // Acerto financeiro da entrega.
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [deliveryAmounts, setDeliveryAmounts] = useState<PaymentAmounts>(EMPTY_PAYMENT_AMOUNTS);
  const [deliveryFiadoDueDate, setDeliveryFiadoDueDate] = useState("");
  const [isDelivering, startDeliverTransition] = useTransition();

  // Cortesia administrativa.
  const [showCourtesyForm, setShowCourtesyForm] = useState(false);
  const [courtesyReason, setCourtesyReason] = useState("");
  const [isGrantingCourtesy, startCourtesyTransition] = useTransition();

  const paymentSlots: PaymentPanelSlot[] = PAYMENT_SLOTS.map((slot) => {
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

  const paymentEntered = sumPaymentAmounts(paymentAmounts);
  const paymentHasFiado = (paymentAmounts.fiado || 0) > 0;
  const deliveryEntered = sumPaymentAmounts(deliveryAmounts);
  const deliveryHasFiado = (deliveryAmounts.fiado || 0) > 0;

  function handleReceivePayment() {
    if (!meta) return;
    setError(undefined);
    setSuccess(undefined);

    if (paymentEntered <= 0) {
      setError("Informe ao menos um pagamento.");
      return;
    }
    if (paymentHasFiado && !paymentFiadoDueDate) {
      setError("Informe a data prevista de pagamento do fiado.");
      return;
    }

    startReceivePaymentTransition(async () => {
      const result = await receiveRepairOrderPaymentAction(meta.id, {
        payments: toPaymentEntries(paymentAmounts),
        fiadoDueDate: paymentHasFiado ? paymentFiadoDueDate : undefined,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSuccess(result?.success ?? "Pagamento registrado.");
      setShowPaymentForm(false);
      setPaymentAmounts(EMPTY_PAYMENT_AMOUNTS);
      setPaymentFiadoDueDate("");
      router.refresh();
    });
  }

  function handleDeliver() {
    if (!meta || !financials) return;
    setError(undefined);
    setSuccess(undefined);

    if (financials.balance > 0.005) {
      if (Math.abs(deliveryEntered - financials.balance) > 0.005) {
        setError(
          `Os pagamentos informados (${formatBRL(deliveryEntered)}) precisam fechar com o saldo pendente (${formatBRL(financials.balance)}).`
        );
        return;
      }
      if (deliveryHasFiado && !deliveryFiadoDueDate) {
        setError("Informe a data prevista de pagamento do fiado.");
        return;
      }
    }

    startDeliverTransition(async () => {
      const result = await deliverRepairOrderAction(meta.id, {
        payments: financials.balance > 0.005 ? toPaymentEntries(deliveryAmounts) : [],
        fiadoDueDate: deliveryHasFiado ? deliveryFiadoDueDate : undefined,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSuccess(result?.success ?? "OS entregue.");
      setShowDeliveryForm(false);
      setDeliveryAmounts(EMPTY_PAYMENT_AMOUNTS);
      setDeliveryFiadoDueDate("");
      setStatus("DELIVERED");
      router.refresh();
    });
  }

  function handleGrantCourtesy() {
    if (!meta) return;
    setError(undefined);
    setSuccess(undefined);

    if (courtesyReason.trim().length < 3) {
      setError("Descreva o motivo da cortesia.");
      return;
    }

    startCourtesyTransition(async () => {
      const result = await grantRepairOrderCourtesyAction(meta.id, { reason: courtesyReason.trim() });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSuccess(result?.success ?? "Cortesia concedida.");
      setShowCourtesyForm(false);
      setCourtesyReason("");
      router.refresh();
    });
  }

  function searchCustomers(term: string) {
    setCustomerTerm(term);
    window.clearTimeout(searchTimeout.current);
    if (term.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    searchTimeout.current = window.setTimeout(() => {
      setSearchingCustomer(true);
      startSearchTransition(async () => {
        const results = await searchCustomersAction(term);
        setCustomerResults(results);
        setSearchingCustomer(false);
      });
    }, 250);
  }

  function addServiceLine() {
    setItems((current) => [...current, { key: lineKeySeq++, description: "", unitPrice: 0, quantity: 1 }]);
  }

  function updateServiceLine(key: number, patch: Partial<ServiceLine>) {
    setItems((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeServiceLine(key: number) {
    setItems((current) => current.filter((line) => line.key !== key));
  }

  function buildInput() {
    return {
      customerId: customer?.id ?? "",
      brand,
      model,
      color,
      imei,
      passcode,
      turnsOn,
      condition,
      reportedDefects,
      internalNotes,
      estimatedAt,
      discount,
      costPrice,
      items: items.map((line) => ({
        description: line.description,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
      })),
      photoUrls,
    };
  }

  function handleSave() {
    setError(undefined);
    setSuccess(undefined);

    if (!customer) {
      setError("Selecione ou cadastre um cliente antes de salvar.");
      return;
    }
    if (!brand.trim() || !model.trim()) {
      setError("Informe a marca e o modelo do aparelho.");
      return;
    }

    startTransition(async () => {
      if (isEditing && meta) {
        const result = await updateRepairOrderAction(meta.id, buildInput());
        if (result?.error) {
          setError(result.error);
        } else {
          setSuccess(result?.success ?? "Ordem de serviço salva.");
          router.refresh();
        }
      } else {
        const result = await createRepairOrderAction(buildInput());
        if (result?.error) setError(result.error);
        // Em caso de sucesso, a action redireciona — não há mais o que fazer aqui.
      }
    });
  }

  function handleClear() {
    setCustomer(null);
    setCustomerTerm("");
    setCustomerResults([]);
    setBrand("");
    setModel("");
    setColor("");
    setImei("");
    setPasscode("");
    setTurnsOn(true);
    setCondition("");
    setReportedDefects("");
    setInternalNotes("");
    setEstimatedAt("");
    setDiscount(0);
    setCostPrice(null);
    setItems([]);
    setPhotoUrls([]);
    setError(undefined);
    setSuccess(undefined);
  }

  function handleStatusChange(next: RepairOrderStatusValue) {
    if (!meta) return;
    setStatus(next);
    startStatusTransition(async () => {
      const result = await updateRepairOrderStatusAction(meta.id, next);
      if (result?.error) {
        setError(result.error);
        setStatus(meta.status);
      } else {
        setSuccess(result?.success ?? "Status atualizado.");
        router.refresh();
      }
    });
  }

  /**
   * "Compartilhar": usa a Web Share API nativa quando o navegador suporta
   * (abre o seletor do próprio sistema — WhatsApp, e-mail, salvar, etc.);
   * sem suporte (a maioria dos desktops), cai pro link direto do WhatsApp
   * como já funcionava antes — nunca deixa o botão sem fazer nada.
   */
  function handleShare() {
    if (!meta) return;
    setError(undefined);

    const hasNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

    // Sem Web Share API: precisa do telefone pro link do WhatsApp; com Web
    // Share API o sistema decide os destinos, então o telefone não é exigido.
    if (!hasNativeShare && !customer?.phone) {
      setError("Este cliente não tem telefone cadastrado.");
      return;
    }

    // Abre a aba já em resposta ao clique, para o navegador não bloquear o
    // popup — o link de destino só é preenchido depois que o PDF existir.
    // Só é usado no caminho sem Web Share API (fallback do WhatsApp).
    const receiptWindow = hasNativeShare ? null : window.open("", "_blank");

    startWhatsappTransition(async () => {
      const result = await ensureRepairOrderReceiptAction(meta.id);
      if (result?.error) {
        setError(result.error);
        receiptWindow?.close();
        return;
      }

      const receiptUrl = `${window.location.origin}${result.path}`;
      const osLabel = `#${String(meta.number).padStart(6, "0")}`;
      const message = `Olá! Segue o comprovante da sua Ordem de Serviço ${osLabel}: ${receiptUrl}`;

      if (hasNativeShare) {
        try {
          await navigator.share({ title: `OS ${osLabel}`, text: message, url: receiptUrl });
        } catch {
          // Usuário cancelou o seletor nativo (ou o navegador recusou) — não é erro pra mostrar.
        }
        return;
      }

      const digits = customer!.phone!.replace(/\D/g, "");
      const whatsappUrl = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
      if (receiptWindow) {
        receiptWindow.location.href = whatsappUrl;
      } else {
        window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      }
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Assistência Técnica</h1>
          <p className="text-sm text-slate-500">
            {isEditing ? `OS #${String(meta!.number).padStart(6, "0")}` : "Nova ordem de serviço"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/assistencia-tecnica"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Voltar
          </Link>
          {!isEditing && (
            <Button type="button" variant="secondary" fullWidth={false} onClick={handleClear}>
              Limpar
            </Button>
          )}
          <Button type="button" fullWidth={false} disabled={isPending} onClick={handleSave} className="px-6">
            {isPending ? "Salvando..." : "Salvar OS"}
          </Button>
        </div>
      </div>

      <div className="print:hidden">
        <FormBanner message={error} variant="error" />
        <FormBanner message={success} variant="success" />
      </div>

      {/* Cliente */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-900">Cliente</p>
        {customer ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-900">{customer.name}</p>
              <p className="text-xs text-slate-500">
                {customer.phone ?? "sem telefone"}
                {customer.document ? ` · ${customer.document}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCustomer(null)}
              className="text-xs text-red-600 hover:underline print:hidden"
            >
              Trocar
            </button>
          </div>
        ) : (
          <div className="print:hidden">
            <div className="flex gap-2">
              <Input
                value={customerTerm}
                onChange={(e) => searchCustomers(e.target.value)}
                placeholder="Buscar cliente por nome, documento ou telefone..."
                className="min-w-0 flex-1"
              />
              <Link
                href="/clientes/novo"
                target="_blank"
                className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cadastrar cliente
              </Link>
            </div>
            {searchingCustomer && <p className="mt-2 text-xs text-slate-400">Buscando...</p>}
            {customerResults.length > 0 && (
              <div className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
                {customerResults.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setCustomer(option);
                      setCustomerTerm("");
                      setCustomerResults([]);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{option.name}</span>
                    <span className="ml-2 text-xs text-slate-400">
                      {option.document ?? option.phone ?? ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-slate-900">Informações do Aparelho</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="brand">Marca *</Label>
                <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="model">Modelo *</Label>
                <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="color">Cor</Label>
                <Input id="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="imei">IMEI / Nº de série</Label>
                <Input id="imei" value={imei} onChange={(e) => setImei(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="passcode">Senha / padrão informado</Label>
                <Input
                  id="passcode"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div className="mt-4">
              <Label>Aparelho liga?</Label>
              <div className="flex gap-4 text-sm text-slate-700">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={turnsOn} onChange={() => setTurnsOn(true)} /> Sim
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={!turnsOn} onChange={() => setTurnsOn(false)} /> Não
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Label htmlFor="reportedDefects">Defeitos Informados</Label>
            <Textarea
              id="reportedDefects"
              rows={4}
              value={reportedDefects}
              onChange={(e) => setReportedDefects(e.target.value)}
              placeholder="Descreva os defeitos informados pelo cliente"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Label htmlFor="condition">Estado do Aparelho</Label>
            <Textarea
              id="condition"
              rows={4}
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="Descrição geral do aparelho (avarias visuais, etc.)"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
            <p className="mb-3 text-sm font-semibold text-slate-900">Fotos do Aparelho (opcional)</p>
            <MultiImageUploadField value={photoUrls} onChange={setPhotoUrls} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Label htmlFor="internalNotes">Observações Internas</Label>
            <Textarea
              id="internalNotes"
              rows={3}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Informações internas sobre o atendimento"
            />
          </div>

          {isEditing && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
              <p className="mb-3 text-sm font-semibold text-slate-900">Histórico</p>
              {meta!.events.length === 0 ? (
                <p className="text-sm text-slate-400">Sem eventos registrados.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {meta!.events.map((event) => (
                    <li key={event.id} className="flex justify-between gap-3 text-slate-700">
                      <span>{event.message}</span>
                      <span className="shrink-0 text-xs text-slate-400">{event.createdAt}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Coluna lateral: serviços, status, datas, ações */}
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Serviço(s) a Realizar</p>
              <button
                type="button"
                onClick={addServiceLine}
                className="text-xs font-medium text-slate-700 hover:underline print:hidden"
              >
                + Adicionar serviço
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum serviço adicionado.</p>
            ) : (
              <div className="space-y-3">
                {items.map((line) => (
                  <div key={line.key} className="rounded-md border border-slate-200 p-2">
                    <Input
                      value={line.description}
                      onChange={(e) => updateServiceLine(line.key, { description: e.target.value })}
                      placeholder="Descrição do serviço"
                      className="mb-2"
                    />
                    <div className="grid grid-cols-2 gap-2 print:hidden">
                      <div>
                        <label className="text-xs text-slate-400">Valor unit. (R$)</label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unitPrice || ""}
                          onChange={(e) =>
                            updateServiceLine(line.key, { unitPrice: Number(e.target.value) || 0 })
                          }
                          placeholder="0,00"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400">Qtd.</label>
                        <Input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) =>
                            updateServiceLine(line.key, {
                              quantity: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">
                        Subtotal: {formatBRL(line.unitPrice * line.quantity)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeServiceLine(line.key)}
                        className="text-xs text-red-600 hover:underline print:hidden"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Total dos serviços</span>
                <span>{formatBRL(servicesTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 print:hidden">
                <span className="text-slate-600">Desconto (R$)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discount || ""}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                  className="h-8 w-28 rounded border border-slate-300 px-2 text-right text-sm"
                />
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                <span>Total com desconto</span>
                <span style={{ color: "#047857" }}>{formatBRL(totalWithDiscount)}</span>
              </div>
            </div>
          </div>

          {canEditCost && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm print:hidden">
              <p className="mb-3 text-sm font-semibold text-slate-900">Custo (uso interno)</p>
              <Label htmlFor="costPrice">Preço de custo da peça (R$)</Label>
              <input
                id="costPrice"
                type="number"
                min={0}
                step="0.01"
                value={costPrice ?? ""}
                onChange={(e) =>
                  setCostPrice(e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))
                }
                placeholder="0,00"
                className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
              />
              {canViewProfit && (
                <div className="mt-3 flex justify-between border-t border-amber-200 pt-2 text-sm font-semibold text-slate-900">
                  <span>Lucro estimado</span>
                  <span>{formatBRL(totalWithDiscount - (costPrice ?? 0))}</span>
                </div>
              )}
            </div>
          )}

          {isEditing && meta && (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-2 text-sm font-semibold text-slate-900">Situação da OS</p>
                <Select
                  value={status}
                  disabled={isUpdatingStatus || status === "DELIVERED" || status === "CANCELLED"}
                  onChange={(e) => handleStatusChange(e.target.value as RepairOrderStatusValue)}
                  className="print:hidden"
                >
                  {SELECTABLE_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {REPAIR_ORDER_STATUS_LABELS[value]}
                    </option>
                  ))}
                  {/* Só aparece quando a OS já está entregue, pra continuar mostrando o valor atual no seletor — nunca selecionável de novo. */}
                  {status === "DELIVERED" && (
                    <option value="DELIVERED">{REPAIR_ORDER_STATUS_LABELS.DELIVERED}</option>
                  )}
                </Select>
                {status !== "DELIVERED" && status !== "CANCELLED" && (
                  <p className="mt-1 text-xs text-slate-400 print:hidden">
                    &quot;Entregue&quot; só através do acerto financeiro, abaixo.
                  </p>
                )}
                <span
                  className={clsx(
                    "mt-2 inline-block rounded px-2 py-0.5 text-xs font-medium",
                    REPAIR_ORDER_STATUS_BADGE_CLASSES[status]
                  )}
                >
                  {REPAIR_ORDER_STATUS_LABELS[status]}
                </span>

                <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  <Label htmlFor="estimatedAt">Data prevista de entrega</Label>
                  <input
                    id="estimatedAt"
                    type="date"
                    value={estimatedAt}
                    onChange={(e) => setEstimatedAt(e.target.value)}
                    className="h-9 w-full rounded border border-slate-300 px-2 text-sm print:hidden"
                  />
                  <div className="flex justify-between pt-2">
                    <span>Entrada</span>
                    <span>{meta.createdAt}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Última atualização</span>
                    <span>{meta.updatedAt}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Retirada</span>
                    <span>{meta.pickedUpAt ?? "—"}</span>
                  </div>
                </div>
              </div>

              {financials && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
                  <p className="mb-2 text-sm font-semibold text-slate-900">Financeiro da OS</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Total da OS</span>
                      <span>{formatBRL(financials.total)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Já recebido</span>
                      <span>{formatBRL(financials.paid)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold text-slate-900">
                      <span>Saldo a receber</span>
                      <span className={financials.balance > 0.005 ? "text-amber-600" : "text-emerald-700"}>
                        {formatBRL(financials.balance)}
                      </span>
                    </div>
                  </div>

                  {financials.payments.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                      {financials.payments.map((p) => (
                        <div key={p.id} className="flex justify-between gap-2">
                          <span className="truncate">
                            {p.createdAt} — {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                          </span>
                          <span className="shrink-0 font-medium text-slate-700">{formatBRL(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {financials.balance > 0.005 && status !== "CANCELLED" && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      {!showPaymentForm ? (
                        <button
                          type="button"
                          onClick={() => setShowPaymentForm(true)}
                          className="text-xs font-medium text-slate-700 hover:underline"
                        >
                          + Registrar pagamento (entrada)
                        </button>
                      ) : (
                        <div>
                          <MixedPaymentPanel
                            slots={paymentSlots}
                            amounts={paymentAmounts}
                            total={financials.balance}
                            onChangeAmount={(key, value) =>
                              setPaymentAmounts((current) => ({ ...current, [key]: value }))
                            }
                          />
                          {paymentHasFiado && (
                            <div className="mt-2">
                              <Label htmlFor="payment-fiado-date">Data prevista (fiado)</Label>
                              <input
                                id="payment-fiado-date"
                                type="date"
                                value={paymentFiadoDueDate}
                                onChange={(e) => setPaymentFiadoDueDate(e.target.value)}
                                className="h-8 w-full rounded border border-slate-300 px-2 text-sm"
                              />
                            </div>
                          )}
                          <div className="mt-3 flex gap-2">
                            <Button
                              type="button"
                              fullWidth={false}
                              disabled={isReceivingPayment}
                              onClick={handleReceivePayment}
                              className="px-4 text-sm"
                            >
                              {isReceivingPayment ? "Registrando..." : "Confirmar pagamento"}
                            </Button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowPaymentForm(false);
                                setPaymentAmounts(EMPTY_PAYMENT_AMOUNTS);
                              }}
                              className="text-xs text-slate-500 hover:underline"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {financials && status !== "DELIVERED" && status !== "CANCELLED" && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
                  <p className="mb-2 text-sm font-semibold text-slate-900">Entrega</p>

                  {financials.balance <= 0.005 ? (
                    <>
                      <p className="mb-3 text-xs text-emerald-700">
                        OS quitada — pode entregar sem cobrar nada agora.
                      </p>
                      <Button
                        type="button"
                        fullWidth={false}
                        disabled={isDelivering}
                        onClick={handleDeliver}
                        className="px-4 text-sm"
                      >
                        {isDelivering ? "Entregando..." : "Marcar como entregue"}
                      </Button>
                    </>
                  ) : !showDeliveryForm ? (
                    <Button
                      type="button"
                      fullWidth={false}
                      onClick={() => setShowDeliveryForm(true)}
                      className="px-4 text-sm"
                    >
                      Entregar — acerto financeiro
                    </Button>
                  ) : (
                    <div>
                      <p className="mb-2 text-xs text-slate-500">
                        Saldo a receber: <strong>{formatBRL(financials.balance)}</strong>
                      </p>
                      <MixedPaymentPanel
                        slots={paymentSlots}
                        amounts={deliveryAmounts}
                        total={financials.balance}
                        onChangeAmount={(key, value) =>
                          setDeliveryAmounts((current) => ({ ...current, [key]: value }))
                        }
                      />
                      {deliveryHasFiado && (
                        <div className="mt-2">
                          <Label htmlFor="delivery-fiado-date">Data prevista (fiado)</Label>
                          <input
                            id="delivery-fiado-date"
                            type="date"
                            value={deliveryFiadoDueDate}
                            onChange={(e) => setDeliveryFiadoDueDate(e.target.value)}
                            className="h-8 w-full rounded border border-slate-300 px-2 text-sm"
                          />
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          fullWidth={false}
                          disabled={isDelivering}
                          onClick={handleDeliver}
                          className="px-4 text-sm"
                        >
                          {isDelivering ? "Entregando..." : "Confirmar pagamento e entregar"}
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowDeliveryForm(false);
                            setDeliveryAmounts(EMPTY_PAYMENT_AMOUNTS);
                          }}
                          className="text-xs text-slate-500 hover:underline"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {canGrantCourtesy && financials.balance > 0.005 && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      {!showCourtesyForm ? (
                        <button
                          type="button"
                          onClick={() => setShowCourtesyForm(true)}
                          className="text-xs font-medium text-amber-700 hover:underline"
                        >
                          Cortesia — dispensar saldo sem cobrança
                        </button>
                      ) : (
                        <div>
                          <Label htmlFor="courtesy-reason">Motivo da cortesia (obrigatório)</Label>
                          <Textarea
                            id="courtesy-reason"
                            rows={2}
                            value={courtesyReason}
                            onChange={(e) => setCourtesyReason(e.target.value)}
                            placeholder="Ex.: cliente fiel, defeito recorrente, cortesia comercial..."
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={isGrantingCourtesy}
                              onClick={handleGrantCourtesy}
                              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                            >
                              {isGrantingCourtesy
                                ? "Concedendo..."
                                : `Confirmar cortesia de ${formatBRL(financials.balance)}`}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowCourtesyForm(false);
                                setCourtesyReason("");
                              }}
                              className="text-xs text-slate-500 hover:underline"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:hidden">
                <Link
                  href={`/assistencia-tecnica/${meta.id}/cupom?tipo=entrada`}
                  target="_blank"
                  className="rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cupom de entrada (80mm)
                </Link>
                {status === "DELIVERED" ? (
                  <Link
                    href={`/assistencia-tecnica/${meta.id}/cupom?tipo=entrega`}
                    target="_blank"
                    className="rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cupom de entrega (80mm)
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Imprimir OS (A4)
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={isSendingWhatsapp}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 sm:col-span-2"
                >
                  {isSendingWhatsapp ? "Gerando comprovante..." : "Compartilhar comprovante"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
