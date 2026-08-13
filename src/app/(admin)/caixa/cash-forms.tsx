"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  openCashSchema,
  closeCashSchema,
  cashMovementSchema,
  type OpenCashInput,
  type OpenCashFormValues,
  type CloseCashInput,
  type CloseCashFormValues,
  type CashMovementInput,
  type CashMovementFormValues,
} from "@/lib/validations/cash";
import {
  openCashRegisterAction,
  closeCashRegisterAction,
  createCashMovementAction,
} from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import { formatBRL } from "@/lib/format";

type Feedback = { type: "success" | "error"; message: string } | undefined;

export function OpenCashForm() {
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OpenCashFormValues, unknown, OpenCashInput>({
    resolver: zodResolver(openCashSchema),
    defaultValues: { openingAmount: 0 },
  });

  const onSubmit = (data: OpenCashInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await openCashRegisterAction(data);
      if (result?.error) setFeedback({ type: "error", message: result.error });
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-4">
        <Label htmlFor="openingAmount">Valor inicial na gaveta (R$)</Label>
        <Input
          id="openingAmount"
          type="number"
          step="0.01"
          autoFocus
          {...register("openingAmount")}
        />
        <FieldError message={errors.openingAmount?.message} />
      </div>

      <div className="mb-6">
        <Label htmlFor="notes">Observações</Label>
        <Input id="notes" {...register("notes")} />
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Abrindo..." : "Abrir caixa"}
      </Button>
    </form>
  );
}

function DifferenceLine({
  difference,
  positiveLabel,
  negativeLabel,
}: {
  difference: number;
  positiveLabel: string;
  negativeLabel: string;
}) {
  return (
    <>
      <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-medium">
        <span className="text-slate-700">Diferença</span>
        <span
          className={
            Math.abs(difference) < 0.005
              ? "text-slate-900"
              : difference > 0
                ? "text-emerald-700"
                : "text-red-600"
          }
        >
          {difference > 0 ? "+" : ""}
          {formatBRL(difference)}
        </span>
      </div>
      {Math.abs(difference) >= 0.005 && (
        <p className="mt-2 text-xs text-slate-500">
          {difference > 0 ? positiveLabel : negativeLabel}
        </p>
      )}
    </>
  );
}

export function CloseCashForm({
  expectedInDrawer,
  expectedDebit,
  expectedCredit,
  expectedPix,
}: {
  expectedInDrawer: number;
  expectedDebit: number;
  expectedCredit: number;
  expectedPix: number;
}) {
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CloseCashFormValues, unknown, CloseCashInput>({
    resolver: zodResolver(closeCashSchema),
    defaultValues: {
      countedAmount: expectedInDrawer,
      countedDebitAmount: expectedDebit,
      countedCreditAmount: expectedCredit,
      countedPixAmount: expectedPix,
    },
  });

  const cashDifference = Number(watch("countedAmount") ?? 0) - expectedInDrawer;
  const debitDifference = Number(watch("countedDebitAmount") ?? 0) - expectedDebit;
  const creditDifference = Number(watch("countedCreditAmount") ?? 0) - expectedCredit;
  const pixDifference = Number(watch("countedPixAmount") ?? 0) - expectedPix;

  const onSubmit = (data: CloseCashInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await closeCashRegisterAction(data);
      if (result?.error) setFeedback({ type: "error", message: result.error });
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-4">
        <Label htmlFor="countedAmount">Dinheiro contado na gaveta (R$)</Label>
        <Input id="countedAmount" type="number" step="0.01" {...register("countedAmount")} />
        <FieldError message={errors.countedAmount?.message} />
      </div>
      <div className="mb-4 rounded-md bg-slate-50 p-3 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Esperado pelo sistema (dinheiro)</span>
          <span>{formatBRL(expectedInDrawer)}</span>
        </div>
        <DifferenceLine
          difference={cashDifference}
          positiveLabel="Há mais dinheiro na gaveta do que o esperado (sobra)."
          negativeLabel="Falta dinheiro na gaveta em relação ao esperado."
        />
      </div>

      <div className="mb-4">
        <Label htmlFor="countedDebitAmount">Débito conferido (R$)</Label>
        <Input
          id="countedDebitAmount"
          type="number"
          step="0.01"
          {...register("countedDebitAmount")}
        />
        <FieldError message={errors.countedDebitAmount?.message} />
      </div>
      <div className="mb-4 rounded-md bg-slate-50 p-3 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Esperado pelo sistema (débito)</span>
          <span>{formatBRL(expectedDebit)}</span>
        </div>
        <DifferenceLine
          difference={debitDifference}
          positiveLabel="Há mais no débito do que o esperado."
          negativeLabel="Falta valor no débito em relação ao esperado."
        />
      </div>

      <div className="mb-4">
        <Label htmlFor="countedCreditAmount">Crédito conferido (R$)</Label>
        <Input
          id="countedCreditAmount"
          type="number"
          step="0.01"
          {...register("countedCreditAmount")}
        />
        <FieldError message={errors.countedCreditAmount?.message} />
      </div>
      <div className="mb-4 rounded-md bg-slate-50 p-3 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Esperado pelo sistema (crédito)</span>
          <span>{formatBRL(expectedCredit)}</span>
        </div>
        <DifferenceLine
          difference={creditDifference}
          positiveLabel="Há mais no crédito do que o esperado."
          negativeLabel="Falta valor no crédito em relação ao esperado."
        />
      </div>

      <div className="mb-4">
        <Label htmlFor="countedPixAmount">Pix conferido (R$)</Label>
        <Input id="countedPixAmount" type="number" step="0.01" {...register("countedPixAmount")} />
        <FieldError message={errors.countedPixAmount?.message} />
      </div>
      <div className="mb-4 rounded-md bg-slate-50 p-3 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Esperado pelo sistema (Pix)</span>
          <span>{formatBRL(expectedPix)}</span>
        </div>
        <DifferenceLine
          difference={pixDifference}
          positiveLabel="Há mais no Pix do que o esperado."
          negativeLabel="Falta valor no Pix em relação ao esperado."
        />
      </div>

      <div className="mb-6">
        <Label htmlFor="closeNotes">Observações do fechamento</Label>
        <Input id="closeNotes" {...register("notes")} />
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Fechando..." : "Fechar caixa"}
      </Button>
    </form>
  );
}

export function CashMovementForm() {
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CashMovementFormValues, unknown, CashMovementInput>({
    resolver: zodResolver(cashMovementSchema),
    defaultValues: { type: "WITHDRAWAL" },
  });

  const onSubmit = (data: CashMovementInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await createCashMovementAction(data);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: result?.success ?? "Registrado." });
        reset({ type: "WITHDRAWAL", amount: undefined, description: "" });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-4">
        <Label htmlFor="type">Tipo</Label>
        <Select id="type" {...register("type")}>
          <option value="WITHDRAWAL">Sangria (retirada de dinheiro)</option>
          <option value="SUPPLY">Suprimento (entrada de dinheiro)</option>
        </Select>
      </div>

      <div className="mb-4">
        <Label htmlFor="amount">Valor (R$)</Label>
        <Input id="amount" type="number" step="0.01" {...register("amount")} />
        <FieldError message={errors.amount?.message} />
      </div>

      <div className="mb-6">
        <Label htmlFor="description">Motivo</Label>
        <Input id="description" placeholder="Ex.: depósito bancário" {...register("description")} />
        <FieldError message={errors.description?.message} />
      </div>

      <Button type="submit" disabled={isPending} variant="secondary">
        {isPending ? "Registrando..." : "Registrar movimentação"}
      </Button>
    </form>
  );
}
