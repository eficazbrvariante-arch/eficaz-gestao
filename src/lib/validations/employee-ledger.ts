import { z } from "zod";

export const EMPLOYEE_LEDGER_TYPES = ["ADVANCE", "PURCHASE", "HOURLY_PAYMENT"] as const;
export type EmployeeLedgerTypeValue = (typeof EMPLOYEE_LEDGER_TYPES)[number];

export const EMPLOYEE_LEDGER_TYPE_LABELS: Record<EmployeeLedgerTypeValue, string> = {
  ADVANCE: "Adiantamento de salário",
  PURCHASE: "Compra de mercadoria",
  HOURLY_PAYMENT: "Pagamento por horas",
};

export const createEmployeeLedgerEntrySchema = z.object({
  userId: z.string().trim().min(1, "Selecione o colaborador"),
  type: z.enum(EMPLOYEE_LEDGER_TYPES),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  description: z.string().trim().optional().or(z.literal("")),
});
export type CreateEmployeeLedgerEntryInput = z.infer<typeof createEmployeeLedgerEntrySchema>;

export const setHourlyRateSchema = z.object({
  userId: z.string().trim().min(1),
  hourlyRate: z.coerce.number().min(0, "Informe um valor válido"),
});
export type SetHourlyRateInput = z.infer<typeof setHourlyRateSchema>;

export const registerHourlyPaymentSchema = z.object({
  userId: z.string().trim().min(1),
  from: z.string().trim().min(1, "Informe o início do período"),
  to: z.string().trim().min(1, "Informe o fim do período"),
});
export type RegisterHourlyPaymentInput = z.infer<typeof registerHourlyPaymentSchema>;
