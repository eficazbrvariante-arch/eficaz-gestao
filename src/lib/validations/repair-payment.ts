import { z } from "zod";

export const repairPaymentEntrySchema = z.object({
  method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "STORE_CREDIT", "FIADO"]),
  amount: z.coerce.number().positive(),
});

export const receiveRepairOrderPaymentSchema = z.object({
  payments: z.array(repairPaymentEntrySchema).min(1, "Informe ao menos um pagamento"),
  /** Obrigatório só quando algum pagamento é `FIADO` (checado no servidor). */
  fiadoDueDate: z.string().trim().optional().or(z.literal("")),
});
export type ReceiveRepairOrderPaymentInput = z.infer<typeof receiveRepairOrderPaymentSchema>;

export const deliverRepairOrderSchema = z.object({
  payments: z.array(repairPaymentEntrySchema),
  fiadoDueDate: z.string().trim().optional().or(z.literal("")),
});
export type DeliverRepairOrderInput = z.infer<typeof deliverRepairOrderSchema>;

export const repairOrderCourtesySchema = z.object({
  reason: z.string().trim().min(3, "Descreva o motivo da cortesia"),
});
export type RepairOrderCourtesyInput = z.infer<typeof repairOrderCourtesySchema>;
