"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormBanner } from "@/components/ui/form-banner";
import { formatBRL, formatDateTime, formatISODate } from "@/lib/format";
import { PERIOD_PICKER_DIRTY_EVENT } from "../../../relatorios/report-nav";
import { registerCommissionPaymentAction, undoCommissionPaymentAction } from "../../actions";

export type CommissionPaymentView = {
  id: string;
  amount: number;
  /** `YYYY-MM-DD` — período usado ao pagar (inclusive nas duas pontas). */
  from: string | null;
  to: string | null;
  saleCount: number;
  createdAt: Date;
  createdByName: string;
};

type Feedback = { type: "success" | "error"; message: string };

function periodLabel(from: string | null, to: string | null) {
  return from && to ? `${formatISODate(from)} a ${formatISODate(to)}` : "Período não registrado";
}

/** Pagamento cujo período toca o período da tela (datas ISO comparam como texto). */
function overlaps(payment: CommissionPaymentView, from: string, to: string) {
  return !!payment.from && !!payment.to && payment.from <= to && payment.to >= from;
}

/**
 * Faixa "Pagar comissão" da tela do vendedor (só Admin vê o botão — ver
 * `canPayCommission`). O valor é só prévia: o servidor recalcula tudo e só
 * paga venda ainda não paga. Mostra SEMPRE o período exato que vai ser pago e
 * cada pagamento já feito com início e fim — e trava o botão enquanto as
 * datas digitadas no filtro não foram aplicadas: sem "Aplicar", a tela segue
 * no período antigo e o pagamento sairia de um período diferente do que
 * aparece nos campos.
 */
