"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { companySchema, type CompanyInput } from "@/lib/validations/company";
import { updateCompanyAction } from "../../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import type { TenantModel } from "@/generated/prisma/models";

export function CompanyForm({ tenant }: { tenant: TenantModel }) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompanyInput>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: tenant.name,
      tradeName: tenant.tradeName ?? "",
      document: tenant.document ?? "",
      phone: tenant.phone ?? "",
      whatsapp: tenant.whatsapp ?? "",
      addressStreet: tenant.addressStreet ?? "",
      addressNumber: tenant.addressNumber ?? "",
      addressCity: tenant.addressCity ?? "",
      addressState: tenant.addressState ?? "",
      addressZip: tenant.addressZip ?? "",
      primaryColor: tenant.primaryColor ?? "",
      instagramUrl: tenant.instagramUrl ?? "",
    },
  });

  const onSubmit = (data: CompanyInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await updateCompanyAction(data);
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

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Razão social</Label>
          <Input id="name" {...register("name")} />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="tradeName">Nome fantasia</Label>
          <Input id="tradeName" {...register("tradeName")} />
          <FieldError message={errors.tradeName?.message} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="document">CNPJ</Label>
          <Input id="document" {...register("document")} />
          <FieldError message={errors.document?.message} />
        </div>
        <div>
          <Label htmlFor="primaryColor">Cor principal</Label>
          <Input id="primaryColor" type="color" className="h-10" {...register("primaryColor")} />
          <FieldError message={errors.primaryColor?.message} />
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

      <div className="mb-4">
        <Label htmlFor="instagramUrl">Instagram (link do perfil)</Label>
        <Input
          id="instagramUrl"
          placeholder="https://instagram.com/sualoja"
          {...register("instagramUrl")}
        />
        <FieldError message={errors.instagramUrl?.message} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label htmlFor="addressStreet">Endereço</Label>
          <Input id="addressStreet" {...register("addressStreet")} />
          <FieldError message={errors.addressStreet?.message} />
        </div>
        <div>
          <Label htmlFor="addressNumber">Número</Label>
          <Input id="addressNumber" {...register("addressNumber")} />
          <FieldError message={errors.addressNumber?.message} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="addressCity">Cidade</Label>
          <Input id="addressCity" {...register("addressCity")} />
          <FieldError message={errors.addressCity?.message} />
        </div>
        <div>
          <Label htmlFor="addressState">Estado</Label>
          <Input id="addressState" maxLength={2} {...register("addressState")} />
          <FieldError message={errors.addressState?.message} />
        </div>
        <div>
          <Label htmlFor="addressZip">CEP</Label>
          <Input id="addressZip" {...register("addressZip")} />
          <FieldError message={errors.addressZip?.message} />
        </div>
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}
