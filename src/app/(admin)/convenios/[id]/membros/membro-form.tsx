"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
  const [credentialUrl, setCredentialUrl] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        return;
      }
      if (result?.credentialUrl) setCredentialUrl(result.credentialUrl);
      if (result?.shortCode) setShortCode(result.shortCode);
    });
  };

  async function handleCopy() {
    if (!credentialUrl) return;
    try {
      await navigator.clipboard.writeText(credentialUrl);
      setCopied(true);
    } catch {
      setServerError("Não foi possível copiar — selecione e copie manualmente.");
    }
  }

  if (credentialUrl) {
    return (
      <div>
        <h2 className="mb-2 text-base font-semibold text-slate-900">Colaborador cadastrado!</h2>
        <p className="mb-3 text-sm text-slate-500">
          Repasse o código abaixo pra ele — é o mais rápido pra usar no caixa, sem precisar de
          link nem de internet. Se quiser, repasse o link também: mostra o status do cadastro e,
          quando aprovado, o QR Code da carteirinha. Copie agora, nenhum dos dois aparece de novo
          depois de sair desta tela.
        </p>
        {shortCode && (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-medium tracking-wide text-emerald-700 uppercase">Código</p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-emerald-900">
              {shortCode}
            </p>
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <code className="flex-1 break-all rounded bg-white px-2 py-1.5 text-xs text-slate-700">
            {credentialUrl}
          </code>
          <Button type="button" variant="secondary" fullWidth={false} onClick={handleCopy}>
            {copied ? "Copiado!" : "Copiar"}
          </Button>
        </div>
        <Link href={`/convenios/${convenioId}`} className="text-sm text-slate-600 hover:underline">
          ← Voltar para o convênio
        </Link>
      </div>
    );
  }

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
