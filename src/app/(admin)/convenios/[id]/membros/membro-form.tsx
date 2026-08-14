"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { convenioMemberSchema, type ConvenioMemberInput } from "@/lib/validations/convenio";
import { createConvenioMemberAction } from "../../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import { ImageUploadField } from "@/components/ui/image-upload-field";

/**
 * Cadastro manual (Fase 1) — Admin/Gerente preenche com os dados repassados
 * pela empresa parceira. O upload aqui aceita qualquer imagem (inclusive da
 * galeria); a câmera ao vivo obrigatória (mesmo componente já usado no
 * Ponto) entra só na Fase 2, quando o próprio colaborador se cadastra.
 */
export function MembroForm({ convenioId }: { convenioId: string }) {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ConvenioMemberInput>({
    resolver: zodResolver(convenioMemberSchema),
    defaultValues: { selfieUrl: "", proofUrl: "" },
  });

  const onSubmit = (data: ConvenioMemberInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await createConvenioMemberAction(convenioId, data);
      if (result?.error) {
        setServerError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={serverError} variant="error" />

      <div className="mb-4">
        <Label htmlFor="name">Nome do colaborador</Label>
        <Input id="name" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="document">CPF</Label>
          <Input id="document" placeholder="Só números" {...register("document")} />
          <FieldError message={errors.document?.message} />
        </div>
        <div>
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" {...register("phone")} />
        </div>
      </div>

      <div className="mb-6">
        <Label htmlFor="email">E-mail (opcional)</Label>
        <Input id="email" type="email" {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <Label>Foto do colaborador</Label>
          <ImageUploadField
            value={watch("selfieUrl")}
            onChange={(url) => setValue("selfieUrl", url, { shouldDirty: true })}
          />
          <FieldError message={errors.selfieUrl?.message} />
        </div>
        <div>
          <Label>Comprovante Havan</Label>
          <ImageUploadField
            value={watch("proofUrl")}
            onChange={(url) => setValue("proofUrl", url, { shouldDirty: true })}
          />
          <FieldError message={errors.proofUrl?.message} />
        </div>
      </div>

      <div className="mb-6 max-w-xs">
        <Label htmlFor="validUntil">Válido até (opcional)</Label>
        <Input id="validUntil" type="date" {...register("validUntil")} />
        <p className="mt-1 text-xs text-slate-500">Vazio = sem prazo definido.</p>
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Cadastrar colaborador"}
      </Button>
    </form>
  );
}
