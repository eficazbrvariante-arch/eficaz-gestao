import { onlyDigits } from "@/lib/validations/order";

/**
 * Link que abre o WhatsApp já com uma mensagem preenchida. Usado por todo
 * ponto de contato de WhatsApp da loja pública (botão flutuante, rodapé,
 * confirmação de pedido, CTA de interesse no produto) — mesma limpeza de
 * dígitos e mesmo `encodeURIComponent` em todo lugar, sem reimplementar.
 */
export function buildWhatsappLink(phone: string, message: string): string {
  const digits = onlyDigits(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
