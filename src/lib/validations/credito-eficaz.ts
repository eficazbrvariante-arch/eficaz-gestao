import { z } from "zod";

/**
 * Envio único da solicitação (mesmo espírito de `submitProtecaoEficazSchema`
 * — um formulário, um clique, sem burocracia de várias etapas). Os três
 * documentos já foram enviados ao Blob privado antes do submit (ver
 * `PrivateDocumentUploadField`/`SelfieCaptureField` na tela) — aqui só
 * chegam os pathnames.
 */
export const submitCreditoEficazApplicationSchema = z.object({
  occupation: z.string().trim().max(120).optional().or(z.literal("")),
  income: z.coerce.number().min(0).optional(),
  bestDueDay: z.coerce.number().int().min(1).max(28).optional(),
  additionalNotes: z.string().trim().max(500).optional().or(z.literal("")),
  idDocumentPathname: z.string().trim().min(1, "Envie o documento de identificação."),
  residenceProofPathname: z.string().trim().min(1, "Envie o comprovante de residência."),
  selfiePathname: z.string().trim().min(1, "Envie a selfie de confirmação."),
  pin: z.string().regex(/^\d{4}$/, "O PIN precisa ter exatamente 4 dígitos."),
  termsAccepted: z.literal(true, { message: "Aceite os termos para continuar." }),
});
export type SubmitCreditoEficazApplicationInput = z.infer<typeof submitCreditoEficazApplicationSchema>;
export type SubmitCreditoEficazApplicationFormValues = z.input<typeof submitCreditoEficazApplicationSchema>;

/** Versão vigente dos termos do Crédito Eficaz — mudar aqui é lançar uma versão nova, nunca reescrever o texto de uma aceita. */
export const CREDITO_EFICAZ_TERMS_VERSION = "v1";

export const approveCreditoEficazApplicationSchema = z.object({
  limitAmount: z.coerce.number().positive("Informe um limite maior que zero."),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type ApproveCreditoEficazApplicationInput = z.infer<typeof approveCreditoEficazApplicationSchema>;

export const rejectCreditoEficazApplicationSchema = z.object({
  reason: z.string().trim().min(1, "Informe o motivo da recusa."),
});
export type RejectCreditoEficazApplicationInput = z.infer<typeof rejectCreditoEficazApplicationSchema>;

export const requestCreditoEficazInfoSchema = z.object({
  note: z.string().trim().min(1, "Descreva o que falta pro cliente complementar."),
});
export type RequestCreditoEficazInfoInput = z.infer<typeof requestCreditoEficazInfoSchema>;

export const setCreditoEficazLimitSchema = z.object({
  newLimit: z.coerce.number().min(0, "O limite não pode ser negativo."),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type SetCreditoEficazLimitInput = z.infer<typeof setCreditoEficazLimitSchema>;

export const blockCreditoEficazSchema = z.object({
  reason: z.string().trim().min(1, "Informe o motivo do bloqueio."),
});
export type BlockCreditoEficazInput = z.infer<typeof blockCreditoEficazSchema>;

export const registerCreditoEficazPaymentSchema = z.object({
  usageId: z.string().trim().min(1),
  amount: z.coerce.number().positive("Informe um valor maior que zero."),
  paidAt: z.string().trim().min(1, "Informe a data do pagamento."),
  method: z.string().trim().min(1, "Informe a forma de recebimento."),
});
export type RegisterCreditoEficazPaymentInput = z.infer<typeof registerCreditoEficazPaymentSchema>;