export function CommissionPaymentPanel({
  userId,
  sellerName,
  from,
  to,
  unpaidAmount,
  unpaidCount,
  paidAmount,
  paidCount,
  payments,
  canPay,
}: {
  userId: string;
  sellerName: string;
  from: string;
  to: string;
  unpaidAmount: number;
  unpaidCount: number;
  paidAmount: number;
  paidCount: number;
  payments: CommissionPaymentView[];
  canPay: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [pickerDirty, setPickerDirty] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function onDirty(event: Event) {
      setPickerDirty(Boolean((event as CustomEvent<boolean>).detail));
    }
    window.addEventListener(PERIOD_PICKER_DIRTY_EVENT, onDirty);
    return () => window.removeEventListener(PERIOD_PICKER_DIRTY_EVENT, onDirty);
  }, []);

  function pay() {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await registerCommissionPaymentAction({ userId, from, to });
      setConfirmOpen(false);
      setFeedback(
        "error" in result ? { type: "error", message: result.error } : { type: "success", message: result.success }
      );
      router.refresh();
    });
  }

  const covering = payments.filter((payment) => overlaps(payment, from, to));
  const allPaid = unpaidAmount <= 0 && paidAmount > 0;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <p className="mb-3 text-base text-slate-900">
        Período selecionado: <strong>{periodLabel(from, to)}</strong>
      </p>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2 text-sm text-slate-700">
          <div>
            <p>
              <span className="text-slate-500">Já pago neste período:</span>{" "}
              <span className="font-semibold text-slate-900">{formatBRL(paidAmount)}</span>
              {paidCount > 0 && <span className="text-slate-500"> ({paidCount} venda(s))</span>}
            </p>
            {covering.length > 0 && (
              <ul className="mt-1 space-y-1">
                {covering.map((payment) => (
                  <li key={payment.id} className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
                    Pagamento de <strong>{periodLabel(payment.from, payment.to)}</strong> —{" "}
                    {formatBRL(payment.amount)} · {payment.saleCount} venda(s) · pago em{" "}
                    {formatDateTime(payment.createdAt)} por {payment.createdByName}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p>
            <span className="text-slate-500">A pagar neste período:</span>{" "}
            <span className={`font-semibold ${unpaidAmount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {formatBRL(unpaidAmount)}
            </span>
            {unpaidCount > 0 && <span className="text-slate-500"> ({unpaidCount} venda(s))</span>}
          </p>
          {allPaid && (
            <p className="font-medium text-emerald-700">
              ✓ Todas as vendas de {periodLabel(from, to)} já estão pagas.
            </p>
          )}
        </div>

        {canPay && (
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              variant="brand"
              fullWidth={false}
              disabled={isPending || unpaidAmount <= 0 || pickerDirty}
              onClick={() => setConfirmOpen(true)}
              className="px-4"
            >
              {unpaidAmount > 0
                ? `Pagar ${formatISODate(from)} a ${formatISODate(to)} · ${formatBRL(unpaidAmount)}`
                : "Nada a pagar neste período"}
            </Button>
            {pickerDirty && (
              <p className="max-w-xs text-right text-xs font-medium text-red-600">
                Você mudou as datas do filtro — clique em &quot;Aplicar&quot; antes de pagar.
              </p>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Pagar comissão — ${sellerName}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" fullWidth={false} onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="brand" fullWidth={false} disabled={isPending} onClick={pay}>
              {isPending ? "Pagando..." : `Confirmar ${formatBRL(unpaidAmount)}`}
            </Button>
          </div>
        }
      >
        <p className="mb-2 text-sm text-slate-600">Período que vai ser pago:</p>
        <p className="mb-3 text-2xl font-bold text-slate-900">
          {formatISODate(from)} a {formatISODate(to)}
        </p>
        <p className="text-sm text-slate-700">
          <strong>{formatBRL(unpaidAmount)}</strong> — {unpaidCount} venda(s) ainda não paga(s) nesse período. Se
          as datas não forem essas, clique em Cancelar, ajuste o filtro e clique em &quot;Aplicar&quot;.
        </p>
      </Dialog>
    </div>
  );
}

/**
 * Histórico de pagamentos de comissão do vendedor, com início e fim de cada
 * um — e "Desfazer pagamento" (só Admin), que apaga o pagamento e devolve as
 * vendas pra "A pagar" (pra corrigir um pagamento feito no período errado).
 */
export function CommissionPaymentHistory({
  payments,
  canUndo,
}: {
  payments: CommissionPaymentView[];
  canUndo: boolean;
}) {
  const router = useRouter();
  const [confirmUndo, setConfirmUndo] = useState<CommissionPaymentView | null>(null);
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  function undo() {
    if (!confirmUndo) return;
    setFeedback(undefined);
    startTransition(async () => {
      const result = await undoCommissionPaymentAction(confirmUndo.id);
      setConfirmUndo(null);
      setFeedback(
        "error" in result ? { type: "error", message: result.error } : { type: "success", message: result.success }
      );
      router.refresh();
    });
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Pagamentos de comissão</p>
      </div>
      <div className="px-4 pt-2">
        <FormBanner message={feedback?.message} variant={feedback?.type} />
      </div>
      {payments.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">Nenhuma comissão paga ainda.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {payments.map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">
                  De {payment.from ? formatISODate(payment.from) : "—"} até{" "}
                  {payment.to ? formatISODate(payment.to) : "—"}{" "}
                  <span className="font-normal text-slate-500">· {payment.saleCount} venda(s)</span>
                </p>
                <p className="text-xs text-slate-500">
                  Pago em {formatDateTime(payment.createdAt)} por {payment.createdByName}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-900">{formatBRL(payment.amount)}</span>
                {canUndo && (
                  <Button
                    type="button"
                    variant="ghost"
                    fullWidth={false}
                    disabled={isPending}
                    onClick={() => setConfirmUndo(payment)}
                    className="px-3 py-1 text-xs text-red-600"
                  >
                    Desfazer pagamento
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={confirmUndo !== null}
        onClose={() => setConfirmUndo(null)}
        title="Desfazer pagamento de comissão"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" fullWidth={false} onClick={() => setConfirmUndo(null)}>
              Voltar
            </Button>
            <Button type="button" variant="danger" fullWidth={false} disabled={isPending} onClick={undo}>
              {isPending ? "Desfazendo..." : "Desfazer pagamento"}
            </Button>
          </div>
        }
      >
        {confirmUndo && (
          <p className="text-sm text-slate-700">
            O pagamento de <strong>{periodLabel(confirmUndo.from, confirmUndo.to)}</strong> (
            {formatBRL(confirmUndo.amount)}, {confirmUndo.saleCount} venda(s)) será apagado e essas vendas voltam
            para &quot;A pagar&quot;. Use quando o pagamento foi feito no período errado — depois é só pagar de novo
            o período certo.
          </p>
        )}
      </Dialog>
    </div>
  );
}
