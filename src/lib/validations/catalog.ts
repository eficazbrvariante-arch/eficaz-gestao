import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da categoria"),
  parentId: z.string().trim().optional().or(z.literal("")),
  icon: z.string().trim().optional().or(z.literal("")),
  counterOnly: z.boolean().default(false),
});
export type CategoryInput = z.infer<typeof categorySchema>;
// Tipo "de entrada" (antes da coerção do zod) — usado pelo useForm, já que
// `counterOnly` tem default e chega opcional do formulário.
export type CategoryFormValues = z.input<typeof categorySchema>;

export const brandSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da marca"),
});
export type BrandInput = z.infer<typeof brandSchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do fornecedor"),
  document: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Informe um e-mail válido")
    .optional()
    .or(z.literal("")),
  addressStreet: z.string().trim().optional().or(z.literal("")),
  addressCity: z.string().trim().optional().or(z.literal("")),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

const optionalId = z.string().trim().optional().or(z.literal(""));

export const productVariantSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da variação"),
  sku: z.string().trim().optional().or(z.literal("")),
  barcode: z.string().trim().optional().or(z.literal("")),
  priceAdjustment: z.coerce.number().default(0),
  stockQty: z.coerce.number().int("Deve ser um número inteiro").min(0).default(0),
});
export type ProductVariantInput = z.infer<typeof productVariantSchema>;

export const productSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do produto"),
  internalCode: z.string().trim().optional().or(z.literal("")),
  barcode: z.string().trim().optional().or(z.literal("")),
  categoryId: optionalId,
  brandId: optionalId,
  supplierId: optionalId,
  description: z.string().trim().optional().or(z.literal("")),
  costPrice: z.coerce.number().min(0, "O custo não pode ser negativo"),
  salePrice: z.coerce.number().min(0, "O preço de venda não pode ser negativo"),
  promoPrice: z
    .union([z.literal(""), z.coerce.number().min(0)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  /// Fim da oferta relâmpago (datetime-local). Só faz sentido junto de `promoPrice`.
  promoEndsAt: z
    .union([z.literal(""), z.coerce.date()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  stockQty: z.coerce.number().int("Deve ser um número inteiro").min(0),
  minStock: z.coerce.number().int("Deve ser um número inteiro").min(0),
  active: z.boolean().default(true),
  showInCatalog: z.boolean().default(true),
  images: z
    .array(z.string().trim().url("Informe uma URL válida"))
    .max(5, "No máximo 5 fotos por produto")
    .default([]),
  variants: z.array(productVariantSchema).default([]),
});
export type ProductInput = z.infer<typeof productSchema>;
// Tipo "de entrada" (antes da coerção do zod) — usado pelo useForm, já que campos
// numéricos chegam como string dos inputs HTML antes de serem convertidos pelo resolver.
export type ProductFormValues = z.input<typeof productSchema>;

export const stockMovementSchema = z
  .object({
    productId: z.string().trim().min(1, "Selecione um produto"),
    type: z.enum(["IN", "OUT", "ADJUST"]),
    // Para IN/OUT: quantidade a somar/subtrair (> 0).
    // Para ADJUST: nova quantidade absoluta em estoque (>= 0), após uma contagem física.
    quantity: z.coerce.number().int("Deve ser um número inteiro").min(0),
    reason: z.string().trim().optional().or(z.literal("")),
  })
  .refine((data) => data.type === "ADJUST" || data.quantity > 0, {
    message: "Informe uma quantidade maior que zero",
    path: ["quantity"],
  });
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type StockMovementFormValues = z.input<typeof stockMovementSchema>;

/** Ajuste rápido de quantidade — usado pela tela do Colaborador de Estoque, que não vê preço nem mais nada do produto. */
export const quickStockAdjustSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.coerce.number().int("Deve ser um número inteiro").min(0, "Não pode ser negativo"),
});
export type QuickStockAdjustInput = z.infer<typeof quickStockAdjustSchema>;
