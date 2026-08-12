import { z } from "zod";

export const createFiadoEntrySchema = z.object({
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  /** `YYYY-MM-DD`. */
  dueDate: z.string().trim().min(1, "Informe a data prevista de pagamento"),
  note: z.string().trim().max(300, "Máximo de 300 caracteres").optional().or(z.literal("")),
});
export type CreateFiadoEntryInput = z.infer<typeof createFiadoEntrySchema>;

export const grantStoreCreditSchema = z.object({
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  reason: z.string().trim().min(3, "Descreva o motivo do crédito"),
});
export type GrantStoreCreditInput = z.infer<typeof grantStoreCreditSchema>;
