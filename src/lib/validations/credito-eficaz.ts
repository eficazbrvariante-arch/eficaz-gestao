import { z } from "zod";

/**
 * Envio único da solicitação (mesmo espírito de `submitProtecaoEficazSchema`
 * — um formulário, um clique, sem burocracia de várias etapas). Os três
 * documentos já foram enviados ao Blob privado antes do submit (ver
 * `PrivateDocumentUploadField`/`SelfieCaptureField` na tela) — aqui só
 * chegam os pathnames. Dados de trabalho e comprovante sempre obrigatórios
 * (decisão do dono, sem exceção pra autônomo).
 */
export const submitCreditoEficazApplicationSchema = z.object({
  occupation: z.string().trim().min(1, "Informe sua função/cargo.").max(120),
  workplaceName: z.string().trim().min(1, "Informe o nome do local de trabalho.").max(120),
  workplaceAddress: z.string().trim().min(1, "Informe o endereço do trabalho.").max(200),
  workplaceTenure: z.string().trim().min(1, "Informe há quanto tempo trabalha lá.").max(60),
  income: z.coerce.number().min(0).optional(),
  bestDueDay: z.coerce.number().int().min(1).max(28).optional(),
  additionalNotes: z.string().trim().max(500).optional().or(z.literal("")),
  idDocumentPathname: z.string().trim().min(1, "Envie o documento de identificação."),
  residenceProofPathname: z.string().trim().min(1, "Envie o comprovante de residência."),
  selfiePathname: z.string().trim().min(1, "Envie a selfie de confirmação."),
  employmentProofPathname: z.string().trim().min(1, "Envie o comprovante de trabalho."),
  pin: z.string().regex(/^\d{4}$/, "O PIN precisa ter exatamente 4 dígitos."),
  termsAccepted: z.literal(true, { message: "Aceite os termos para continuar." }),
});
export type SubmitCreditoEficazApplicationInput = z.infer<typeof submitCreditoEficazApplicationSchema>;
export type SubmitCreditoEficazApplicationFormValues = z.input<typeof submitCreditoEficazApplicationSchema>;

/**
 * Versão vigente dos termos do Crédito Eficaz — mudar aqui é lançar uma versão nova, nunca reescrever o texto de uma aceita.
 * v2 (11/09/2026): passa a informar o acréscimo sobre compras no crédito.
 */
export const CREDITO_EFICAZ_TERMS_VERSION = "v2";

