/**
 * Desconto automático de combo "capinha + película de hidrogel".
 *
 * Regra: cada par formado por 1 capinha e 1 película de hidrogel na mesma
 * venda desconta um valor fixo. 2 capinhas + 2 hidrogéis = 2 combos. A conta
 * é `MÍNIMO(capinhas, hidrogéis) × valor`.
 *
 * As palavras-chave NÃO ficam fixas aqui de propósito — a empresa edita em
 * Configurações > Descontos, porque o catálogo muda (nome novo de fornecedor,
 * linha nova de película) sem que ninguém precise mexer em código. Este
 * módulo só sabe aplicar o que estiver configurado; os valores iniciais estão
 * em `DEFAULT_COMBO_DISCOUNT_SETTINGS`.
 *
 * Diferente de `seller-discount-rules.ts`, que também cruza capinha com
 * película: lá é o teto de um desconto que o VENDEDOR digita à mão, só nas
 * películas 3D. Aqui é automático e exclui justamente as 3D. As duas regras
 * convivem na mesma venda sem se sobrepor.
 */

export type ComboDiscountSettings = {
  /** Nome do produto precisa conter uma destas palavras pra contar como capinha. */
  capinhaKeywords: string[];
  /** Nome do produto precisa conter uma destas palavras pra contar como película de hidrogel. */
  hidrogelKeywords: string[];
  /** Se o nome contiver qualquer uma destas, o item não entra no combo — nem como capinha, nem como película. */
  excludeKeywords: string[];
  /** Desconto em R$ por combo formado. */
  amountPerCombo: number;
};

export const DEFAULT_COMBO_DISCOUNT_SETTINGS: ComboDiscountSettings = {
  capinhaKeywords: ["capinha", "capa"],
  // "hidrogél" com acento cai em "hidrogel" na normalização, então uma
  // palavra só cobre as duas grafias.
  hidrogelKeywords: ["hidrogel"],
  excludeKeywords: ["3d", "vidro", "cerâmica"],
  amountPerCombo: 15,
};

/** Minúsculas e sem acento — "Película Hidrogél" e "PELICULA HIDROGEL" viram a mesma coisa. */
export function normalizeProductText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Casa a palavra inteira, não pedaço de palavra. Sem isso "capa" bateria em
 * "Capacete" e "Capacitor" — falso positivo que daria desconto errado no
 * balcão. Palavra composta ("capa flip") funciona igual: o limite vale nas
 * pontas do termo inteiro.
 */
function containsKeyword(normalizedName: string, keyword: string): boolean {
  const normalizedKeyword = normalizeProductText(keyword);
  if (!normalizedKeyword) return false;
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeForRegex(normalizedKeyword)}([^a-z0-9]|$)`);
  return pattern.test(normalizedName);
}

function matchesAny(normalizedName: string, keywords: string[]): boolean {
  return keywords.some((keyword) => containsKeyword(normalizedName, keyword));
}

export type ComboItemKind = "capinha" | "hidrogel" | null;

/**
 * Classifica um produto pelo nome. A exclusão vence sempre: "Película 3D
 * Hidrogel" (existe no catálogo) não vale combo, mesmo contendo "hidrogel".
 */
export function classifyComboItem(
  productName: string,
  settings: ComboDiscountSettings
): ComboItemKind {
  const normalized = normalizeProductText(productName);
  if (!normalized) return null;
  if (matchesAny(normalized, settings.excludeKeywords)) return null;
  if (matchesAny(normalized, settings.hidrogelKeywords)) return "hidrogel";
  if (matchesAny(normalized, settings.capinhaKeywords)) return "capinha";
  return null;
}

export type ComboDiscountLine = {
  name: string;
  quantity: number;
};

export type ComboDiscountResult = {
  /** Pares formados — `MÍNIMO(capinhas, hidrogéis)`. */
  combos: number;
  /** Desconto em R$ (`combos × amountPerCombo`), antes de qualquer teto de total. */
  amount: number;
  capinhaUnits: number;
  hidrogelUnits: number;
};

const EMPTY_RESULT: ComboDiscountResult = {
  combos: 0,
  amount: 0,
  capinhaUnits: 0,
  hidrogelUnits: 0,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Conta por UNIDADE, não por linha do carrinho: uma linha "Capinha × 3" vale
 * 3 capinhas. Usado no PDV (ao vivo) e no servidor (valor que vai pro banco)
 * — precisa dar o mesmo número nos dois lugares, então não recebe nada além
 * das linhas e das configurações.
 */
export function computeComboDiscount(
  lines: ComboDiscountLine[],
  settings: ComboDiscountSettings
): ComboDiscountResult {
  if (settings.amountPerCombo <= 0) return EMPTY_RESULT;

  let capinhaUnits = 0;
  let hidrogelUnits = 0;

  for (const line of lines) {
    const quantity = Number.isFinite(line.quantity) ? Math.max(0, Math.trunc(line.quantity)) : 0;
    if (quantity === 0) continue;
    const kind = classifyComboItem(line.name, settings);
    if (kind === "capinha") capinhaUnits += quantity;
    else if (kind === "hidrogel") hidrogelUnits += quantity;
  }

  const combos = Math.min(capinhaUnits, hidrogelUnits);
  return {
    combos,
    amount: round2(combos * settings.amountPerCombo),
    capinhaUnits,
    hidrogelUnits,
  };
}

function parseKeywordList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  // Lista vazia é intenção legítima (ex.: zerar as exclusões), então não cai
  // no fallback — só um valor de tipo errado cai.
  return cleaned;
}

/**
 * Lê `Tenant.comboDiscountSettings` (JSON livre, mesma convenção de
 * `attendanceSettings`). Qualquer campo ausente ou com tipo errado volta pro
 * padrão — uma configuração corrompida nunca deve derrubar o PDV, no máximo
 * volta a valer o comportamento inicial.
 */
export function parseComboDiscountSettings(value: unknown): ComboDiscountSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_COMBO_DISCOUNT_SETTINGS;
  }
  const raw = value as Record<string, unknown>;
  const amount = Number(raw.amountPerCombo);

  return {
    capinhaKeywords: parseKeywordList(
      raw.capinhaKeywords,
      DEFAULT_COMBO_DISCOUNT_SETTINGS.capinhaKeywords
    ),
    hidrogelKeywords: parseKeywordList(
      raw.hidrogelKeywords,
      DEFAULT_COMBO_DISCOUNT_SETTINGS.hidrogelKeywords
    ),
    excludeKeywords: parseKeywordList(
      raw.excludeKeywords,
      DEFAULT_COMBO_DISCOUNT_SETTINGS.excludeKeywords
    ),
    amountPerCombo:
      Number.isFinite(amount) && amount >= 0
        ? round2(amount)
        : DEFAULT_COMBO_DISCOUNT_SETTINGS.amountPerCombo,
  };
}

/** Rótulo único do desconto — PDV, cupom e comprovante de troca usam este mesmo texto. */
export const COMBO_DISCOUNT_LABEL = "Desconto combo capinha + película";
