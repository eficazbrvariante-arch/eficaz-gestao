import { z } from "zod";

const money = z.coerce.number().min(0, "Informe um valor válido");

export const openCashSchema = z.object({
  openingAmount: money,
  notes: z.string().trim().optional().or(z.literal("")),
});
export type OpenCashInput = z.infer<typeof openCashSchema>;
export type OpenCashFormValues = z.input<typeof openCashSchema>;

export const closeCashSchema = z.object({
  countedAmount: money,
  countedDebitAmount: money,
  countedCreditAmount: money,
  countedPixAmount: money,
  notes: z.string().trim().optional().or(z.literal("")),
});
export type CloseCashInput = z.infer<typeof closeCashSchema>;
export type CloseCashFormValues = z.input<typeof closeCashSchema>;

export const cashMovementSchema = z.object({
  type: z.enum(["WITHDRAWAL", "SUPPLY"]),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  description: z.string().trim().min(3, "Descreva o motivo"),
});
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
export type CashMovementFormValues = z.input<typeof cashMovementSchema>;
