/**
 * Codificador Code 128 (subconjuntos B e C) sem dependência externa — o
 * formato que qualquer leitor de código de barras de balcão lê, usado nas
 * etiquetas do código interno (`INT-000001`). O subconjunto B cobre o ASCII
 * imprimível (letras, números, hífen); trechos com 4+ dígitos no fim (ou 6+
 * no meio) mudam pro subconjunto C, que guarda 2 dígitos por símbolo e deixa
 * o código de barras bem mais curto — o que importa numa etiqueta de 33mm.
 */

/** Larguras barra/espaço/barra/... de cada símbolo (0 a 106), em módulos. */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

const CODE_C = 99;
const CODE_B = 100;
const START_B = 104;
const START_C = 105;
const STOP = 106;

export class Code128Error extends Error {}

function isDigit(text: string, index: number) {
  const code = text.charCodeAt(index);
  return code >= 48 && code <= 57;
}

function digitRun(text: string, from: number) {
  let length = 0;
  while (from + length < text.length && isDigit(text, from + length)) length += 1;
  return length;
}

/**
 * Valores dos símbolos do código, já com início, dígito verificador e
 * parada. Lança `Code128Error` se o texto tiver caractere fora do ASCII
 * imprimível (acento, emoji...) — o subconjunto B não tem como representar.
 */
export function encodeCode128(text: string): number[] {
  if (text.length === 0) throw new Code128Error("Código vazio.");
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 32 || code > 126) {
      throw new Code128Error(
        `O caractere "${text[index]}" não pode ser impresso em código de barras.`
      );
    }
  }

  const values: number[] = [];
  const leadingDigits = digitRun(text, 0);
  let set: "B" | "C" =
    leadingDigits >= 4 || (leadingDigits === text.length && leadingDigits % 2 === 0)
      ? "C"
      : "B";
  values.push(set === "C" ? START_C : START_B);

  let index = 0;
  while (index < text.length) {
    const run = digitRun(text, index);
    if (set === "C") {
      if (run >= 2) {
        values.push(Number(text.slice(index, index + 2)));
        index += 2;
      } else {
        values.push(CODE_B);
        set = "B";
      }
      continue;
    }

    const reachesEnd = index + run === text.length;
    if (run >= 6 || (run >= 4 && reachesEnd)) {
      // Número ímpar de dígitos: o primeiro vai ainda no B, pro resto fechar em pares.
      if (run % 2 === 1) {
        values.push(text.charCodeAt(index) - 32);
        index += 1;
      }
      values.push(CODE_C);
      set = "C";
      continue;
    }

    values.push(text.charCodeAt(index) - 32);
    index += 1;
  }

  const checksum =
    values.reduce((sum, value, position) => sum + value * Math.max(position, 1), 0) % 103;
  values.push(checksum, STOP);
  return values;
}

/** Barras do código (posição e largura em módulos, sem zona de silêncio). */
export function code128Bars(text: string): {
  bars: { x: number; width: number }[];
  totalModules: number;
} {
  const bars: { x: number; width: number }[] = [];
  let x = 0;
  for (const value of encodeCode128(text)) {
    const pattern = PATTERNS[value];
    for (let index = 0; index < pattern.length; index += 1) {
      const width = Number(pattern[index]);
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    }
  }
  return { bars, totalModules: x };
}

export { PATTERNS as CODE128_PATTERNS };
