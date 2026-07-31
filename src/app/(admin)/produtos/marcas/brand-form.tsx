"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { brandSchema, type BrandInput } from "@/lib/validations/catalog";
import { createBrandAction } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

export function BrandForm() {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BrandInput>({ resolver: zodResolver(brandSchema) });

  const onSubmit = (data: BrandInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await createBrandAction(data);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: result?.success ?? "Marca criada." });
        reset();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-6">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvando..." : "Adicionar marca"}
      </Button>
    </form>
  );
}
