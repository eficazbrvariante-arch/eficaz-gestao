"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  openCashSchema,
  closeCashSchema,
  submitCashForReviewSchema,
  finalizeCashReviewSchema,
  cashMovementSchema,
  type OpenCashInput,
  type OpenCashFormValues,
  type CloseCashInput,
  type CloseCashFormValues,
  type SubmitCashForReviewInput,
  type FinalizeCashReviewInput,
  type FinalizeCashReviewFormValues,
  type CashMovementInput,
  type CashMovementFormValues,
} from "@/lib/validations/cash";
import {
  openCashRegisterAction,
  closeCashRegisterAction,
  submitCashRegisterForReviewAction,
  finalizeCashRegisterReviewAction,
  editCashRegisterAction,
  createCashMovementAction,
} from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import { MultiImageUploadField } from "@/components/ui/multi-image-upload-field";
import { formatBRL } from "@/lib/format";
import { CashDiagnosisCard } from "@/components/cash-diagnosis-card";
import {
  editCashRegisterSchema,
  type EditCashRegisterFormValues,
  type EditCashRegisterInput,
} from "@/lib/validations/cash";

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

/**
 * Fechamento às cegas do Vendedor: só conta e digita o dinheiro (nunca vê o
 * valor esperado nem a diferença), anexa foto(s) do(s) comprovante(s) da
 * maquininha do período — não fecha o caixa, manda pra revisão do Admin
 * (ver `submitCashRegisterForReviewAction`/`canFinalizeCashRegisterReview`).
 */
