"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  changeCustomerPasswordSchema,
  type ChangeCustomerPasswordInput,
} from "@/lib/validations/customer-auth";
import { changePasswordAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

export function ChangePasswordForm({ subdomain }: { subdomain: string }) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangeCustomerPasswordInput>({
    resolver: zodResolver(changeCustomerPasswordSchema),
  });

  const onSubmit = (data: ChangeCustomerPasswordInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await changePasswordAction(subdomain, data);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else if (result?.success) {
        setFeedback({ type: "success", message: result.success });
        reset();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-sm">
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-4">
        <Label htmlFor="currentPassword">Senha atual</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          {...register("currentPassword")}
        />
        <FieldError message={errors.currentPassword?.message} />
      </div>

      <div className="mb-4">
        <Label htmlFor="newPassword">Nova senha</Label>
        <Input id="newPassword" type="password" autoComplete="new-password" {...register("newPassword")} />
        <p className="mt-1 text-xs text-slate-500">Mínimo de 8 caracteres.</p>
        <FieldError message={errors.newPassword?.message} />
      </div>

      <div className="mb-6">
        <Label htmlFor="confirmNewPassword">Confirmar nova senha</Label>
        <Input
          id="confirmNewPassword"
          type="password"
          autoComplete="new-password"
          {...register("confirmNewPassword")}
        />
        <FieldError message={errors.confirmNewPassword?.message} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {isPending ? "Salvando..." : "Alterar senha"}
      </button>
    </form>
  );
}
