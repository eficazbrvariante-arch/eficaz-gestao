import { z } from "zod";

export const EMPLOYEE_LEDGER_TYPES = ["ADVANCE", "PURCHASE"] as const;
export type EmployeeLedgerTypeValue = (typeof EMPLOYEE_LEDGER_TYPES)[number];

export const EMPLOYEE_LEDGER_TYPE_LABELS: Record<EmployeeLedgerTypeValue, string> = {
  ADVANCE: "Adiantamento de salário",
  PURCHASE: "Compra de mercadoria",
};

export const createEmployeeLedgerEntrySchema = z.object({
  userId: z.string().trim().min(1, "Selecione o colaborador"),
  type: z.enum(EMPLOYEE_LEDGER_TYPES),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  description: z.string().trim().optional().or(z.literal("")),
});
export type CreateEmployeeLedgerEntryInput = z.infer<typeof createEmployeeLedgerEntrySchema>;