export function SubmitCashForReviewForm() {
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();
  const [receiptPhotoUrls, setReceiptPhotoUrls] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Omit<SubmitCashForReviewInput, "receiptPhotoUrls">>({
    defaultValues: { countedAmount: 0 },
  });

  const onSubmit = (data: Omit<SubmitCashForReviewInput, "receiptPhotoUrls">) => {
    setFeedback(undefined);
    const parsed = submitCashForReviewSchema.safeParse({ ...data, receiptPhotoUrls });
    if (!parsed.success) {
      setFeedback({ type: "error", message: parsed.error.issues[0]?.message ?? "Dados inválidos." });
      return;
    }
    startTransition(async () => {
      // Sem sucesso explícito: a action já desloga (redireciona pra /login)
      // assim que a contagem é aceita — só sobra feedback pra tratar erro.
      const result = await submitCashRegisterForReviewAction(parsed.data);
      if (result?.error) setFeedback({ type: "error", message: result.error });
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-4">
        <Label htmlFor="countedAmount" className="text-black">
          Dinheiro contado na gaveta (R$)
        </Label>
        <Input id="countedAmount" type="number" step="0.01" autoFocus {...register("countedAmount")} />
        <FieldError message={errors.countedAmount?.message} />
      </div>

      <div className="mb-4">
        <Label className="text-black">Foto do(s) comprovante(s) da maquininha</Label>
        <MultiImageUploadField
          value={receiptPhotoUrls}
          onChange={setReceiptPhotoUrls}
          uploadUrl="/api/caixa/upload"
          alt="Comprovante da maquininha"
        />
      </div>

      <div className="mb-6">
        <Label htmlFor="reviewNotes" className="text-black">
          Observações
        </Label>
        <Input id="reviewNotes" {...register("notes")} />
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Enviando..." : "Enviar contagem para revisão"}
      </Button>
    </form>
  );
}

export type ClosedRegisterEntry = {
  key: "countedAmount" | "countedDebitAmount" | "countedCreditAmount" | "countedPixAmount";
  label: string;
  expected: number;
  counted: number;
};

function ReadOnlyClosedCard({ label, expected, counted }: { label: string; expected: number; counted: number }) {
  const difference = counted - expected;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-900">{label} esperado</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{formatBRL(expected)}</p>
      <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-sm">
        <span className="text-slate-600">Veio de fato</span>
        <span className="font-medium text-slate-900">{formatBRL(counted)}</span>
      </div>
      <div className="mt-1 flex justify-between text-sm font-medium">
        <span className="text-slate-600">Diferença</span>
        <span
          className={
            Math.abs(difference) < 0.005
              ? "text-slate-900"
              : difference > 0
                ? "text-emerald-700"
                : "text-red-600"
          }
        >
          {Math.abs(difference) < 0.005 ? formatBRL(0) : `${difference > 0 ? "+" : ""}${formatBRL(difference)}`}
        </span>
      </div>
    </div>
  );
}

/**
 * Tela de revisão de um caixa já fechado: por padrão só mostra (dinheiro,
 * débito, crédito, Pix — esperado x veio de fato — e o diagnóstico de
 * diferenças entre formas). Se `canEdit` (só ADMIN, ver
 * `canEditClosedCashRegister`), aparece um botão "Editar valores" que troca
 * pra um formulário com os quatro campos e observações — pra corrigir um
 * lançamento incorreto encontrado depois do fechamento (ex.: venda na forma
 * de pagamento errada).
 */
export function ClosedRegisterPanel({
  registerId,
  entries,
  notes,
  canEdit,
}: {
  registerId: string;
  entries: ClosedRegisterEntry[];
  notes: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  const defaultValues = {
    registerId,
    countedAmount: entries.find((e) => e.key === "countedAmount")?.counted ?? 0,
    countedDebitAmount: entries.find((e) => e.key === "countedDebitAmount")?.counted ?? 0,
    countedCreditAmount: entries.find((e) => e.key === "countedCreditAmount")?.counted ?? 0,
    countedPixAmount: entries.find((e) => e.key === "countedPixAmount")?.counted ?? 0,
    notes: notes ?? "",
  };

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<EditCashRegisterFormValues, unknown, EditCashRegisterInput>({
    resolver: zodResolver(editCashRegisterSchema),
    defaultValues,
  });

  const watched = useWatch({ control });
  const liveEntries: ClosedRegisterEntry[] = entries.map((e) => ({
    ...e,
    counted: Number(watched[e.key] ?? e.counted),
  }));

  const onSubmit = (data: EditCashRegisterInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await editCashRegisterAction(data);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  };

  if (!isEditing) {
    return (
      <>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          {entries.map((e) => (
            <ReadOnlyClosedCard key={e.key} label={e.label} expected={e.expected} counted={e.counted} />
          ))}
        </div>
        <CashDiagnosisCard
          entries={entries.map((e) => ({ label: e.label, difference: e.counted - e.expected }))}
        />
        {canEdit && (
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            className="mb-6 px-6"
            onClick={() => setIsEditing(true)}
          >
            Editar valores
          </Button>
        )}
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        {entries.map((e) => (
          <ExpectedWithCountedCard
            key={e.key}
            label={`${e.label} esperado`}
            expected={e.expected}
            counted={Number(watched[e.key] ?? e.counted)}
            inputId={e.key}
            registerField={
              <>
                <Input id={e.key} type="number" step="0.01" {...register(e.key)} />
                <FieldError message={errors[e.key]?.message} />
              </>
            }
          />
        ))}
      </div>

      <CashDiagnosisCard
        entries={liveEntries.map((e) => ({ label: e.label, difference: e.counted - e.expected }))}
      />

      <div className="mb-6">
        <Label htmlFor="notes">Observações</Label>
        <Input id="notes" {...register("notes")} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
          {isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          fullWidth={false}
          className="px-6"
          onClick={() => {
            reset(defaultValues);
            setIsEditing(false);
          }}
        >
          Cancelar
        </Button>
      </div>
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

/**
 * Cartão "esperado" de uma forma de pagamento que não passa pela gaveta,
 * com o campo pra digitar o que veio de fato (comprovante da maquininha) e
 * a diferença já calculada dentro do mesmo cartão — pedido explícito do
 * usuário: tudo num só lugar, não em cartões separados.
 */
function ExpectedWithCountedCard({
  label,
  expected,
  counted,
  inputId,
  registerField,
}: {
  label: string;
  expected: number;
  counted: number;
  inputId: string;
  registerField: ReactNode;
}) {
  const difference = counted - expected;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-900">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{formatBRL(expected)}</p>
      <div className="mt-3">
        <Label htmlFor={inputId} className="text-xs text-slate-500">
          Quanto veio de fato no período (R$)
        </Label>
        {registerField}
      </div>
      <div className="mt-2 flex justify-between text-sm font-medium">
        <span className="text-slate-600">Diferença</span>
        <span
          className={
            Math.abs(difference) < 0.005
              ? "text-slate-900"
              : difference > 0
                ? "text-emerald-700"
                : "text-red-600"
          }
        >
          {Math.abs(difference) < 0.005 ? formatBRL(0) : `${difference > 0 ? "+" : ""}${formatBRL(difference)}`}
        </span>
      </div>
    </div>
  );
}

/**
 * Só ADMIN chega a ver este formulário (ver `canFinalizeCashRegisterReview`).
 * O Vendedor só confere dinheiro às cegas; aqui o Admin confere débito,
 * crédito e Pix contra os comprovantes da maquininha e digita o valor real
 * de cada forma — vê a diferença na hora, sem precisar somar de cabeça.
 */
export function FinalizeReviewForm({
  registerId,
  expectedDebit,
  expectedCredit,
  expectedPix,
}: {
  registerId: string;
  expectedDebit: number;
  expectedCredit: number;
  expectedPix: number;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FinalizeCashReviewFormValues, unknown, FinalizeCashReviewInput>({
    resolver: zodResolver(finalizeCashReviewSchema),
    defaultValues: {
      registerId,
      countedDebitAmount: expectedDebit,
      countedCreditAmount: expectedCredit,
      countedPixAmount: expectedPix,
    },
  });

  // `useWatch` (não `watch()` cru) — ver o comentário equivalente em
  // commission-tiers-form.tsx: `watch()` direto no corpo do componente não é
  // seguro combinado com memoização do React Compiler.
  const countedDebit = Number(useWatch({ control, name: "countedDebitAmount" }) ?? 0);
  const countedCredit = Number(useWatch({ control, name: "countedCreditAmount" }) ?? 0);
  const countedPix = Number(useWatch({ control, name: "countedPixAmount" }) ?? 0);

  const onSubmit = (data: FinalizeCashReviewInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await finalizeCashRegisterReviewAction(data);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
        return;
      }
      router.push("/caixa/historico");
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <p className="mb-2 text-xs text-text-muted">
        Débito, crédito e Pix não passam pela gaveta — confira o comprovante da maquininha (fotos
        acima) e digite o que de fato veio em cada forma.
      </p>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ExpectedWithCountedCard
          label="Débito esperado"
          expected={expectedDebit}
          counted={countedDebit}
          inputId="countedDebitAmount"
          registerField={
            <>
              <Input id="countedDebitAmount" type="number" step="0.01" {...register("countedDebitAmount")} />
              <FieldError message={errors.countedDebitAmount?.message} />
            </>
          }
        />
        <ExpectedWithCountedCard
          label="Crédito esperado"
          expected={expectedCredit}
          counted={countedCredit}
          inputId="countedCreditAmount"
          registerField={
            <>
              <Input id="countedCreditAmount" type="number" step="0.01" {...register("countedCreditAmount")} />
              <FieldError message={errors.countedCreditAmount?.message} />
            </>
          }
        />
        <ExpectedWithCountedCard
          label="Pix esperado"
          expected={expectedPix}
          counted={countedPix}
          inputId="countedPixAmount"
          registerField={
            <>
              <Input id="countedPixAmount" type="number" step="0.01" {...register("countedPixAmount")} />
              <FieldError message={errors.countedPixAmount?.message} />
            </>
          }
        />
      </div>

      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Finalizar fechamento</h2>
        <p className="mb-4 text-sm text-slate-900">
          Confira a contagem e as fotos acima. Ao finalizar, o caixa fica marcado como fechado.
        </p>
        <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
          {isPending ? "Finalizando..." : "Finalizar fechamento"}
        </Button>
      </div>
    </form>
  );
}
