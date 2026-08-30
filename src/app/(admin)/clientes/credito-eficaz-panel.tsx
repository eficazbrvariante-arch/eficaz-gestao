"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";
import { Dialog } from "@/components/ui/dialog";
import {
  setCreditLimitAction,
  blockCreditoEficazAction,
  unblockCreditoEficazAction,
  resetCreditoEficazPinAction,
  registerCreditoEficazPaymentAction,
} from "../credito-eficaz/actions";
import type { CustomerCreditSummary } from "@/modules/credito-eficaz/credito-eficaz-service";

export type CreditoEficazUsageRow = {
  id: string;
  /** `null` quando a origem é um financiamento de OS (Adendo), não uma venda do PDV. */
  saleId: string | null;
  amount: number;
  status: "OPEN" | "PAID" | "CANCELLED";
  dueDate: Date;
  createdAt: Date;
  saleNumber: number | null;
  paidAmount: number;
  /** Cada pagamento registrado contra esta obrigação — usado só pra calcular pontualidade (Adendo). */
  paymentDates: Date[];
  /** Preenchidos só numa parcela de financiamento de OS (Adendo) — ex.: "2 de 3". */
  installmentNumber: number | null;
  installmentCount: number | null;
  repairOrderNumber: number | null;
};

export function CreditoEficazPanel({
  customerId,
  summary,
  usages,
}: {
  customerId: string;
  summary: CustomerCreditSummary;
  usages: CreditoEficazUsageRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();

  const [newLimit, setNewLimit] = useState(String(summary.limitAmount));
  const [limitNote, setLimitNote] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [newPin, setNewPin] = useState("");

  const [paymentTarget, setPaymentTarget] = useState<CreditoEficazUsageRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("PIX");

  function runAction(promise: Promise<{ error?: string; success?: string }>, onSuccess?: () => void) {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await promise;
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setFeedback({ type: "success", message: result.success! });
      onSuccess?.();
    });
  }

  function handleSetLimit() {
    runAction(
      setCreditLimitAction(customerId, { newLimit: Number(newLimit), note: limitNote }),
      () => setLimitNote("")
    );
  }

  function handleBlock() {
    if (!blockReason.trim()) return;
    runAction(blockCreditoEficazAction(customerId, { reason: blockReason }), () => {
      setBlockReason("");
      setShowBlockDialog(false);
    });
  }

  function handleUnblock() {
    runAction(unblockCreditoEficazAction(customerId));
  }

  function handleResetPin() {
    if (!/^\d{4}$/.test(newPin)) {
      setFeedback({ type: "error", message: "O PIN precisa ter exatamente 4 dígitos." });
      return;
    }
    runAction(resetCreditoEficazPinAction(customerId, newPin), () => setNewPin(""));
  }

  function confirmPayment() {
    if (!paymentTarget) return;
    runAction(
      registerCreditoEficazPaymentAction(customerId, {
        usageId: paymentTarget.id,
        amount: Number(paymentAmount),
        paidAt: paymentDate,
        method: paymentMethod,
      }),
      () => {
        setPaymentTarget(null);
        setPaymentAmount("");
      }
    );
  }

  const totalOperated = usages.reduce((sum, u) => sum + u.amount, 0);
  const totalPaid = usages.reduce((sum, u) => sum + u.paidAmount, 0);
  let paidOnTime = 0;
  let paidLate = 0;
  for (const usage of usages) {
    for (const paidAt of usage.paymentDates) {
      if (paidAt <= usage.dueDate) paidOnTime += 1;
      else paidLate += 1;
    }
  }

  return (
    <div className="space-y-4">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Limite</p>
          <p className="font-semibold text-slate-900">{formatBRL(summary.limitAmount)}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Utilizado</p>
          <p className="font-semibold text-slate-900">{formatBRL(summary.usedAmount)}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Disponível</p>
          <p className="font-semibold text-emerald-700">{formatBRL(summary.availableAmount)}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Status</p>
          <p className={`font-semibold ${summary.blocked ? "text-red-600" : "text-emerald-700"}`}>
            {summary.blocked ? "Bloqueado" : "Ativo"}
          </p>
        </div>
      </div>
      {summary.blocked && summary.blockedReason && (
        <p className="text-sm text-red-600">Motivo do bloqueio: {summary.blockedReason}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Total já utilizado</p>
          <p className="font-semibold text-slate-900">{formatBRL(totalOperated)}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Total pago</p>
          <p className="font-semibold text-emerald-700">{formatBRL(totalPaid)}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Operações</p>
          <p className="font-semibold text-slate-900">{usages.length}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Pontualidade</p>
          <p className="font-semibold text-slate-900">
            {paidOnTime} no prazo · {paidLate} com atraso
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Origem</th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Vencimento</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Pago</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {usages.map((usage) => {
              const overdue = usage.status === "OPEN" && usage.dueDate < new Date();
              return (
                <tr key={usage.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 text-slate-500">
                    {usage.saleId && usage.saleNumber ? (
                      <Link href={`/vendas/${usage.saleId}`} className="hover:underline">
                        Venda #{usage.saleNumber}
                      </Link>
                    ) : usage.repairOrderNumber ? (
                      <span>
                        OS #{usage.repairOrderNumber}
                        {usage.installmentNumber && usage.installmentCount
                          ? ` — parcela ${usage.installmentNumber}/${usage.installmentCount}`
                          : ""}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{formatDateTime(usage.createdAt)}</td>
                  <td className={`px-3 py-2 ${overdue ? "font-medium text-red-600" : "text-slate-500"}`}>
                    {formatDate(usage.dueDate)}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{formatBRL(usage.amount)}</td>
                  <td className="px-3 py-2 text-slate-500">{formatBRL(usage.paidAmount)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        usage.status === "PAID"
                          ? "bg-emerald-50 text-emerald-700"
                          : usage.status === "CANCELLED"
                            ? "bg-slate-100 text-slate-500"
                            : overdue
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {usage.status === "PAID"
                        ? "Pago"
                        : usage.status === "CANCELLED"
                          ? "Cancelado (estornado)"
                          : overdue
                            ? "Vencido"
                            : "Em aberto"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {usage.status === "OPEN" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setPaymentTarget(usage);
                          setPaymentAmount(String(round2(usage.amount - usage.paidAmount)));
                        }}
                        className="text-xs font-medium text-slate-700 hover:underline disabled:opacity-50"
                      >
                        Registrar pagamento
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {usages.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  Nenhuma compra com Crédito Eficaz ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Alterar limite</h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ce-limit">Novo limite (R$)</Label>
              <Input
                id="ce-limit"
                type="number"
                min={0}
                step="0.01"
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ce-limit-note">Observação (opcional)</Label>
              <Textarea id="ce-limit-note" rows={2} value={limitNote} onChange={(e) => setLimitNote(e.target.value)} />
            </div>
            <Button type="button" disabled={isPending || !newLimit} onClick={handleSetLimit} fullWidth={false} className="px-4">
              Salvar limite
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Bloqueio</h3>
          <p className="mb-3 text-xs text-slate-500">
            Impede novo uso no PDV, sem apagar limite/histórico — sempre reversível.
          </p>
          {summary.blocked ? (
            <Button type="button" variant="secondary" disabled={isPending} onClick={handleUnblock} fullWidth={false} className="px-4">
              Desbloquear
            </Button>
          ) : (
            <Button type="button" variant="secondary" disabled={isPending} onClick={() => setShowBlockDialog(true)} fullWidth={false} className="px-4">
              Bloquear
            </Button>
          )}
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Redefinir PIN</h3>
          <p className="mb-3 text-xs text-slate-500">Pro cliente que esqueceu o PIN de confirmação no caixa.</p>
          <div className="space-y-3">
            <Input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Novo PIN (4 dígitos)"
            />
            <Button type="button" variant="secondary" disabled={isPending || newPin.length !== 4} onClick={handleResetPin} fullWidth={false} className="px-4">
              Redefinir
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={showBlockDialog}
        onClose={() => setShowBlockDialog(false)}
        title="Bloquear Crédito Eficaz"
        description="O motivo fica registrado na auditoria."
        footer={
          <>
            <Button variant="secondary" fullWidth={false} onClick={() => setShowBlockDialog(false)}>
              Cancelar
            </Button>
            <Button variant="brand" fullWidth={false} disabled={isPending || !blockReason.trim()} onClick={handleBlock}>
              Confirmar bloqueio
            </Button>
          </>
        }
      >
        <Textarea value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Motivo do bloqueio" rows={3} />
      </Dialog>

      <Dialog
        open={paymentTarget !== null}
        onClose={() => setPaymentTarget(null)}
        title="Registrar pagamento"
        description={paymentTarget ? `Obrigação de ${formatBRL(paymentTarget.amount)}, já pago ${formatBRL(paymentTarget.paidAmount)}.` : ""}
        footer={
          <>
            <Button variant="secondary" fullWidth={false} onClick={() => setPaymentTarget(null)}>
              Cancelar
            </Button>
            <Button variant="brand" fullWidth={false} disabled={isPending || !paymentAmount} onClick={confirmPayment}>
              Confirmar pagamento
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="ce-payment-amount">Valor (R$)</Label>
            <Input id="ce-payment-amount" type="number" min={0} step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ce-payment-date">Data</Label>
            <Input id="ce-payment-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ce-payment-method">Forma recebida</Label>
            <Input id="ce-payment-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Ex.: PIX, dinheiro" />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
