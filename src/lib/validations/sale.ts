import { z } from "zod";

export const saleItemSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().optional().or(z.literal("")),
  quantity: z.coerce.number().int().positive("Quantidade deve ser maior que zero"),
  /** Desconto concedido só neste item (R$), não na nota inteira. */
  discount: z.coerce.number().min(0).default(0),
});

export const salePaymentSchema = z.object({
  method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "STORE_CREDIT", "FIADO"]),
  amount: z.coerce.number().positive(),
});

export const createSaleSchema = z.object({
  customerId: z.string().trim().optional().or(z.literal("")),
  /** Quem realizou a venda — sempre exigido, nunca inferido do usuário logado
   *  (que pode ser só quem opera o caixa). Revalidado no servidor contra o
   *  banco antes de gravar (ver `isSellerAssignable`). */
  sellerId: z.string().trim().min(1, "Selecione o vendedor"),
  /** Auxiliar opcional da venda (estrutura para comissão dividida no futuro). */
  assistantSellerId: z.string().trim().optional().or(z.literal("")),
  items: z.array(saleItemSchema).min(1, "Adicione pelo menos um produto"),
  /** Sem mínimo aqui — uma venda que fecha em R$0 (ex.: troca 100% grátis da
   *  Proteção Eficaz) não tem forma de pagamento nenhuma pra informar. A
   *  exigência de pelo menos uma forma quando o total é maior que zero fica
   *  em `createSale`, que é quem conhece o total (calculado a partir dos
   *  itens, nunca confiado do cliente). */
  payments: z.array(salePaymentSchema),
  /** Quanto o cliente entregou em dinheiro (para cálculo do troco). */
  cashReceived: z.coerce.number().min(0).optional(),
  /** Data prevista de pagamento do fiado — exigida só quando há pagamento
   *  com method "FIADO" (checado em `createSale`, não aqui: o valor mínimo
   *  válido depende de haver ou não parcela em fiado). `YYYY-MM-DD`. */
  fiadoDueDate: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
  /** Colaborador de Convênio Corporativo já validado no PDV (ver
   *  `validateConvenioCredentialAction`) — revalidado de novo aqui dentro de
   *  `createSale`, nunca aceito só porque o cliente diz que já validou. */
  convenioMemberId: z.string().trim().optional().or(z.literal("")),
  /** Cliente abriu mão do desconto de película pra ganhar a Proteção Eficaz
   *  (ver `Sale.protecaoEficazOptedIn`) — marcado manualmente pelo vendedor,
   *  só aparece no PDV quando o carrinho já tem capinha + película juntas. */
  protecaoEficazOptedIn: z.boolean().optional(),
  /** Número da venda original de uma Proteção Eficaz aprovada, quando o
   *  vendedor está processando a troca gratuita da película — revalidado
   *  em `createSale` (nunca confia só na checagem prévia do PDV). */
  protecaoEficazRedemptionSaleNumber: z.coerce.number().int().positive().optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const cancelSaleSchema = z.object({
  reason: z.string().trim().min(3, "Descreva o motivo do cancelamento"),
  /** Só é obrigatório quando a venda ainda não tem cliente vinculado. */
  customerId: z.string().trim().optional().or(z.literal("")),
});
export type CancelSaleInput = z.infer<typeof cancelSaleSchema>;
export type CancelSaleFormValues = z.input<typeof cancelSaleSchema>;

export const findSaleByNumberSchema = z.object({
  number: z.coerce.number().int().positive("Informe um número de cupom válido"),
});
export type FindSaleByNumberInput = z.infer<typeof findSaleByNumberSchema>;

export const reportSaleItemDefectSchema = z.object({
  saleItemId: z.string().trim().min(1, "Selecione o item com defeito"),
  quantity: z.coerce.number().int().positive("Informe a quantidade com defeito"),
  reason: z.string().trim().min(3, "Descreva o motivo do defeito"),
  photoUrls: z.array(z.string().trim().min(1)).min(1, "Adicione ao menos uma foto do defeito"),
  /** Só é obrigatório quando a venda ainda não tem cliente vinculado. */
  customerId: z.string().trim().optional().or(z.literal("")),
});
export type ReportSaleItemDefectInput = z.infer<typeof reportSaleItemDefectSchema>;
export type ReportSaleItemDefectFormValues = z.input<typeof reportSaleItemDefectSchema>;
