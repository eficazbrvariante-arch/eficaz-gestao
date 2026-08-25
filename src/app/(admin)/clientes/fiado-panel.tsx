"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import {
  createFiadoEntryAction,
  grantStoreCreditAction,
  markFiadoEntryPaidAction,
  zeroStoreCreditAction,
} from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";

export type FiadoEntryRow = {
  id: string;
  amount: number;
  status: "PENDING" | "PAID";
  overdue: boolean;
  dueDate: Date | null;
  note: string | null;
  createdAt: Date;
  saleId: string | null;
  saleNumber: number | null;
};

const STATUS_BADGE: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-700",
  OVERDUE: "bg-red-50 text-red-700",
  PENDING: "bg-amber-50 text-amber-700",
};

const STATUS_LABEL: Record<string, string> = {
  PAID: "Pago",
  OVERDUE: "Vencido",
  PENDING: "Pendente",
};

export function FiadoPanel({
  customerId,
  entries,
  creditBalance,
}: {
  customerId: string;
  entries: FiadoEntryRow[];
  /** Saldo de crédito atual do cliente — só pra habilitar/desabilitar "Zerar crédito". */
  creditBalance: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();

  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");

  const [zeroReason, setZeroReason] = useState("");

  function handleCreateEntry() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await createFiadoEntryAction(customerId, { amount: Number(amount), dueDate, note });
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setAmount("");
      setDueDate("");
      setNote("");
      setFeedback({ type: "success", message: "Fiado lançado." });
    });
  }

  function handleMarkPaid(entryId: string) {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await markFiadoEntryPaidAction(customerId, entryId);
      if (result?.error) setFeedback({ type: "error", message: result.error });
    });
  }

  function handleGrantCredit() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await grantStoreCreditAction(customerId, {
        amount: Number(creditAmount),
        reason: creditReason,
      });
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setCreditAmount("");
      setCreditReason("");
      setFeedback({ type: "success", message: "Crédito de loja concedido." });
    });
  }

  function handleZeroCredit() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await zeroStoreCreditAction(customerId, { reason: zeroReason });
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setZeroReason("");
      setFeedback({ type: "success", message: "Crédito de loja zerado." });
    });
  }

  return (
    <div className="space-y-4">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Lançado em</th>
              <th className="px-3 py-2 font-medium">Vencimento</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Observação</th>
              <th className="px-3 py-2 font-medium">Venda</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const statusKey = entry.status === "PAID" ? "PAID" : entry.overdue ? "OVERDUE" : "PENDING";
              return (
                <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 text-slate-500">{formatDateTime(entry.createdAt)}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {entry.dueDate ? formatDate(entry.dueDate) : "-"}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{formatBRL(entry.amount)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[statusKey]}`}>
                      {STATUS_LABEL[statusKey]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{entry.note ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {entry.saleId ? (
                      <Link href={`/vendas/${entry.saleId}`} className="hover:underline">
                        #{entry.saleNumber}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {entry.status === "PENDING" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleMarkPaid(entry.id)}
                        className="text-xs font-medium text-slate-700 hover:underline disabled:opacity-50"
                      >
                        Marcar como pago
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  Nenhum fiado lançado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Lançar fiado</h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="fiado-amount">Valor (R$)</Label>
              <Input
                id="fiado-amount"
                type="number"
                step="0.01"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fiado-due-date">Data prevista de pagamento</Label>
              <Input
                id="fiado-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fiado-note">Observação (opcional)</Label>
              <Textarea id="fiado-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button
              type="button"
              disabled={isPending || !amount || !dueDate}
              onClick={handleCreateEntry}
              fullWidth={false}
              className="px-4"
            >
              Lançar
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Conceder crédito de loja</h3>
          <p className="mb-3 text-xs text-slate-500">
            Vira saldo disponível como forma de pagamento numa próxima compra (mesmo saldo do
            extrato acima).
          </p>
          <div className="space-y-3">
            <div>
              <Label htmlFor="credit-amount">Valor (R$)</Label>
              <Input
                id="credit-amount"
                type="number"
                step="0.01"
                min={0}
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="credit-reason">Motivo</Label>
              <Input
                id="credit-reason"
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                placeholder="Ex.: fiado quitado a maior"
              />
            </div>
            <Button
              type="button"
              disabled={isPending || !creditAmount || !creditReason}
              onClick={handleGrantCredit}
              fullWidth={false}
              className="px-4"
            >
              Conceder
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Zerar crédito de loja</h3>
          <p className="mb-3 text-xs text-slate-500">
            Ajuste administrativo — zera o saldo atual ({formatBRL(creditBalance)}) do cliente.
            Fica registrado no histórico, visível só pro Admin.
          </p>
          <div className="space-y-3">
            <div>
              <Label htmlFor="zero-credit-reason">Motivo</Label>
              <Input
                id="zero-credit-reason"
                value={zeroReason}
                onChange={(e) => setZeroReason(e.target.value)}
                placeholder="Ex.: crédito lançado por engano"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending || creditBalance <= 0 || !zeroReason}
              onClick={handleZeroCredit}
              fullWidth={false}
              className="px-4"
            >
              Zerar crédito
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
