"use client";

import { useState, useTransition } from "react";
import { updateOrderStatusAction } from "../actions";
import { ORDER_STATUS_LABELS } from "@/modules/orders/order-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";
import type { OrderStatus } from "@/generated/prisma/enums";

export function OrderActions({
  orderId,
  nextStatus,
  canCancel,
  whatsappLink,
}: {
  orderId: string;
  nextStatus: OrderStatus | null;
  canCancel: boolean;
  whatsappLink: string | null;
}) {
  const [error, setError] = useState<string>();
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function advance() {
    if (!nextStatus) return;
    setError(undefined);
    startTransition(async () => {
      const result = await updateOrderStatusAction(orderId, { status: nextStatus, reason: "" });
      if (result?.error) setError(result.error);
    });
  }

  function cancel() {
    setError(undefined);
    if (reason.trim().length < 3) {
      setError("Descreva o motivo do cancelamento.");
      return;
    }
    startTransition(async () => {
      const result = await updateOrderStatusAction(orderId, {
        status: "CANCELLED",
        reason,
      });
      if (result?.error) setError(result.error);
      else setShowCancel(false);
    });
  }

  return (
    <div>
      <FormBanner message={error} variant="error" />

      <div className="flex flex-wrap gap-2">
        {nextStatus && (
          <Button
            type="button"
            onClick={advance}
            disabled={isPending}
            fullWidth={false}
            className="px-5"
          >
            {isPending ? "Atualizando..." : `Marcar como ${ORDER_STATUS_LABELS[nextStatus]}`}
          </Button>
        )}

        {whatsappLink && (
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Abrir no WhatsApp
          </a>
        )}

        {canCancel && (
          <button
            type="button"
            onClick={() => setShowCancel((v) => !v)}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Cancelar pedido
          </button>
        )}
      </div>

      {showCancel && (
        <div className="mt-4 max-w-md rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-3 text-sm text-red-900">
            O cancelamento devolve ao estoque os itens que já haviam sido baixados. Esta ação
            não pode ser desfeita.
          </p>
          <div className="mb-3">
            <Label htmlFor="cancelReason">Motivo do cancelamento</Label>
            <Input
              id="cancelReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
          <Button
            type="button"
            onClick={cancel}
            disabled={isPending}
            fullWidth={false}
            className="bg-red-700 px-4 hover:bg-red-800"
          >
            {isPending ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </div>
      )}
    </div>
  );
}
