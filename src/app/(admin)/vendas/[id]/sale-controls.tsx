"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  cancelSaleSchema,
  type CancelSaleInput,
  type CancelSaleFormValues,
} from "@/lib/validations/sale";
import { cancelSaleAction } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      Imprimir comprovante
    </button>
  );
}

export function SaleActions({
  saleId,
  canCancel,
  isCancelled,
  openCancelForm = false,
}: {
  saleId: string;
  canCancel: boolean;
  isCancelled: boolean;
  /** Abre o formulário de cancelamento já expandido (link direto da lista de vendas). */
  openCancelForm?: boolean;
}) {
  const [showCancel, setShowCancel] = useState(openCancelForm && canCancel && !isCancelled);
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CancelSaleFormValues, unknown, CancelSaleInput>({
    resolver: zodResolver(cancelSaleSchema),
  });

  const onSubmit = (data: CancelSaleInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await cancelSaleAction(saleId, data);
      if (result?.error) setServerError(result.error);
      else setShowCancel(false);
    });
  };

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap gap-2">
        <PrintButton />
        <Link
          href="/pdv"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nova venda
        </Link>
        <Link
          href="/vendas"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Ver todas as vendas
        </Link>
        {canCancel && !isCancelled && (
          <button
            type="button"
            onClick={() => setShowCancel((v) => !v)}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Cancelar venda
          </button>
        )}
      </div>

      {showCancel && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="mt-4 max-w-md rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="mb-3 text-sm text-red-900">
            O cancelamento devolve os itens ao estoque e mantém a venda no histórico como
            cancelada. Esta ação não pode ser desfeita.
          </p>
          <FormBanner message={serverError} variant="error" />

          <div className="mb-3">
            <Label htmlFor="reason">Motivo do cancelamento</Label>
            <Input id="reason" autoFocus {...register("reason")} />
            <FieldError message={errors.reason?.message} />
          </div>

          <Button
            type="submit"
            disabled={isPending}
            fullWidth={false}
            className="bg-red-700 px-4 hover:bg-red-800"
          >
            {isPending ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </form>
      )}
    </div>
  );
}
