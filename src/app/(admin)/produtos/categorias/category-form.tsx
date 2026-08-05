"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { categorySchema, type CategoryInput } from "@/lib/validations/catalog";
import { createCategoryAction } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import { CATEGORY_ICON_OPTIONS } from "@/lib/category-icons";

export function CategoryForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryInput>({ resolver: zodResolver(categorySchema) });

  const onSubmit = (data: CategoryInput) => {
    setFeedback(undefined);
    startTransition(async () => {
      const result = await createCategoryAction(data);
      if (result?.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: result?.success ?? "Categoria criada." });
        reset();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={feedback?.message} variant={feedback?.type} />

      <div className="mb-4">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="mb-4">
        <Label htmlFor="parentId">Categoria pai (opcional)</Label>
        <Select id="parentId" {...register("parentId")}>
          <option value="">Nenhuma</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-6">
        <Label htmlFor="icon">Ícone na home (opcional)</Label>
        <Select id="icon" {...register("icon")}>
          <option value="">Genérico</option>
          {CATEGORY_ICON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvando..." : "Adicionar categoria"}
      </Button>
    </form>
  );
}
