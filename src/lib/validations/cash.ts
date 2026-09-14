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

/**
 * Envio da contagem às cegas pelo Vendedor — só dinheiro (nunca vê o valor
 * esperado nem a diferença na tela) e as fotos dos comprovantes da
 * maquininha do período, pra o Admin comparar depois, de onde estiver.
 */
export const submitCashForReviewSchema = z.object({
  countedAmount: money,
  receiptPhotoUrls: z
    .array(z.string().url())
    .min(1, "Anexe pelo menos uma foto do comprovante da maquininha"),
  notes: z.string().trim().optional().or(z.literal("")),
});
export type SubmitCashForReviewInput = z.infer<typeof submitCashForReviewSchema>;
export type SubmitCashForReviewFormValues = z.input<typeof submitCashForReviewSchema>;

/**
 * Finalização do fechamento (só ADMIN) de um caixa enviado pra revisão —
 * além do dinheiro (já contado às cegas pelo Vendedor), o Admin confere
 * débito/crédito/Pix contra os comprovantes da maquininha e digita o valor
 * que de fato veio em cada forma, pra ver a diferença na hora.
 */
export const finalizeCashReviewSchema = z.object({
  registerId: z.string().trim().min(1),
  countedDebitAmount: money,
  countedCreditAmount: money,
  countedPixAmount: money,
  notes: z.string().trim().optional().or(z.literal("")),
});
export type FinalizeCashReviewInput = z.infer<typeof finalizeCashReviewSchema>;
export type FinalizeCashReviewFormValues = z.input<typeof finalizeCashReviewSchema>;

/**
 * Edição de um caixa já fechado (só ADMIN, ver `canEditClosedCashRegister`) —
 * corrige o valor conferido de cada forma e as observações, caso um erro de
 * lançamento só apareça depois (ex.: venda registrada na forma de pagamento
 * errada). O valor "esperado" de cada forma continua calculado pelo sistema,
 * não é editável aqui.
 */
export const editCashRegisterSchema = z.object({
  registerId: z.string().trim().min(1),
  countedAmount: money,
  countedDebitAmount: money,
  countedCreditAmount: money,
  countedPixAmount: money,
  notes: z.string().trim().optional().or(z.literal("")),
});
export type EditCashRegisterInput = z.infer<typeof editCashRegisterSchema>;
export type EditCashRegisterFormValues = z.input<typeof editCashRegisterSchema>;

/** Campos do formulário de sangria/suprimento, sem a regra cruzada de cupom/selfie. */
export const cashMovementBaseSchema = z.object({
  type: z.enum(["WITHDRAWAL", "SUPPLY"]),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  description: z.string().trim().min(3, "Descreva o motivo"),
  /** Quem está fazendo a movimentação (não necessariamente quem está logado). */
  performedById: z.string().trim().min(1, "Selecione quem está fazendo a movimentação"),
  /** Foto do cupom/nota da compra (sangria) ou do depósito (suprimento). */
  receiptPhotoUrl: z.string().url().optional().or(z.literal("")),
  /** Selfie de quem fez a sangria, quando não há cupom. */
  selfieUrl: z.string().url().optional().or(z.literal("")),
});

export const cashMovementSchema = cashMovementBaseSchema
  // Pedido do dono (14/09/2026): toda sangria exige o cupom; sem cupom, selfie.
  .refine((data) => data.type !== "WITHDRAWAL" || !!data.receiptPhotoUrl || !!data.selfieUrl, {
    message: "Na sangria, anexe a foto do cupom — ou, sem cupom, tire uma selfie.",
    path: ["receiptPhotoUrl"],
  });
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
export type CashMovementFormValues = z.input<typeof cashMovementSchema>;
