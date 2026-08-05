"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { categorySchema, type CategoryInput } from "@/lib/validations/catalog";
import { updateCategoryAction } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { CATEGORY_ICON_OPTIONS } from "@/lib/category-icons";

type EditableCategory = {
  id: string;
  name: string;
  parentId: string | null;
  icon: string | null;
};

export function CategoryEditForm({
  category,
  categories,
  onDone,
}: {
  category: EditableCategory;
  categories: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category.name,
      parentId: category.parentId ?? "",
      icon: category.icon ?? "",
    },
  });

  const onSubmit = (data: CategoryInput) => {
    setError(undefined);
    startTransition(async () => {
      const result = await updateCategoryAction(category.id, data);
      if (result?.error) {
        setError(result.error);
      } else {
        onDone();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-wrap items-end gap-3">
      {error && <p className="w-full text-sm text-red-600">{error}</p>}

      <div>
        <Label htmlFor="edit-name">Nome</Label>
        <Input id="edit-name" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>

      <div>
        <Label htmlFor="edit-parentId">Categoria pai</Label>
        <Select id="edit-parentId" {...register("parentId")}>
          <option value="">Nenhuma</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="edit-icon">Ícone na home</Label>
        <Select id="edit-icon" {...register("icon")}>
          <option value="">Genérico</option>
          {CATEGORY_ICON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex gap-2 pb-0.5">
        <Button type="submit" disabled={isPending} fullWidth={false} className="px-4">
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
