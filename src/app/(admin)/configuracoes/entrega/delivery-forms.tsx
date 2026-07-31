"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  deliverySettingsSchema,
  deliveryZoneSchema,
  type DeliverySettingsInput,
  type DeliverySettingsFormValues,
  type DeliveryZoneInput,
  type DeliveryZoneFormValues,
} from "@/lib/validations/order";
import { updateDeliverySettingsAction, createDeliveryZoneAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

type Feedback = { type: "success" | "error"; message: string } | undefined;

export function DeliverySettingsForm({
  defaultValues,
}: {
  defaultValues: DeliverySettingsFormValues;
}) {
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DeliverySettingsFormValues, unknown, DeliverySettingsInput>({
    resolver: zodResolver(deliverySettingsSchema),
    defaultValues,
  });

  const onSubmit = (data: DeliverySettingsInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await updateDeliverySettingsAction(data);
      if (result?.error) setFeedback({ type: "error", message: result.error });
      else setFeedback({ type: "success", message: result?.success ?? "Salvo." });
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-5 space-y-3">
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <Checkbox className="mt-0.5" {...register("deliveryEnabled")} />
          <span>
            <span className="font-medium">Aceitar entrega</span>
            <span className="block text-xs text-slate-500">
              O cliente informa o endereço e a taxa é calculada pelas faixas abaixo.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <Checkbox className="mt-0.5" {...register("pickupEnabled")} />
          <span>
            <span className="font-medium">Aceitar retirada na loja</span>
            <span className="block text-xs text-slate-500">Sem taxa de entrega.</span>
          </span>
        </label>
      </div>

      <div className="mb-4">
        <Label htmlFor="stockPolicy">Quando baixar o estoque de um pedido online</Label>
        <Select id="stockPolicy" {...register("stockPolicy")}>
          <option value="RESERVE">
            Ao concluir o pedido (recomendado) — o produto continua disponível no PDV até lá
          </option>
          <option value="DEDUCT">
            Assim que o pedido chega — garante o produto para quem pediu online
          </option>
        </Select>
        <p className="mt-1 text-xs text-slate-400">
          Em ambos os casos, um pedido só é aceito se houver estoque no momento.
        </p>
      </div>

      <div className="mb-6">
        <Label htmlFor="pickupNotes">Instruções de retirada</Label>
        <Input
          id="pickupNotes"
          placeholder="Ex.: retirar de segunda a sexta, das 9h às 18h"
          {...register("pickupNotes")}
        />
        <FieldError message={errors.pickupNotes?.message} />
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Salvar configurações"}
      </Button>
    </form>
  );
}

export function DeliveryZoneForm() {
  const [feedback, setFeedback] = useState<Feedback>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DeliveryZoneFormValues, unknown, DeliveryZoneInput>({
    resolver: zodResolver(deliveryZoneSchema),
    defaultValues: { active: true, fee: 0 },
  });

  const onSubmit = (data: DeliveryZoneInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await createDeliveryZoneAction(data);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: result?.success ?? "Criada." });
        reset({ active: true, fee: 0 });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-4">
        <Label htmlFor="zoneName">Nome da faixa</Label>
        <Input id="zoneName" placeholder="Ex.: Centro" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="mb-4">
        <Label htmlFor="neighborhood">Bairro atendido</Label>
        <Input id="neighborhood" placeholder="Ex.: Centro" {...register("neighborhood")} />
        <p className="mt-1 text-xs text-slate-400">
          O bairro digitado pelo cliente é comparado sem diferenciar acentos ou maiúsculas.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="zipStart">CEP inicial</Label>
          <Input id="zipStart" placeholder="01000000" {...register("zipStart")} />
        </div>
        <div>
          <Label htmlFor="zipEnd">CEP final</Label>
          <Input id="zipEnd" placeholder="01099999" {...register("zipEnd")} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="fee">Taxa (R$)</Label>
          <Input id="fee" type="number" step="0.01" {...register("fee")} />
          <FieldError message={errors.fee?.message} />
        </div>
        <div>
          <Label htmlFor="estimate">Prazo estimado</Label>
          <Input id="estimate" placeholder="Ex.: até 2 horas" {...register("estimate")} />
        </div>
      </div>

      <label className="mb-6 flex items-center gap-2 text-sm text-slate-700">
        <Checkbox {...register("active")} />
        Faixa ativa
      </label>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Adicionar faixa"}
      </Button>
    </form>
  );
}
