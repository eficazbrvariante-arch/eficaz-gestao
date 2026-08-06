"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  flashDealScheduleSchema,
  type FlashDealScheduleInput,
  type FlashDealScheduleFormValues,
} from "@/lib/validations/flash-deal";
import { WEEKDAY_LABELS } from "@/lib/validations/store-settings";
import { FLASH_DEAL_ICON_OPTIONS } from "@/lib/flash-deal-icons";
import { updateFlashDealScheduleAction } from "./actions";
import { formatBRL } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import { SearchableSelect } from "@/components/ui/searchable-select";

type ProductOption = { id: string; name: string; salePrice: number };

export function FlashDealScheduleForm({
  defaultValues,
  products,
}: {
  defaultValues: FlashDealScheduleFormValues;
  products: ProductOption[];
}) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FlashDealScheduleFormValues, unknown, FlashDealScheduleInput>({
    resolver: zodResolver(flashDealScheduleSchema),
    defaultValues,
  });

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name} (${formatBRL(p.salePrice)})`,
  }));

  const onSubmit = (data: FlashDealScheduleInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await updateFlashDealScheduleAction(data);
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

      {products.length === 0 && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Nenhum produto está marcado para o catálogo online — marque ao menos um em
          &quot;Produtos&quot; antes de ativar um dia aqui.
        </p>
      )}

      {WEEKDAY_LABELS.map((label, index) => {
        const active = watch(`schedule.${index}.active`);
        const dayErrors = errors.schedule?.[index];

        return (
          <div key={label} className="mb-4 rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-900">{label}</span>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <Checkbox {...register(`schedule.${index}.active`)} />
                Ativo
              </label>
            </div>
            <input
              type="hidden"
              value={index}
              {...register(`schedule.${index}.day`, { valueAsNumber: true })}
            />

            {active && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor={`schedule.${index}.productId`}>Produto</Label>
                  <SearchableSelect
                    id={`schedule.${index}.productId`}
                    value={watch(`schedule.${index}.productId`) ?? ""}
                    onChange={(productId) =>
                      setValue(`schedule.${index}.productId`, productId, { shouldDirty: true })
                    }
                    options={productOptions}
                    placeholder="Buscar produto por nome..."
                  />
                  <FieldError message={dayErrors?.productId?.message} />
                </div>

                <div>
                  <Label htmlFor={`schedule.${index}.promoPrice`}>Preço promocional (R$)</Label>
                  <Input
                    id={`schedule.${index}.promoPrice`}
                    type="number"
                    step="0.01"
                    {...register(`schedule.${index}.promoPrice`)}
                  />
                  <FieldError message={dayErrors?.promoPrice?.message} />
                </div>

                <div>
                  <Label htmlFor={`schedule.${index}.orderLimit`}>Limite por pedido</Label>
                  <Input
                    id={`schedule.${index}.orderLimit`}
                    type="number"
                    min={1}
                    max={20}
                    step="1"
                    {...register(`schedule.${index}.orderLimit`)}
                  />
                  <FieldError message={dayErrors?.orderLimit?.message} />
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor={`schedule.${index}.badgeText`}>Texto do selo</Label>
                  <Input
                    id={`schedule.${index}.badgeText`}
                    placeholder="Ex.: Só hoje!"
                    {...register(`schedule.${index}.badgeText`)}
                  />
                  <FieldError message={dayErrors?.badgeText?.message} />
                </div>

                <div>
                  <Label htmlFor={`schedule.${index}.icon`}>Ícone</Label>
                  <Select id={`schedule.${index}.icon`} {...register(`schedule.${index}.icon`)}>
                    {FLASH_DEAL_ICON_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox {...register(`schedule.${index}.soundEnabled`)} />
                    Som ao aparecer
                  </label>
                </div>

                <div>
                  <Label htmlFor={`schedule.${index}.bgColor`}>Cor de fundo</Label>
                  <Input
                    id={`schedule.${index}.bgColor`}
                    type="color"
                    className="h-10"
                    {...register(`schedule.${index}.bgColor`)}
                  />
                </div>

                <div>
                  <Label htmlFor={`schedule.${index}.accentColor`}>Cor de destaque</Label>
                  <Input
                    id={`schedule.${index}.accentColor`}
                    type="color"
                    className="h-10"
                    {...register(`schedule.${index}.accentColor`)}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Salvar Oferta Relâmpago"}
      </Button>
    </form>
  );
}
