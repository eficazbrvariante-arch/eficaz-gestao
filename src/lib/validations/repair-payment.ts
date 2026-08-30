import { z } from "zod";

export const repairPaymentEntrySchema = z.object({
  method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "STORE_CREDIT", "FIADO", "CREDITO_EFICAZ"]),
  amount: z.coerce.number().positive(),
});

export const receiveRepairOrderPaymentSchema = z.object({
  payments: z.array(repairPaymentEntrySchema).min(1, "Informe ao menos um pagamento"),
  /** Obrigatório só quando algum pagamento é `FIADO` (checado no servidor). */
  fiadoDueDate: z.string().trim().optional().or(z.literal("")),
  /** PIN do Crédito Eficaz — obrigatório só quando há pagamento `CREDITO_EFICAZ` (checado no servidor). */
  creditoEficazPin: z.string().trim().optional().or(z.literal("")),
  /** Nº de parcelas do financiamento — obrigatório só quando há pagamento `CREDITO_EFICAZ`. */
  creditoEficazInstallments: z.coerce.number().int().positive().optional(),
  /** Avaliação opcional do vendedor (Adendo, item 11) — nunca obrigatória. */
  creditoEficazWouldBeLost: z.boolean().optional(),
});
export type ReceiveRepairOrderPaymentInput = z.infer<typeof receiveRepairOrderPaymentSchema>;

export const deliverRepairOrderSchema = z.object({
  payments: z.array(repairPaymentEntrySchema),
  fiadoDueDate: z.string().trim().optional().or(z.literal("")),
  creditoEficazPin: z.string().trim().optional().or(z.literal("")),
  creditoEficazInstallments: z.coerce.number().int().positive().optional(),
  creditoEficazWouldBeLost: z.boolean().optional(),
});
export type DeliverRepairOrderInput = z.infer<typeof deliverRepairOrderSchema>;

export const repairOrderCourtesySchema = z.object({
  reason: z.string().trim().min(3, "Descreva o motivo da cortesia"),
});
export type RepairOrderCourtesyInput = z.infer<typeof repairOrderCourtesySchema>;

export const cancelRepairOrderWithoutBillingSchema = z.object({
  /** Vendedor/colaborador que está devolvendo o aparelho ao cliente — nunca
   *  assumido como quem está logado (mesma regra de `sellerId`), pra sempre
   *  ter um responsável registrado mesmo numa OS sem faturamento nenhum. */
  deliveredById: z.string().trim().min(1, "Selecione quem está devolvendo o aparelho"),
  reason: z.string().trim().min(3, "Descreva o motivo do cancelamento"),
});
export type CancelRepairOrderWithoutBillingInput = z.infer<
  typeof cancelRepairOrderWithoutBillingSchema
>;
