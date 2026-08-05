"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  pdvSettingsSchema,
  type PdvSettingsInput,
  type PdvSettingsFormValues,
} from "@/lib/validations/pdv-settings";
import { updatePdvSettingsAction } from "./actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FormBanner } from "@/components/ui/form-banner";

export function PdvSettingsForm({ defaultValues }: { defaultValues: PdvSettingsFormValues }) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  const { register, handleSubmit } = useForm<PdvSettingsFormValues, unknown, PdvSettingsInput>({
    resolver: zodResolver(pdvSettingsSchema),
    defaultValues,
  });

  const onSubmit = (data: PdvSettingsInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await updatePdvSettingsAction(data);
      if (result?.error) setFeedback({ type: "error", message: result.error });
      else if (result?.success) setFeedback({ type: "success", message: result.success });
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <label className="mb-6 flex items-start gap-3 text-sm text-slate-700">
        <Checkbox className="mt-0.5" {...register("autoPrintReceipt")} />
        <span>
          <span className="font-medium">Imprimir automaticamente ao finalizar a venda</span>
          <span className="block text-xs text-slate-500">
            Assim que a venda for registrada, o comprovante é enviado direto para a
            impressora térmica padrão do computador, sem precisar clicar em
            &quot;Imprimir&quot;. O botão manual continua funcionando de qualquer forma.
          </span>
        </span>
      </label>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Salvar configurações"}
      </Button>
    </form>
  );
}
