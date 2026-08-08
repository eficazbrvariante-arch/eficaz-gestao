"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  resetCustomerPasswordSchema,
  type ResetCustomerPasswordInput,
} from "@/lib/validations/customer-auth";
import { resetCustomerPasswordAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

export function ResetPasswordForm({ subdomain, token }: { subdomain: string; token: string }) {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetCustomerPasswordInput>({
    resolver: zodResolver(resetCustomerPasswordSchema),
    defaultValues: { token },
  });

  const onSubmit = (data: ResetCustomerPasswordInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await resetCustomerPasswordAction(subdomain, data);
      if (result?.error) setServerError(result.error);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={serverError} variant="error" />
      <input type="hidden" {...register("token")} />

      <div className="mb-4">
        <Label htmlFor="password">Nova senha</Label>
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        <p className="mt-1 text-xs text-slate-500">Mínimo de 8 caracteres.</p>
        <FieldError message={errors.password?.message} />
      </div>

      <div className="mb-6">
        <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        <FieldError message={errors.confirmPassword?.message} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md px-5 py-3 text-sm font-medium text-white disabled:bg-slate-400"
        style={isPending ? undefined : { backgroundColor: "var(--store-primary)" }}
      >
        {isPending ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
