"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormBanner } from "@/components/ui/form-banner";
import { formatBRL, formatISODate } from "@/lib/format";
import { registerCommissionPaymentAction } from "../../actions";

/**
 * Faixa "Pagar comissão" da tela do vendedor (só Admin vê o botão — ver
 * `canPayCommission`). O valor mostrado é só a prévia: o servidor recalcula
 * tudo ao confirmar e só paga venda que ainda não foi paga.
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
  canPay: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

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

  const allPaid = unpaidAmount <= 0 && paidAmount > 0;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <FormBanner message={feedback?.message} variant={feedback?.type} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-700">
          <p>
            <span className="text-slate-500">Já pago neste período:</span>{" "}
            <span className="font-semibold text-slate-900">{formatBRL(paidAmount)}</span>
            {paidCount > 0 && <span className="text-slate-500"> ({paidCount} venda(s))</span>}
          </p>
          <p>
            <span className="text-slate-500">A pagar:</span>{" "}
            <span className={`font-semibold ${unpaidAmount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {formatBRL(unpaidAmount)}
            </span>
            {unpaidCount > 0 && <span className="text-slate-500"> ({unpaidCount} venda(s))</span>}
          </p>
          {allPaid && <p className="mt-1 font-medium text-emerald-700">✓ Comissão deste período já está paga.</p>}
        </div>
        {canPay && (
          <Button
            type="button"
            variant="brand"
            fullWidth={false}
            disabled={isPending || unpaidAmount <= 0}
            onClick={() => setConfirmOpen(true)}
            className="px-4"
          >
            {unpaidAmount > 0 ? `Pagar comissão · ${formatBRL(unpaidAmount)}` : "Nada a pagar"}
          </Button>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Pagar comissão"
        description={`${sellerName} — ${formatISODate(from)} a ${formatISODate(to)}`}
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
        <p className="text-sm text-slate-700">
          Vai registrar o pagamento de <strong>{formatBRL(unpaidAmount)}</strong> ({unpaidCount} venda(s) ainda não
          paga(s) nesse período). Fica como pago na hora, entra no histórico de Colaboradores e o Ranking passa a
          mostrar esse período como pago.
        </p>
      </Dialog>
    </div>
  );
}
