"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validations/customer-auth";
import { loginCustomerAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

export function LoginForm({
  subdomain,
  returnTo,
}: {
  subdomain: string;
  returnTo: string | null;
}) {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = (data: LoginInput) => {
    setServerError(undefined);
    startTransition(async () => {
      // Sucesso não retorna nada aqui — `loginCustomerAction` já redireciona
      // (via `redirect()` do Next.js) depois de criar a sessão.
      const result = await loginCustomerAction(subdomain, data, returnTo);
      if (result?.error) setServerError(result.error);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <Label htmlFor="username">@usuário</Label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
            @
          </span>
          <Input id="username" className="pl-7" autoComplete="username" {...register("username")} />
        </div>
        <FieldError message={errors.username?.message} />
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
        <FieldError message={errors.password?.message} />
      </div>

      <FormBanner message={serverError} variant="error" />

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md px-5 py-3 text-sm font-medium text-white disabled:bg-slate-400"
        style={isPending ? undefined : { backgroundColor: "var(--store-primary)" }}
      >
        {isPending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
