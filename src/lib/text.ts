/**
 * Normaliza texto para comparação: sem acentos, sem espaços nas pontas e em
 * minúsculas. Usado para casar bairros digitados pelo cliente com os cadastrados
 * ("Jardim América" casa com "jardim america").
 */
export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
