"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { customerSchema, type CustomerInput } from "@/lib/validations/customer";
import { createCustomerAction, updateCustomerAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

export function CustomerForm({
  customerId,
  defaultValues,
}: {
  customerId?: string;
  defaultValues?: Partial<CustomerInput>;
}) {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues,
  });

  const onSubmit = (data: CustomerInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = customerId
        ? await updateCustomerAction(customerId, data)
        : await createCustomerAction(data);
      if (result?.error) setServerError(result.error);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={serverError} variant="error" />

      <div className="mb-4">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="document">CPF / CNPJ</Label>
          <Input id="document" {...register("document")} />
          <FieldError message={errors.document?.message} />
        </div>
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" {...register("email")} />
          <FieldError message={errors.email?.message} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" {...register("phone")} />
          <FieldError message={errors.phone?.message} />
        </div>
        <div>
          <Label htmlFor="whatsapp">WhatsApp</Label>
          <Input id="whatsapp" placeholder="5511999999999" {...register("whatsapp")} />
          <FieldError message={errors.whatsapp?.message} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label htmlFor="addressStreet">Endereço</Label>
          <Input id="addressStreet" {...register("addressStreet")} />
        </div>
        <div>
          <Label htmlFor="addressNumber">Número</Label>
          <Input id="addressNumber" {...register("addressNumber")} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="addressCity">Cidade</Label>
          <Input id="addressCity" {...register("addressCity")} />
        </div>
        <div>
          <Label htmlFor="addressState">Estado</Label>
          <Input id="addressState" maxLength={2} {...register("addressState")} />
          <FieldError message={errors.addressState?.message} />
        </div>
        <div>
          <Label htmlFor="addressZip">CEP</Label>
          <Input id="addressZip" {...register("addressZip")} />
        </div>
      </div>

      <div className="mb-6">
        <Label htmlFor="notes">Observações</Label>
        <Textarea id="notes" rows={3} {...register("notes")} />
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Salvar cliente"}
      </Button>
    </form>
  );
}
