"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { tenantLoginEmailSchema, type TenantLoginEmailInput } from "@/lib/validations/auth";
import { resolveTenantLoginAction, type TenantLoginResolution } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import { UserPickerLoginForm } from "./user-picker-login-form";

/**
 * Passo 1 do login num dispositivo novo (sem `device_id` aprovado ainda):
 * digitar o e-mail de acesso da empresa para resolver o tenant e mostrar a
 * lista de colaboradores — o mesmo `UserPickerLoginForm` que já é usado
 * quando o dispositivo já está aprovado (ver `login/page.tsx`).
 */
export function TenantLoginFlow({ callbackUrl }: { callbackUrl?: string }) {
  const [resolved, setResolved] = useState<TenantLoginResolution | null>(null);
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TenantLoginEmailInput>({
    resolver: zodResolver(tenantLoginEmailSchema),
  });

  const onSubmit = (data: TenantLoginEmailInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await resolveTenantLoginAction(data);
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      setResolved(result);
    });
  };

  if (resolved) {
    return (
      <div>
        <p className="mb-3 text-sm text-slate-500">
          Empresa: <span className="font-medium text-slate-700">{resolved.tenantName}</span>
        </p>
        <UserPickerLoginForm users={resolved.users} callbackUrl={callbackUrl} />
        <button
          type="button"
          onClick={() => setResolved(null)}
          className="mt-4 text-xs text-slate-500 hover:underline"
        >
          Não é esta empresa? Digitar outro e-mail
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={serverError} variant="error" />
      <div className="mb-6">
        <Label htmlFor="email">E-mail de acesso da empresa</Label>
        <Input id="email" type="email" autoComplete="email" autoFocus {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Buscando..." : "Continuar"}
      </Button>
    </form>
  );
}
