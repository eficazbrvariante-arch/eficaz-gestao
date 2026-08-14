"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  convenioSchema,
  type ConvenioFormValues,
  type ConvenioInput,
} from "@/lib/validations/convenio";
import { createConvenioAction, updateConvenioAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import { ImageUploadField } from "@/components/ui/image-upload-field";

export function ConvenioForm({
  convenioId,
  defaultValues,
}: {
  convenioId?: string;
  defaultValues?: Partial<ConvenioFormValues>;
}) {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ConvenioFormValues, unknown, ConvenioInput>({
    resolver: zodResolver(convenioSchema),
    defaultValues: {
      active: true,
      requireProof: true,
      usesPerPeriod: 1,
      periodDays: 1,
      benefitAmount: 0,
      ...defaultValues,
    },
  });

  const onSubmit = (data: ConvenioInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = convenioId
        ? await updateConvenioAction(convenioId, data)
        : await createConvenioAction(data);
      if (result?.error) {
        setServerError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={serverError} variant="error" />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Nome da empresa parceira</Label>
          <Input id="name" placeholder="Havan" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="slug">Identificador</Label>
          <Input id="slug" placeholder="havan" {...register("slug")} />
          <p className="mt-1 text-xs text-slate-500">
            Só letras minúsculas, números e hífen — vai ser usado no link de cadastro a partir da
            próxima fase.
          </p>
          <FieldError message={errors.slug?.message} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="responsibleName">Responsável na empresa parceira</Label>
          <Input id="responsibleName" {...register("responsibleName")} />
        </div>
        <div>
          <Label htmlFor="responsiblePhone">Telefone do responsável</Label>
          <Input id="responsiblePhone" {...register("responsiblePhone")} />
        </div>
      </div>

      <div className="mb-6">
        <Label>Logotipo (opcional)</Label>
        <ImageUploadField
          value={watch("logoUrl") ?? undefined}
          onChange={(url) => setValue("logoUrl", url, { shouldDirty: true })}
        />
      </div>

      <div className="mb-6 rounded-md border border-slate-200 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-900">Regras do benefício</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="benefitAmount">Valor do benefício (R$)</Label>
            <Input id="benefitAmount" type="number" step="0.01" min={0} {...register("benefitAmount")} />
            <FieldError message={errors.benefitAmount?.message} />
          </div>
          <div>
            <Label htmlFor="usesPerPeriod">Usos permitidos</Label>
            <Input id="usesPerPeriod" type="number" step="1" min={1} {...register("usesPerPeriod")} />
            <FieldError message={errors.usesPerPeriod?.message} />
          </div>
          <div>
            <Label htmlFor="periodDays">A cada quantos dias</Label>
            <Input id="periodDays" type="number" step="1" min={1} {...register("periodDays")} />
            <p className="mt-1 text-xs text-slate-500">1 = por dia, resetando à meia-noite.</p>
            <FieldError message={errors.periodDays?.message} />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <Checkbox {...register("requireProof")} />
          Exigir comprovante no cadastro do colaborador
        </label>
      </div>

      <label className="mb-6 flex items-center gap-2 text-sm text-slate-700">
        <Checkbox {...register("active")} />
        Convênio ativo
      </label>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Salvar convênio"}
      </Button>
    </form>
  );
}
