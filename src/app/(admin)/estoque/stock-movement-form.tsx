"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  stockMovementSchema,
  type StockMovementInput,
  type StockMovementFormValues,
} from "@/lib/validations/catalog";
import { createStockMovementAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";

type Option = { id: string; name: string; stockQty: number };

export function StockMovementForm({ products }: { products: Option[] }) {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<StockMovementFormValues, unknown, StockMovementInput>({
    resolver: zodResolver(stockMovementSchema),
    defaultValues: { type: "IN", quantity: 0 },
  });

  const type = watch("type");
  const productId = watch("productId");
  const selectedProduct = products.find((p) => p.id === productId);

  const onSubmit = (data: StockMovementInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await createStockMovementAction(data);
      if (result?.error) {
        setServerError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={serverError} variant="error" />

      <div className="mb-4">
        <Label htmlFor="productId">Produto</Label>
        <Select id="productId" {...register("productId")}>
          <option value="">Selecione um produto</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (estoque atual: {p.stockQty})
            </option>
          ))}
        </Select>
        <FieldError message={errors.productId?.message} />
      </div>

      <div className="mb-4">
        <Label htmlFor="type">Tipo de movimentação</Label>
        <Select id="type" {...register("type")}>
          <option value="IN">Entrada</option>
          <option value="OUT">Saída</option>
          <option value="ADJUST">Ajuste (nova contagem física)</option>
        </Select>
      </div>

      <div className="mb-4">
        <Label htmlFor="quantity">
          {type === "ADJUST"
            ? "Nova quantidade em estoque"
            : "Quantidade"}
        </Label>
        <Input id="quantity" type="number" step="1" {...register("quantity")} />
        <FieldError message={errors.quantity?.message} />
        {selectedProduct && (
          <p className="mt-1 text-xs text-slate-400">
            Estoque atual de {selectedProduct.name}: {selectedProduct.stockQty}
          </p>
        )}
      </div>

      <div className="mb-6">
        <Label htmlFor="reason">Motivo / justificativa</Label>
        <Input id="reason" {...register("reason")} />
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Registrar movimentação"}
      </Button>
    </form>
  );
}
