"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  requestCustomerPasswordResetSchema,
  type RequestCustomerPasswordResetInput,
} from "@/lib/validations/customer-auth";
import { requestCustomerPasswordResetAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

export function RequestResetForm({ subdomain }: { subdomain: string }) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestCustomerPasswordResetInput>({
    resolver: zodResolver(requestCustomerPasswordResetSchema),
  });

  const onSubmit = (data: RequestCustomerPasswordResetInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await requestCustomerPasswordResetAction(subdomain, data);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else if (result?.success) {
        setFeedback({ type: "success", message: result.success });
        setSent(true);
      }
    });
  };

  const { onChange: onEmailChange, ...emailField } = register("email");

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-6">
        <Label htmlFor="email">E-mail cadastrado</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          {...emailField}
          onChange={(e) => {
            setSent(false);
            onEmailChange(e);
          }}
        />
        <FieldError message={errors.email?.message} />
      </div>

      <button
        type="submit"
        disabled={isPending || sent}
        className="w-full rounded-md px-5 py-3 text-sm font-medium text-white disabled:bg-slate-400"
        style={isPending || sent ? undefined : { backgroundColor: "var(--store-primary)" }}
      >
        {isPending ? "Enviando..." : sent ? "Enviado" : "Enviar instruções"}
      </button>
    </form>
  );
}
