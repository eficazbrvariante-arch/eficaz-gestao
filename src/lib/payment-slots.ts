export type PaymentMethod = "CASH" | "PIX" | "DEBIT" | "CREDIT" | "STORE_CREDIT" | "FIADO";

export type PaymentSlotKey =
  | "cash"
  | "credit"
  | "debit"
  | "pix_key"
  | "pix_machine"
  | "store_credit"
  | "fiado";

/**
 * Formas de pagamento disponíveis pra vendas novas do PDV e pro acerto
 * financeiro da Assistência Técnica — a mesma lista nos dois lugares, pra
 * não ter duas fontes de verdade divergindo com o tempo. "Chave PIX" e
 * "PIX Maquininha" são só rótulos: os dois gravam `method: "PIX"` (mesmo
 * método já existente, sem migração de banco). "Mercado Pago" existiu aqui
 * como um terceiro rótulo pro mesmo PIX — removido das formas disponíveis
 * pra vendas/recebimentos novos (vendas antigas continuam gravadas como
 * PIX, intactas — nunca foi um valor de enum próprio).
 */
export const PAYMENT_SLOTS: { key: PaymentSlotKey; label: string; method: PaymentMethod }[] = [
  { key: "cash", label: "Dinheiro", method: "CASH" },
  { key: "credit", label: "Cartão de Crédito", method: "CREDIT" },
  { key: "debit", label: "Cartão de Débito", method: "DEBIT" },
  { key: "pix_key", label: "Chave PIX", method: "PIX" },
  { key: "pix_machine", label: "PIX Maquininha", method: "PIX" },
  { key: "store_credit", label: "Crédito de loja", method: "STORE_CREDIT" },
  { key: "fiado", label: "Fiado", method: "FIADO" },
];

export type PaymentAmounts = Record<PaymentSlotKey, number>;

export const EMPTY_PAYMENT_AMOUNTS: PaymentAmounts = {
  cash: 0,
  credit: 0,
  debit: 0,
  pix_key: 0,
  pix_machine: 0,
  store_credit: 0,
  fiado: 0,
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Soma de todos os slots — "pago" no PDV, "pagamentos informados" na OS. */
export function sumPaymentAmounts(amounts: PaymentAmounts) {
  return round2(PAYMENT_SLOTS.reduce((sum, slot) => sum + (amounts[slot.key] || 0), 0));
}

/** Payload pronto pra mandar pro servidor: só as formas realmente usadas. */
export function toPaymentEntries(amounts: PaymentAmounts) {
  return PAYMENT_SLOTS.filter((slot) => (amounts[slot.key] || 0) > 0).map((slot) => ({
    method: slot.method,
    amount: amounts[slot.key],
  }));
}
