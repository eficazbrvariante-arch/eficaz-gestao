"use client";

import { useMemo, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  saveCommissionTiersSchema,
  type SaveCommissionTiersFormValues,
  type SaveCommissionTiersInput,
} from "@/lib/validations/commission-tiers";
import { computeProgressiveCommission, type CommissionTierInput } from "@/lib/commission-tiers";
import { saveCommissionTiersAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import { formatBRL } from "@/lib/format";
import type { EditableCommissionTier } from "@/modules/employees/commission-tier-service";

type Feedback = { type: "success" | "error"; message: string } | undefined;

export function CommissionTiersForm({ initialTiers }: { initialTiers: EditableCommissionTier[] }) {
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();
  const [simulatedSales, setSimulatedSales] = useState("20000");

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SaveCommissionTiersFormValues, unknown, SaveCommissionTiersInput>({
    resolver: zodResolver(saveCommissionTiersSchema),
    defaultValues: {
      tiers: initialTiers.map((t) => ({
        name: t.name,
        order: t.order,
        minAmount: t.minAmount,
        maxAmount: t.maxAmount,
        percent: t.percent,
        active: t.active,
      })),
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "tiers" });

  // `useWatch` (não `watch()` chamado direto no corpo do componente) —
  // `watch()` cru não é seguro combinado com `useMemo`/memoização do React
  // Compiler (o simulador ficava "congelado" no primeiro render com ele).
  const watchedTiers = useWatch({ control, name: "tiers" });

  const onSubmit = (data: SaveCommissionTiersInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await saveCommissionTiersAction(data);
      if (result?.error) setFeedback({ type: "error", message: result.error });
      else setFeedback({ type: "success", message: result?.success ?? "Faixas salvas." });
    });
  };

  // Simulador roda 100% no navegador — mesma função pura do cálculo real,
  // sem round-trip ao servidor — usando o rascunho que está sendo editado,
  // não o que já está salvo.
  const simulation = useMemo(() => {
    const tiers: CommissionTierInput[] = (watchedTiers ?? [])
      .filter((t) => t.active)
      .map((t) => ({
        name: t.name || "—",
        order: Number(t.order) || 0,
        minAmount: Number(t.minAmount) || 0,
        // Campo "Até" nunca tocado chega como "" (valor cru do DOM, não o
        // `null` do defaultValue) — sem isso, `Number("")` vira 0 e zera a
        // faixa "sem teto" inteira no simulador.
        maxAmount: t.maxAmount === null || t.maxAmount === undefined || (t.maxAmount as unknown) === "" ? null : Number(t.maxAmount),
        percent: Number(t.percent) || 0,
      }));
    return computeProgressiveCommission(Number(simulatedSales) || 0, tiers);
  }, [watchedTiers, simulatedSales]);

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FormBanner message={feedback?.message} variant={feedback?.type} />
        {errors.tiers?.root?.message && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.tiers.root.message}
          </p>
        )}
        {typeof errors.tiers?.message === "string" && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errors.tiers.message}</p>
        )}

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`tiers.${index}.name`}>Nome da faixa</Label>
                  <Input
                    id={`tiers.${index}.name`}
                    placeholder="Ex.: Bronze"
                    {...register(`tiers.${index}.name` as const)}
                  />
                  <FieldError message={errors.tiers?.[index]?.name?.message} />
                </div>
                <div className="flex items-end gap-2">
                  <Checkbox id={`tiers.${index}.active`} {...register(`tiers.${index}.active` as const)} />
                  <Label htmlFor={`tiers.${index}.active`} className="mb-0">
                    Faixa ativa
                  </Label>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor={`tiers.${index}.minAmount`}>De (R$)</Label>
                  <Input
                    id={`tiers.${index}.minAmount`}
                    type="number"
                    step="0.01"
                    {...register(`tiers.${index}.minAmount` as const)}
                  />
                </div>
                <div>
                  <Label htmlFor={`tiers.${index}.maxAmount`}>Até (R$) — vazio = sem teto</Label>
                  <Input
                    id={`tiers.${index}.maxAmount`}
                    type="number"
                    step="0.01"
                    {...register(`tiers.${index}.maxAmount` as const, {
                      setValueAs: (v) => (v === "" ? null : Number(v)),
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor={`tiers.${index}.percent`}>Percentual (%)</Label>
                  <Input
                    id={`tiers.${index}.percent`}
                    type="number"
                    step="0.01"
                    {...register(`tiers.${index}.percent` as const)}
                  />
                </div>
              </div>
              <input type="hidden" {...register(`tiers.${index}.order` as const, { valueAsNumber: true })} />
              <button
                type="button"
                onClick={() => remove(index)}
                className="mt-3 text-xs text-red-600 hover:underline"
              >
                Remover faixa
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            // `maxAmount: null` aqui vira `0` no primeiro `useWatch` de um
            // input numérico recém-anexado via `useFieldArray` (o RHF perde
            // o `null` ao hidratar o input não controlado) — usar "" (igual
            // ao valor real de um number input vazio) evita isso; "" já é
            // tratado como "sem teto" no simulador e no schema de salvar.
            append({ name: "", order: fields.length, minAmount: 0, maxAmount: "" as unknown as null, percent: 0, active: true })
          }
          className="mt-3 text-sm font-medium text-brand hover:underline"
        >
          + Adicionar faixa
        </button>

        <div className="mt-6">
          <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
            {isPending ? "Salvando..." : "Salvar faixas do próximo mês"}
          </Button>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Simulador</h2>
        <p className="mb-4 text-sm text-slate-900">
          Veja quanto essas faixas custariam pra um vendedor com um faturamento hipotético no mês,
          antes de salvar.
        </p>
        <div className="mb-4 w-48">
          <Label htmlFor="simulatedSales">Vendas no mês (R$)</Label>
          <Input
            id="simulatedSales"
            type="number"
            step="0.01"
            value={simulatedSales}
            onChange={(e) => setSimulatedSales(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 text-sm">
          {simulation.breakdown.map((row) => (
            <div key={row.name} className="flex justify-between text-slate-900">
              <span>
                {row.name} — {formatBRL(row.amountInTier)} × {row.percent}%
              </span>
              <span className="font-medium">{formatBRL(row.commission)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
            <span>Comissão total estimada</span>
            <span>{formatBRL(simulation.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
