import { z } from "zod";

export const EMPLOYEE_LEDGER_TYPES = ["ADVANCE", "PURCHASE", "HOURLY_PAYMENT", "OTHER"] as const;
export type EmployeeLedgerTypeValue = (typeof EMPLOYEE_LEDGER_TYPES)[number];

export const EMPLOYEE_LEDGER_TYPE_LABELS: Record<EmployeeLedgerTypeValue, string> = {
  ADVANCE: "Adiantamento de salário",
  PURCHASE: "Compra de mercadoria",
  HOURLY_PAYMENT: "Pagamento por horas",
  OTHER: "Outro (lançamento livre)",
};

export const createEmployeeLedgerEntrySchema = z
  .object({
    userId: z.string().trim().min(1, "Selecione o colaborador"),
    type: z.enum(EMPLOYEE_LEDGER_TYPES),
    amount: z.coerce.number().positive("Informe um valor maior que zero"),
    description: z.string().trim().optional().or(z.literal("")),
  })
  .refine((data) => data.type !== "OTHER" || data.description, {
    message: "Descreva o motivo do lançamento",
    path: ["description"],
  });
export type CreateEmployeeLedgerEntryInput = z.infer<typeof createEmployeeLedgerEntrySchema>;

export const confirmEmployeeLedgerEntrySchema = z.object({
  entryId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  selfieUrl: z.string().trim().url("Selfie obrigatória"),
});
export type ConfirmEmployeeLedgerEntryInput = z.infer<typeof confirmEmployeeLedgerEntrySchema>;

export const setHourlyRateSchema = z.object({
  userId: z.string().trim().min(1),
  hourlyRate: z.coerce.number().min(0, "Informe um valor válido"),
});
export type SetHourlyRateInput = z.infer<typeof setHourlyRateSchema>;

export const registerHourlyPaymentSchema = z.object({
  userId: z.string().trim().min(1),
  from: z.string().trim().min(1, "Informe o início do período"),
  to: z.string().trim().min(1, "Informe o fim do período"),
  /** Valor fixo somado ao pagamento por horas (ex.: passagem) — mesmo
   *  lançamento, mesma confirmação por selfie, em vez de um "Outro" à parte. */
  transportAmount: z.coerce.number().min(0, "Informe um valor válido").optional().default(0),
});
export type RegisterHourlyPaymentInput = z.infer<typeof registerHourlyPaymentSchema>;
