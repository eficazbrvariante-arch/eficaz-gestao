"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supplierSchema, type SupplierInput } from "@/lib/validations/catalog";
import { createSupplierAction, updateSupplierAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

export function SupplierForm({
  supplierId,
  defaultValues,
}: {
  supplierId?: string;
  defaultValues?: Partial<SupplierInput>;
}) {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues,
  });

  const onSubmit = (data: SupplierInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = supplierId
        ? await updateSupplierAction(supplierId, data)
        : await createSupplierAction(data);
      if (result?.error) {
        setServerError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={serverError} variant="error" />

      <div className="mb-4">
        <Label htmlFor="name">Nome / Razão social</Label>
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
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" {...register("phone")} />
          <FieldError message={errors.phone?.message} />
        </div>
      </div>

      <div className="mb-4">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="addressStreet">Endereço</Label>
          <Input id="addressStreet" {...register("addressStreet")} />
          <FieldError message={errors.addressStreet?.message} />
        </div>
        <div>
          <Label htmlFor="addressCity">Cidade</Label>
          <Input id="addressCity" {...register("addressCity")} />
          <FieldError message={errors.addressCity?.message} />
        </div>
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Salvar fornecedor"}
      </Button>
    </form>
  );
}
