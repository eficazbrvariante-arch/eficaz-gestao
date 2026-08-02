"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  catalogSettingsSchema,
  type CatalogSettingsInput,
  type CatalogSettingsFormValues,
} from "@/lib/validations/catalog-settings";
import { updateCatalogSettingsAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import { ImageUploadField } from "@/components/ui/image-upload-field";

export function CatalogSettingsForm({
  defaultValues,
}: {
  defaultValues: CatalogSettingsFormValues;
}) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CatalogSettingsFormValues, unknown, CatalogSettingsInput>({
    resolver: zodResolver(catalogSettingsSchema),
    defaultValues,
  });

  const onSubmit = (data: CatalogSettingsInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await updateCatalogSettingsAction(data);
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

      <label className="mb-6 flex items-start gap-3 text-sm text-slate-700">
        <Checkbox className="mt-0.5" {...register("catalogEnabled")} />
        <span>
          <span className="font-medium">Catálogo online ativo</span>
          <span className="block text-xs text-slate-500">
            Quando desativado, a loja fica fora do ar e os visitantes veem uma página de
            não encontrado.
          </span>
        </span>
      </label>

      <div className="mb-4">
        <Label>Logotipo</Label>
        <ImageUploadField
          value={watch("logoUrl") ?? undefined}
          onChange={(url) => setValue("logoUrl", url, { shouldDirty: true })}
        />
        <FieldError message={errors.logoUrl?.message} />
      </div>

      <div className="mb-4">
        <Label>Imagem do banner</Label>
        <ImageUploadField
          value={watch("bannerUrl") ?? undefined}
          onChange={(url) => setValue("bannerUrl", url, { shouldDirty: true })}
        />
        <FieldError message={errors.bannerUrl?.message} />
        <p className="mt-1 text-xs text-slate-400">
          Opcional. Sem imagem, o banner usa a cor principal da empresa.
        </p>
      </div>

      <div className="mb-4">
        <Label htmlFor="bannerTitle">Título do banner</Label>
        <Input
          id="bannerTitle"
          placeholder="Ex.: Eletrônicos com o melhor preço da região"
          {...register("bannerTitle")}
        />
        <FieldError message={errors.bannerTitle?.message} />
      </div>

      <div className="mb-6">
        <Label htmlFor="bannerSubtitle">Subtítulo do banner</Label>
        <Input
          id="bannerSubtitle"
          placeholder="Ex.: Retire na loja ou receba em casa"
          {...register("bannerSubtitle")}
        />
        <FieldError message={errors.bannerSubtitle?.message} />
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Salvar configurações"}
      </Button>
    </form>
  );
}
