import { z } from "zod";

export const saleItemSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().optional().or(z.literal("")),
  quantity: z.coerce.number().int().positive("Quantidade deve ser maior que zero"),
});

export const salePaymentSchema = z.object({
  method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "STORE_CREDIT"]),
  amount: z.coerce.number().positive(),
});

export const createSaleSchema = z.object({
  customerId: z.string().trim().optional().or(z.literal("")),
  items: z.array(saleItemSchema).min(1, "Adicione pelo menos um produto"),
  discount: z.coerce.number().min(0).default(0),
  payments: z.array(salePaymentSchema).min(1, "Informe a forma de pagamento"),
  /** Quanto o cliente entregou em dinheiro (para cálculo do troco). */
  cashReceived: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional().or(z.literal("")),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const cancelSaleSchema = z.object({
  reason: z.string().trim().min(3, "Descreva o motivo do cancelamento"),
  /** Só é obrigatório quando a venda ainda não tem cliente vinculado. */
  customerId: z.string().trim().optional().or(z.literal("")),
});
export type CancelSaleInput = z.infer<typeof cancelSaleSchema>;
export type CancelSaleFormValues = z.input<typeof cancelSaleSchema>;

export const findSaleByNumberSchema = z.object({
  number: z.coerce.number().int().positive("Informe um número de cupom válido"),
});
export type FindSaleByNumberInput = z.infer<typeof findSaleByNumberSchema>;
