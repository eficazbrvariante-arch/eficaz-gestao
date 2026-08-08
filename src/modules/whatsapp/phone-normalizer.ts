export type NormalizeToE164Options = {
  /**
   * Assume Brasil (DDI 55) quando o número não tem DDI nenhum — certo para
   * texto digitado por um funcionário em `Customer.phone`/`whatsapp` (loja
   * brasileira, quase nunca digita o "+55"). Errado para números que já
   * chegam pelo webhook da Meta (`wa_id`), que sempre vêm com DDI real —
   * por isso o default é `false`.
   */
  assumeBrazilIfNoCountryCode?: boolean;
};

/**
 * Normaliza um telefone para E.164 sem "+" (ex.: "5511999998888").
 *
 * Só aplica lógica específica a números brasileiros (DDI 55): corrige a
 * ambiguidade conhecida da Meta com o nono dígito do celular — o `wa_id` às
 * vezes chega sem ele (`551199998888`, 12 dígitos) e o canônico moderno tem
 * 13 (`5511999998888`). Números de outros países são devolvidos só com os
 * dígitos, sem tentar adivinhar formato.
 *
 * Retorna `null` quando não há dígitos suficientes para ser um telefone.
 */
export function normalizeToE164(raw: string, options: NormalizeToE164Options = {}): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let withCountryCode = digits;
  if (
    options.assumeBrazilIfNoCountryCode &&
    !digits.startsWith("55") &&
    (digits.length === 10 || digits.length === 11)
  ) {
    withCountryCode = `55${digits}`;
  }

  if (withCountryCode.startsWith("55") && (withCountryCode.length === 12 || withCountryCode.length === 13)) {
    return fixBrazilianNinthDigit(withCountryCode);
  }

  return withCountryCode.length >= 8 ? withCountryCode : null;
}

/** `digits`: "55" + DDD (2) + assinante (8 ou 9 dígitos). */
function fixBrazilianNinthDigit(digits: string): string {
  const ddd = digits.slice(2, 4);
  const subscriber = digits.slice(4);

  if (subscriber.length === 9) return digits;

  // Celulares brasileiros começam em 6-9; fixos não ganham o nono dígito.
  const isMobileRange = /^[6-9]/.test(subscriber);
  return isMobileRange ? `55${ddd}9${subscriber}` : digits;
}

/** Compara dois telefones já normalizando os dois lados. */
export function phoneNumbersMatch(a: string, b: string, options: NormalizeToE164Options = {}): boolean {
  const normalizedA = normalizeToE164(a, options);
  const normalizedB = normalizeToE164(b, options);
  return normalizedA !== null && normalizedA === normalizedB;
}
