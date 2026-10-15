import { z } from "zod";

/** Todos os tipos do livro — espelha o enum `EmployeeLedgerType` do banco. */
export const EMPLOYEE_LEDGER_TYPES = [
  "ADVANCE",
  "PURCHASE",
  "HOURLY_PAYMENT",
  "OTHER",
  "COMMISSION_PAYMENT",
] as const;
export type EmployeeLedgerTypeValue = (typeof EMPLOYEE_LEDGER_TYPES)[number];

/**
 * Tipos que dá pra lançar à mão em "Registrar lançamento". Pagamento de
 * comissão fica de fora: o valor é sempre calculado pelo sistema, venda por
 * venda (ver `commission-payment-service.ts`).
 */
export const MANUAL_EMPLOYEE_LEDGER_TYPES = ["ADVANCE", "PURCHASE", "HOURLY_PAYMENT", "OTHER"] as const;
export type ManualEmployeeLedgerTypeValue = (typeof MANUAL_EMPLOYEE_LEDGER_TYPES)[number];

export const EMPLOYEE_LEDGER_TYPE_LABELS: Record<EmployeeLedgerTypeValue, string> = {
  ADVANCE: "Adiantamento de salário",
  PURCHASE: "Compra de mercadoria",
  HOURLY_PAYMENT: "Pagamento por horas",
  OTHER: "Outro (lançamento livre)",
  COMMISSION_PAYMENT: "Pagamento de comissão",
};

/**
 * Desconto de colaborador em mercadoria: quem lança (o próprio colaborador ou
 * Admin/Gerente) informa o preço cheio do produto, e o lançamento grava o
 * valor já com o desconto — é o que vai ser descontado no pagamento.
 */
export const EMPLOYEE_PURCHASE_DISCOUNT_PERCENT = 20;

export function employeePurchaseNetAmount(fullPrice: number) {
  return Math.round(fullPrice * (100 - EMPLOYEE_PURCHASE_DISCOUNT_PERCENT)) / 100;
}

export const createEmployeeLedgerEntrySchema = z
  .object({
    userId: z.string().trim().min(1, "Selecione o colaborador"),
    type: z.enum(MANUAL_EMPLOYEE_LEDGER_TYPES),
    amount: z.coerce.number().positive("Informe um valor maior que zero"),
    description: z.string().trim().optional().or(z.literal("")),
  })
  .refine((data) => data.type !== "OTHER" || data.description, {
    message: "Descreva o motivo do lançamento",
    path: ["description"],
  });
export type CreateEmployeeLedgerEntryInput = z.infer<typeof createEmployeeLedgerEntrySchema>;

/**
 * Tipos que o próprio colaborador lança na tela Lançamentos — só o que ele
 * pegou da loja (dívida dele), nunca o que a loja deve a ele.
 */
export const SELF_SERVICE_EMPLOYEE_LEDGER_TYPES = ["PURCHASE", "ADVANCE"] as const;

/** Lançamento pelo próprio colaborador — selfie e descrição obrigatórias. */
export const createSelfServiceLedgerEntrySchema = z.object({
  userId: z.string().trim().min(1, "Selecione seu nome"),
  type: z.enum(SELF_SERVICE_EMPLOYEE_LEDGER_TYPES),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  description: z.string().trim().min(1, "Descreva o que você pegou"),
  selfieUrl: z.string().trim().url("Selfie obrigatória"),
});
export type CreateSelfServiceLedgerEntryInput = z.infer<typeof createSelfServiceLedgerEntrySchema>;

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
