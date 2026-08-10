"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@/lib/validations/auth";
import { signupAction } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

export function SignupForm() {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = (data: SignupInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await signupAction(data);
      if (result?.error) {
        setServerError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={serverError} variant="error" />

      <div className="mb-4">
        <Label htmlFor="companyName">Nome da empresa</Label>
        <Input id="companyName" autoComplete="organization" {...register("companyName")} />
        <FieldError message={errors.companyName?.message} />
      </div>

      <div className="mb-4">
        <Label htmlFor="subdomain">Subdomínio</Label>
        <div className="flex items-center gap-2">
          <Input id="subdomain" placeholder="minhaempresa" {...register("subdomain")} />
          <span className="whitespace-nowrap text-sm text-slate-500">
            .eficazgestao.com.br
          </span>
        </div>
        <FieldError message={errors.subdomain?.message} />
      </div>

      <div className="mb-4">
        <Label htmlFor="adminName">Seu nome</Label>
        <Input id="adminName" autoComplete="name" {...register("adminName")} />
        <FieldError message={errors.adminName?.message} />
      </div>

      <div className="mb-4">
        <Label htmlFor="email">E-mail de acesso (login da empresa)</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        <p className="mt-1 text-xs text-slate-400">
          É com este e-mail que qualquer pessoa da equipe começa a entrar — depois disso,
          cada um escolhe o próprio nome numa lista e digita a senha.
        </p>
        <FieldError message={errors.email?.message} />
      </div>

      <div className="mb-4">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
        <FieldError message={errors.password?.message} />
      </div>

      <div className="mb-6">
        <Label htmlFor="confirmPassword">Confirmar senha</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        <FieldError message={errors.confirmPassword?.message} />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Criando..." : "Criar empresa"}
      </Button>
    </form>
  );
}
