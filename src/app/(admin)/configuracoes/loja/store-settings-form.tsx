"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  storeSettingsSchema,
  PAYMENT_METHOD_OPTIONS,
  WEEKDAY_LABELS,
  type StoreSettingsInput,
  type StoreSettingsFormValues,
} from "@/lib/validations/store-settings";
import { updateStoreSettingsAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

export function StoreSettingsForm({ defaultValues }: { defaultValues: StoreSettingsInput }) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<StoreSettingsFormValues, unknown, StoreSettingsInput>({
    resolver: zodResolver(storeSettingsSchema),
    defaultValues,
  });

  const installmentsEnabled = watch("installmentsEnabled");

  const onSubmit = (data: StoreSettingsInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await updateStoreSettingsAction(data);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else if (result?.success) {
        setFeedback({ type: "success", message: result.success });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Horário de atendimento</h2>
        <p className="mb-4 text-xs text-slate-500">
          Exibido no rodapé da loja, com indicador de &quot;aberto agora&quot;. Dias marcados como
          fechado não entram no cálculo.
        </p>
        <div className="space-y-2">
          {WEEKDAY_LABELS.map((label, index) => {
            const closed = watch(`businessHours.${index}.closed`);
            return (
              <div
                key={label}
                className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 px-3 py-2"
              >
                <span className="w-32 shrink-0 text-sm text-slate-700">{label}</span>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <Checkbox {...register(`businessHours.${index}.closed`)} />
                  Fechado
                </label>
                {!closed && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      className="w-28"
                      {...register(`businessHours.${index}.opensAt`)}
                    />
                    <span className="text-slate-400">até</span>
                    <Input
                      type="time"
                      className="w-28"
                      {...register(`businessHours.${index}.closesAt`)}
                    />
                  </div>
                )}
                <input
                  type="hidden"
                  value={index}
                  {...register(`businessHours.${index}.day`, { valueAsNumber: true })}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Políticas e institucional</h2>
        <p className="mb-4 text-xs text-slate-500">
          Cada campo preenchido vira uma página própria, linkada no rodapé. Vazio, o link some —
          nunca mostramos uma política que a loja não escreveu.
        </p>
        <div className="mb-4">
          <Label htmlFor="aboutText">Quem somos</Label>
          <Textarea id="aboutText" rows={3} {...register("aboutText")} />
        </div>
        <div className="mb-4">
          <Label htmlFor="exchangePolicy">Política de troca</Label>
          <Textarea id="exchangePolicy" rows={3} {...register("exchangePolicy")} />
        </div>
        <div className="mb-4">
          <Label htmlFor="warrantyPolicy">Garantia</Label>
          <Textarea id="warrantyPolicy" rows={3} {...register("warrantyPolicy")} />
        </div>
        <div className="mb-2">
          <Label htmlFor="privacyPolicy">Política de privacidade</Label>
          <Textarea id="privacyPolicy" rows={3} {...register("privacyPolicy")} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Formas de pagamento aceitas</h2>
        <p className="mb-4 text-xs text-slate-500">
          Controla o que aparece na barra de confiança e no rodapé da loja.
        </p>
        <div className="flex flex-wrap gap-4">
          {PAYMENT_METHOD_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
              <Checkbox value={option.value} {...register("acceptedPaymentMethods")} />
              {option.label}
            </label>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Parcelamento</h2>
        <p className="mb-4 text-xs text-slate-500">
          Informativo — a loja não tem gateway de cartão integrado, o pagamento é combinado.
          Desligado por padrão.
        </p>
        <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
          <Checkbox {...register("installmentsEnabled")} />
          Mostrar parcelamento nos produtos
        </label>
        {installmentsEnabled && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="maxInstallments">Máximo de parcelas</Label>
              <Input
                id="maxInstallments"
                type="number"
                step="1"
                min={2}
                max={24}
                {...register("maxInstallments")}
              />
              <FieldError message={errors.maxInstallments?.message} />
            </div>
            <div>
              <Label htmlFor="minInstallmentValue">Valor mínimo por parcela (R$)</Label>
              <Input
                id="minInstallmentValue"
                type="number"
                step="0.01"
                {...register("minInstallmentValue")}
              />
              <FieldError message={errors.minInstallmentValue?.message} />
            </div>
          </div>
        )}
      </section>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}
