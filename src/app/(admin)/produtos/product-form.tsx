"use client";

import { useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  productSchema,
  type ProductInput,
  type ProductFormValues,
} from "@/lib/validations/catalog";
import { createProductAction, generateInternalCodeAction, updateProductAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormBanner } from "@/components/ui/form-banner";
import { MultiImageUploadField } from "@/components/ui/multi-image-upload-field";
import { BarcodeScannerField } from "@/components/ui/barcode-scanner-field";

type Option = { id: string; name: string };

export function ProductForm({
  productId,
  defaultValues,
  categories,
  brands,
  suppliers,
  canManageCommission,
  canEditCommission,
}: {
  productId?: string;
  defaultValues?: Partial<ProductFormValues>;
  categories: Option[];
  brands: Option[];
  suppliers: Option[];
  /** Comissão é configuração sensível — só quem gerencia Colaboradores vê. */
  canManageCommission: boolean;
  /** Só ADMIN edita — Gerente vê a seção, mas os campos ficam desabilitados. */
  canEditCommission: boolean;
}) {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormValues, unknown, ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      active: true,
      showInCatalog: true,
      isFeatured: false,
      commissionEnabled: false,
      stockQty: 0,
      minStock: 0,
      costPrice: 0,
      salePrice: 0,
      variants: [],
      images: [],
      ...defaultValues,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "variants" });

  async function handleGenerateInternalCode() {
    setIsGeneratingCode(true);
    setServerError(undefined);
    try {
      const result = await generateInternalCodeAction();
      if ("error" in result) {
        setServerError(result.error);
        return;
      }
      setValue("internalCode", result.code, { shouldDirty: true, shouldValidate: true });
    } finally {
      setIsGeneratingCode(false);
    }
  }

  const onSubmit = (data: ProductInput) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = productId
        ? await updateProductAction(productId, data)
        : await createProductAction(data);
      if (result?.error) {
        setServerError(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormBanner message={serverError} variant="error" />

      <div className="mb-4">
        <Label htmlFor="name">Nome do produto</Label>
        <Input id="name" {...register("name")} />
        <p className="mt-1 text-xs text-slate-500">
          Padrão recomendado: Marca + Produto + Modelo + característica principal. Ex.: &quot;Fone
          Bluetooth P9 — Headphone sem fio com microfone&quot;.
        </p>
        <FieldError message={errors.name?.message} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="internalCode">Código interno</Label>
          <div className="flex gap-2">
            <Input id="internalCode" {...register("internalCode")} />
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              disabled={isGeneratingCode}
              onClick={handleGenerateInternalCode}
              className="shrink-0 px-3"
            >
              {isGeneratingCode ? "Gerando..." : "Gerar"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Produto sem código de barras do fabricante? Gere um código interno pra etiquetar e
            escanear depois.
          </p>
          <FieldError message={errors.internalCode?.message} />
        </div>
        <div>
          <Label htmlFor="barcode">Código de barras / EAN</Label>
          <div className="flex gap-2">
            <Input id="barcode" {...register("barcode")} />
            <BarcodeScannerField
              onScanned={(value) =>
                setValue("barcode", value, { shouldDirty: true, shouldValidate: true })
              }
            />
          </div>
          <FieldError message={errors.barcode?.message} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="categoryId">Categoria</Label>
          <Select id="categoryId" {...register("categoryId")}>
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="brandId">Marca</Label>
          <Select id="brandId" {...register("brandId")}>
            <option value="">Sem marca</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="supplierId">Fornecedor</Label>
          <Select id="supplierId" {...register("supplierId")}>
            <option value="">Sem fornecedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mb-4">
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" rows={3} {...register("description")} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="costPrice">Preço de custo (R$)</Label>
          <Input id="costPrice" type="number" step="0.01" {...register("costPrice")} />
          <FieldError message={errors.costPrice?.message} />
        </div>
        <div>
          <Label htmlFor="salePrice">Preço de venda (R$)</Label>
          <Input id="salePrice" type="number" step="0.01" {...register("salePrice")} />
          <FieldError message={errors.salePrice?.message} />
        </div>
        <div>
          <Label htmlFor="promoPrice">Preço promocional (R$)</Label>
          <Input id="promoPrice" type="number" step="0.01" {...register("promoPrice")} />
          <FieldError message={errors.promoPrice?.message} />
        </div>
      </div>

      {canManageCommission && (
        <div className="mb-4 rounded-md border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox {...register("commissionEnabled")} disabled={!canEditCommission} />
            Este produto entra na comissão de venda
          </label>
          {!canEditCommission && (
            <p className="mt-1 text-xs text-slate-400">Somente o Administrador pode alterar.</p>
          )}
          {watch("commissionEnabled") && (
            <div className="mt-3 max-w-xs">
              <Label htmlFor="commissionPercent">Comissão individual (%)</Label>
              <Input
                id="commissionPercent"
                type="number"
                step="0.01"
                placeholder="Usa a comissão geral"
                disabled={!canEditCommission}
                {...register("commissionPercent")}
              />
              <p className="mt-1 text-xs text-slate-500">
                Vazio = usa a comissão geral configurada em Colaboradores.
              </p>
              <FieldError message={errors.commissionPercent?.message} />
            </div>
          )}
        </div>
      )}

      {Boolean(watch("promoPrice")) && (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="promoStartedAt">Início da promoção (opcional)</Label>
            <Input id="promoStartedAt" type="datetime-local" {...register("promoStartedAt")} />
            <p className="mt-1 text-xs text-slate-500">Vazio = já vale a partir de agora.</p>
            <FieldError message={errors.promoStartedAt?.message} />
          </div>
          <div>
            <Label htmlFor="promoEndsAt">Fim da oferta relâmpago (opcional)</Label>
            <Input id="promoEndsAt" type="datetime-local" {...register("promoEndsAt")} />
            <p className="mt-1 text-xs text-slate-500">
              Preenchido, o produto aparece na prateleira &quot;Ofertas relâmpago&quot; com contagem
              regressiva até esse horário. Vazio = promoção comum, sem prazo.
            </p>
            <FieldError message={errors.promoEndsAt?.message} />
          </div>
          <div>
            <Label htmlFor="promoStockLimit">Quantidade disponível na promoção (opcional)</Label>
            <Input id="promoStockLimit" type="number" step="1" {...register("promoStockLimit")} />
            <p className="mt-1 text-xs text-slate-500">
              Vazio = limitado só pelo estoque normal do produto.
            </p>
            <FieldError message={errors.promoStockLimit?.message} />
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="stockQty">Quantidade em estoque</Label>
          <Input id="stockQty" type="number" step="1" {...register("stockQty")} />
          <FieldError message={errors.stockQty?.message} />
        </div>
        <div>
          <Label htmlFor="minStock">Estoque mínimo</Label>
          <Input id="minStock" type="number" step="1" {...register("minStock")} />
          <FieldError message={errors.minStock?.message} />
        </div>
      </div>

      <div className="mb-6">
        <Label>Fotos do produto (até 5)</Label>
        <MultiImageUploadField
          value={watch("images") ?? []}
          onChange={(urls) => setValue("images", urls, { shouldDirty: true })}
          max={5}
          alt="Foto do produto"
        />
        <FieldError message={errors.images?.message} />
      </div>

      <div className="mb-1 flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox {...register("active")} />
          Produto ativo
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox {...register("showInCatalog")} />
          Mostrar no catálogo online
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox {...register("isFeatured")} />
          Produto em destaque
        </label>
      </div>
      <p className="mb-2 text-xs text-slate-400">
        &quot;Produto em destaque&quot; fura a fila na listagem do catálogo e aparece primeiro no
        carrossel de destaques da home — não mexe no ranking real de mais vendidos.
      </p>

      {watch("isFeatured") && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="featuredOrder">Ordem no carrossel de destaques (opcional)</Label>
            <Input id="featuredOrder" type="number" step="1" {...register("featuredOrder")} />
            <p className="mt-1 text-xs text-slate-500">Menor número aparece primeiro.</p>
            <FieldError message={errors.featuredOrder?.message} />
          </div>
          <div>
            <Label htmlFor="featuredUntil">Destaque até (opcional)</Label>
            <Input id="featuredUntil" type="datetime-local" {...register("featuredUntil")} />
            <p className="mt-1 text-xs text-slate-500">
              Vazio = fica em destaque até desmarcar manualmente.
            </p>
            <FieldError message={errors.featuredUntil?.message} />
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <Label>Variações (cor, tamanho, modelo...)</Label>
          <button
            type="button"
            onClick={() =>
              append({ name: "", sku: "", barcode: "", priceAdjustment: 0, stockQty: 0 })
            }
            className="text-sm font-medium text-slate-700 hover:underline"
          >
            + Adicionar variação
          </button>
        </div>

        {fields.length === 0 && (
          <p className="text-sm text-slate-400">Nenhuma variação adicionada.</p>
        )}

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-5"
            >
              <Input placeholder="Nome (ex: Preto - M)" {...register(`variants.${index}.name`)} />
              <Input placeholder="SKU" {...register(`variants.${index}.sku`)} />
              <Input placeholder="Cód. barras" {...register(`variants.${index}.barcode`)} />
              <Input
                type="number"
                step="0.01"
                placeholder="Ajuste de preço"
                {...register(`variants.${index}.priceAdjustment`)}
              />
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="1"
                  placeholder="Estoque"
                  {...register(`variants.${index}.stockQty`)}
                />
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="shrink-0 text-sm text-red-600 hover:underline"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={isPending} fullWidth={false} className="px-6">
        {isPending ? "Salvando..." : "Salvar produto"}
      </Button>
    </form>
  );
}