export const approveCreditoEficazApplicationSchema = z.object({
  limitAmount: z.coerce.number().positive("Informe um limite maior que zero."),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  /** Onda/lote de entrada no programa (Adendo) — texto livre, opcional. */
  wave: z.string().trim().max(60).optional().or(z.literal("")),
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

/** Teto global de exposição (Adendo) — string vazia desliga a trava (`null`). */
export const setCreditoEficazExposureLimitSchema = z.object({
  limit: z
    .union([z.literal(""), z.coerce.number().min(0, "O teto não pode ser negativo.")])
    .transform((v) => (v === "" ? null : v)),
});
export type SetCreditoEficazExposureLimitInput = z.infer<typeof setCreditoEficazExposureLimitSchema>;
export type SetCreditoEficazExposureLimitFormValues = z.input<typeof setCreditoEficazExposureLimitSchema>;

export const setCreditoEficazMaxInstallmentsSchema = z.object({
  maxInstallments: z.coerce
    .number()
    .int()
    .min(1, "Mínimo 1 parcela.")
    .max(12, "Máximo 12 parcelas."),
});
export type SetCreditoEficazMaxInstallmentsInput = z.infer<typeof setCreditoEficazMaxInstallmentsSchema>;

/** Acréscimo (%) sobre a parte paga no Crédito Eficaz — 0 desliga. */
export const setCreditoEficazSurchargePercentSchema = z.object({
  percent: z.coerce
    .number({ message: "Informe o acréscimo em %." })
    .min(0, "O acréscimo não pode ser negativo.")
    .max(100, "O acréscimo máximo é 100%."),
});
export type SetCreditoEficazSurchargePercentInput = z.infer<typeof setCreditoEficazSurchargePercentSchema>;

// ---------------------------------------------------------------------------
// Crédito automático por convênio
// ---------------------------------------------------------------------------

/**
 * Configuração do crédito automático de um convênio. Todo campo é
 * opcional: a tela manda só o que o Admin mexeu, e nada tem valor cravado
 * no código — os padrões vivem no banco (ver `ConvenioCreditPolicy`).
 */
export const convenioCreditPolicySchema = z.object({
  enabled: z.boolean().optional(),
  defaultLimitAmount: z.coerce
    .number()
    .min(0, "O limite inicial não pode ser negativo.")
    .max(100000, "Limite inicial acima do teto permitido (R$ 100.000).")
    .optional(),
  surchargePercent: z.coerce
    .number()
    .min(0, "O acréscimo não pode ser negativo.")
    .max(100, "O acréscimo máximo é 100%.")
    .optional(),
  installmentCount: z.coerce
    .number()
    .int()
    .min(1, "Mínimo 1 parcela.")
    .max(12, "Máximo 12 parcelas.")
    .optional(),
  installmentIntervalDays: z.coerce
    .number()
    .int()
    .min(1, "Mínimo 1 dia entre parcelas.")
    .max(180, "Máximo 180 dias entre parcelas.")
    .optional(),
  bonusEnabled: z.boolean().optional(),
  bonusPercent: z.coerce
    .number()
    .min(0, "O bônus não pode ser negativo.")
    .max(100, "O bônus máximo é 100% da parcela.")
    .optional(),
  autoLimitCap: z.coerce
    .number()
    .min(0, "O teto não pode ser negativo.")
    .max(100000, "Teto acima do máximo permitido (R$ 100.000).")
    .optional(),
  blockOnOverdue: z.boolean().optional(),
  campaignEnabled: z.boolean().optional(),
  campaignDayOfMonth: z.coerce
    .number()
    .int()
    .min(1, "Escolha um dia entre 1 e 28.")
    .max(28, "Escolha um dia entre 1 e 28 (evita problema em mês curto).")
    .optional(),
});
export type ConvenioCreditPolicyInput = z.infer<typeof convenioCreditPolicySchema>;
export type ConvenioCreditPolicyFormValues = z.input<typeof convenioCreditPolicySchema>;

/**
 * Alteração de limite em massa. `convenioId` altera todos os clientes com
 * limite daquele convênio; `customerIds` altera só o grupo escolhido. Um
 * dos dois, nunca os dois.
 */
export const bulkCreditoEficazLimitSchema = z
  .object({
    convenioId: z.string().trim().min(1).optional(),
    customerIds: z.array(z.string().trim().min(1)).optional(),
    newLimit: z.coerce
      .number()
      .min(0, "O limite não pode ser negativo.")
      .max(100000, "Limite acima do teto permitido (R$ 100.000)."),
    note: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((data) => Boolean(data.convenioId) !== Boolean(data.customerIds?.length), {
    message: "Escolha um convênio OU uma lista de clientes.",
  });
export type BulkCreditoEficazLimitInput = z.infer<typeof bulkCreditoEficazLimitSchema>;
export type BulkCreditoEficazLimitFormValues = z.input<typeof bulkCreditoEficazLimitSchema>;

/** Mês de referência da campanha de pontualidade — `AAAA-MM`. */
export const creditoEficazCampaignSchema = z.object({
  convenioId: z.string().trim().min(1),
  referenceMonth: z.string().regex(/^\d{4}-\d{2}$/, "Informe o mês no formato AAAA-MM."),
});
export type CreditoEficazCampaignInput = z.infer<typeof creditoEficazCampaignSchema>;
